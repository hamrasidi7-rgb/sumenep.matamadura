# Autentikasi dan keamanan Admin (Fase 3)

> **Catatan 24 November 2026:** database CMS dipindahkan dari PostgreSQL ke **MariaDB Hostinger** dan media dari Cloudflare R2 ke **disk Hostinger**. Bagian dokumen ini yang menyebut PostgreSQL, Neon, role/`pg_*`, atau R2 berlaku untuk versi Fase 2–4 (`prisma/postgresql/`). Padanan MariaDB dan alasannya: [10-migrasi-mariadb.md](10-migrasi-mariadb.md).

Status per 21 November 2026: selesai dan teruji di lingkungan lokal yang terisolasi. Branch `backend/fase-3-auth` (dari `c08d8f8`), belum di-push dan belum di-deploy. Situs publik tidak berubah.

CMS hanya punya satu akun, Admin. Tidak ada peran lain, tidak ada pendaftaran, dan tidak ada halaman atau API untuk membuat akun. Akun dibuat dan dipulihkan lewat CLI (lihat [05-backend-fondasi.md](05-backend-fondasi.md), bagian 8).

## 1. Arsitektur

```
Browser ──► src/proxy.ts ──► halaman /admin · Server Action · Route Handler /api/admin
            (saringan awal)       │
                                  ▼
                       requireAdmin() / requireAdminApi()     ← src/server/auth/next.ts, api.ts
                       (sesi dicek di DATABASE setiap kali)
                                  │
                                  ▼
                 login · sessions · attempts · password-change  ← src/server/auth/*
                                  │
                                  ▼
       PostgreSQL: admin_user · admin_session · login_attempt · activity_log
```

| Lapis | Tugas | Bila gagal |
| --- | --- | --- |
| `src/proxy.ts`, hanya untuk `/admin/**` dan `/api/admin/**` | <ul><li>Permintaan yang mengubah data wajib membawa `Origin` situs ini dan `Sec-Fetch-Site: same-origin`.</li><li>Cookie sesi minimal harus berformat token.</li><li>Memasang CSP ketat dengan *nonce* per permintaan, `noindex`, `no-store`, dan larangan dibingkai.</li><li>Memperpanjang umur cookie saat halaman dibuka.</li></ul> | 403, 401, atau redirect ke `/admin/login?next=…` |
| `requireAdmin()` | Dipanggil oleh setiap halaman, layout, dan Server Action CMS. Memeriksa sesi di database: ada, belum dicabut, belum kedaluwarsa, dan tidak lebih tua dari penggantian password terakhir. Aktivitas yang sah memperpanjang sesi | redirect ke login (`pesan=berakhir` bila cookie sudah tidak berlaku) |
| `requireAdminApi()` | Hal yang sama untuk Route Handler. Untuk metode selain GET, Origin juga diperiksa | 401/403 JSON |
| `assertSameOrigin()` | Baris pertama setiap Server Action. Next.js sendiri meloloskan permintaan tanpa `Origin`; pemeriksaan ini tidak | error, aksi tidak dijalankan |

Proxy sengaja tidak dijadikan satu-satunya penjaga. Bila matcher berubah atau aksi berpindah rute, pemeriksaan database di setiap aksi tetap berjalan.

### Berkas

| Berkas | Isi |
| --- | --- |
| `src/proxy.ts` | Saringan awal + header keamanan CMS |
| `src/server/auth/config.ts` | Semua angka kebijakan (8 jam, 5 kali, 15 menit, 10/IP, dll.) |
| `src/server/auth/cookie.ts`, `tokens.ts` | Nama/atribut cookie; token acak 32 byte, hash SHA-256 |
| `src/server/auth/sessions.ts` | Buat, validasi (+ perpanjang), cabut, daftar sesi |
| `src/server/auth/login.ts`, `attempts.ts`, `limiter.ts` | Alur login, pencatatan percobaan, penguncian, batas per IP, batas hash scrypt bersamaan |
| `src/server/auth/password-change.ts` | Ganti password + pencabutan sesi |
| `src/server/auth/origin.ts`, `client-ip.ts`, `redirect.ts` | CSRF/Origin, IP klien, redirect aman setelah login |
| `src/server/auth/next.ts`, `api.ts`, `messages.ts` | Penghubung ke Next.js (`requireAdmin`, cookie), penjaga API, pesan seragam |
| `src/server/validation/auth.ts` | Skema Zod login, ganti password, id sesi |
| `src/app/(admin)/…` | Layout CMS, `/admin/login`, `/admin` (dashboard), `/admin/akun`, Server Actions (`actions.ts`), 404 CMS |
| `src/app/api/admin/me`, `…/logout` | Route Handler contoh: data Admin aktif, logout untuk klien API |
| `src/components/admin/*` | Header CMS, tombol, kotak pesan, format waktu WIB |

## 2. Login

1. **Zod.** Email dirapikan (huruf kecil) dan password dibatasi 1–256 karakter. Input rusak dicatat sebagai `invalid_input` tanpa menyimpan teksnya, karena kolom email kadang berisi password yang salah ketik.
2. **Batas per IP.** 10 kegagalan dalam 15 menit membuat IP itu ditolak, bahkan dengan password benar. IP lain tidak terpengaruh. Selain itu, paling banyak 2 login dari satu IP diproses bersamaan.
3. **Batas server.** Paling banyak 2 hash scrypt berjalan bersamaan (sekitar 128 MiB per hash), dengan antrean maksimal 20. Lebih dari itu ditolak.
4. **Akun terkunci?** Bila ya, ditolak. Hash tiruan tetap dijalankan agar waktu respons sama.
5. **Password.** Bila salah, hitungan gagal bertambah (baris dikunci `SELECT … FOR UPDATE`). Kegagalan ke-5 berturut-turut mengunci akun selama **15 menit** dan tercatat di Activity Log (`auth.lockout`). Setelah kunci habis, hitungan mulai dari nol.
6. **Berhasil.**
   - Hitungan gagal di-nol-kan dan `last_login_at` diisi.
   - Hash diperbarui bila parameter scrypt sudah naik.
   - Cookie lama yang dibawa browser dicabut, untuk mencegah *session fixation*.
   - Sesi baru dibuat dan `auth.login` dicatat.
   - Catatan percobaan dan sesi yang lebih tua dari 30 hari dibersihkan.

**Pesan seragam.** Email salah, password salah, akun terkunci, dan IP dibatasi semuanya menghasilkan satu pesan: *"Login gagal. Periksa email dan password Anda. Setelah 5 kali gagal, login dikunci sementara (15 menit)."* Respons tidak pernah memberi tahu apakah sebuah email adalah email Admin.

Sesi yang sedang aktif **tidak** ikut keluar ketika akun dikunci. Penyerang yang menebak password tidak bisa memaksa Admin keluar.

## 3. Sesi

| Aturan | Implementasi |
| --- | --- |
| Token | 32 byte acak (base64url, 43 karakter). Cookie berisi token mentah; database hanya menyimpan SHA-256-nya |
| Cookie produksi | `__Host-sumenep_admin`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, tanpa `Domain`. Prefix `__Host-` membuat subdomain lain dari `matamaduranews.com` tidak bisa memasang atau menimpanya |
| Cookie development | `sumenep_admin_dev`, tanpa `Secure`, agar `http://localhost` bisa dipakai |
| Masa berlaku | **8 jam sejak aktivitas terakhir** (CHECK di database: `expires_at ≤ last_seen_at + 8 jam`) |
| Perpanjangan | Setiap akses sah ke halaman CMS atau API, paling sering sekali per 5 menit. Prefetch otomatis dari router tidak dihitung sebagai aktivitas |
| Logout | Sesi dicabut di database (`revoked_at`, `auth.logout`) dan cookie dihapus. Cookie lama tidak bisa dipakai lagi |
| Keluar dari semua perangkat | Semua sesi dicabut (`auth.logout_all`), termasuk perangkat ini |
| Cabut satu perangkat | Dari daftar sesi di `/admin/akun` (`auth.session_revoked`) |
| Ganti password | Wajib password lama. Semua sesi dicabut dan perangkat ini mendapat sesi baru dengan token baru (`auth.password_changed`). Sesi yang dibuat sebelum penggantian password terakhir juga ditolak saat validasi |
| Manipulasi cookie | Nilai yang bukan token ditolak sebelum menyentuh database. Token rekaan, yang diubah satu karakter, milik sesi yang dicabut, atau yang kedaluwarsa tidak cocok dengan hash mana pun |

## 4. CSRF dan header

- **Semua permintaan yang mengubah data** (Server Action, `POST /api/admin/*`) wajib punya `Origin` yang sama dengan host situs. Ini diperiksa di proxy dan diulang di aksi atau handler.
  - Origin dari situs lain, Origin kosong, dan `Origin: https://matamaduranews.com` (situs induk) ditolak 403.
  - Situs induk berstatus *same-site*. Untuk itu, cookie `SameSite=Lax` saja tidak cukup menahannya; pemeriksaan Origin dan `Sec-Fetch-Site` yang menahannya.
- `GET` tidak pernah mengubah data. Contohnya, `GET /api/admin/logout` menghasilkan 405.
- Tidak ada header CORS, sehingga halaman di origin lain tidak bisa membaca API CMS (diuji di browser).
- Header CMS:
  - `Content-Security-Policy`: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`. Semua `<script>` Next.js membawa nonce (diuji).
  - `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`.
  - Meta robots `noindex, nofollow, nocache`.

## 5. Rute CMS

| Rute | Metode | Tanpa sesi | Dengan sesi |
| --- | --- | --- | --- |
| `/admin/login` | GET | 200 (formulir) | 307 ke `/admin` (sekali, tanpa loop) |
| `/admin/login` (Server Action login) | POST | proses login | proses login (cookie lama dicabut) |
| `/admin` | GET | 307 ke `/admin/login` | 200 dashboard |
| `/admin/akun` | GET | 307 ke `/admin/login?next=%2Fadmin%2Fakun` | 200: profil, ganti password, sesi aktif |
| Server Actions: logout, keluar semua, cabut sesi, ganti password | POST | 401/403 | dijalankan setelah Origin dan sesi diperiksa |
| `/admin/<lainnya>` | GET | 307 ke login | 404 CMS |
| `/api/admin/me` | GET | 401 `{"error":"unauthorized"}` | 200 `{admin:{email,name,role:"ADMIN"}, session:{expiresAt}}` |
| `/api/admin/logout` | POST | 401, atau 403 bila Origin asing | 200, sesi dicabut, cookie dihapus |

## 6. Konfigurasi (env)

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `DATABASE_URL` | — | Role runtime (lihat docs/05). Satu-satunya kredensial database di server web |
| `ADMIN_ALLOWED_HOSTS` | kosong | Host tambahan yang dianggap "situs ini" untuk pemeriksaan Origin, dipisah koma. Diperlukan hanya bila proxy hosting tidak meneruskan host publik di `Host`/`X-Forwarded-Host` |
| `TRUSTED_PROXY_COUNT` | 1 | Jumlah proxy tepercaya yang menambahkan IP ke `X-Forwarded-For`. IP klien = entri ke-N dari kanan |
| `CLIENT_IP_HEADER` | kosong | Header IP yang tidak bisa dipalsukan klien, bila platform menyediakannya (misalnya `x-real-ip`) |

Nilai `TRUSTED_PROXY_COUNT`/`CLIENT_IP_HEADER` untuk Hostinger **harus diukur di deployment** (Fase 8). Lihat temuan 1 di bagian 9.

## 7. Panduan operasional Admin

**Pertama kali (dilakukan pemilik, bukan lewat chat).** Database development belum punya Admin. Jalankan sendiri di terminal:

```bash
npm run db:start
npm run admin:bootstrap -- --email <email-anda> --name "<Nama Anda>"   # password diketik dua kali, tidak tampil
npm run dev                                                           # lalu buka http://localhost:3200/admin/login
```

| Kebutuhan | Caranya |
| --- | --- |
| Masuk | `/admin/login`. Setelah login, Anda diarahkan ke halaman yang tadi diminta |
| Keluar | Tombol **Keluar** di kanan atas |
| Melihat perangkat yang sedang masuk | **Akun & Keamanan → Sesi aktif**: perangkat, IP, waktu masuk, aktivitas terakhir |
| Mengeluarkan satu perangkat | Tombol **Cabut** pada baris perangkat itu |
| Mengeluarkan semua perangkat | **Keluar dari semua perangkat** (perangkat ini ikut keluar) |
| Ganti password | **Akun & Keamanan → Ganti password**. Minimal 15 karakter; semua perangkat lain otomatis keluar |
| Terkunci setelah 5 kali salah | Tunggu 15 menit, atau operator menjalankan `npm run admin:recover -- unlock` |
| Lupa password | Operator: `npm run admin:recover -- reset-password` (semua sesi dicabut) |
| Perangkat hilang | Dari perangkat lain: **Keluar dari semua perangkat** lalu ganti password. Atau operator: `admin:recover -- revoke-sessions` |
| Memeriksa riwayat | Dashboard → **Aktivitas terbaru**: login, logout, penguncian, pencabutan sesi, ganti password, dan tindakan CLI. Catatan tidak bisa diubah atau dihapus |

Jangan pernah mengirim password lewat chat atau email. Gunakan password manager.

## 8. Hasil pengujian

Perintah:
- `npm test`: unit + database, memakai database sementara per run.
- `npm run test:e2e`:
  1. build produksi;
  2. menjalankan `next start` di port 3301 dengan database sementara dan Admin uji (password acak per run);
  3. menguji lewat HTTP dan Chrome headless.

| Rangkaian | Jumlah | Hasil |
| --- | --- | --- |
| Unit (`tests/unit`) | 32 (16 baru) | lulus |
| Database (`tests/db`) | 85 (24 baru: `09-auth-login`, `10-auth-sessions`) | lulus |
| End-to-end (`tests/e2e`) | 25 | lulus |
| Typecheck (aplikasi + alat) | — | lulus |
| `next build --webpack` | — | lulus |

Cakupan wajib Fase 3:

| Uji | Dibuktikan oleh |
| --- | --- |
| Login benar | db/09; e2e/02 (cookie `__Host-` HttpOnly, Secure, Lax, Path=/, sekitar 8 jam, tidak terbaca JavaScript) |
| Password salah | db/09; e2e/02 (pesan seragam, tanpa cookie, email tetap, password dikosongkan) |
| Lima kali gagal + penguncian | db/09 (termasuk 30 tebakan paralel); e2e/03 (lewat browser) |
| Login setelah masa kunci | db/09; e2e/03 |
| Sesi kedaluwarsa | db/10; e2e/03 (diarahkan ke login dengan "sesi berakhir", tanpa loop) |
| Perpanjangan sesi | db/10 (tiap 5 menit, bukan prefetch); e2e/03 |
| Logout | db/10; e2e/02 (sesi dicabut di DB, cookie lama ditolak) |
| Pencabutan sesi | db/10; e2e/02 (cabut perangkat lain dari daftar); CLI `admin:recover` |
| Keluar dari semua perangkat | db/10; e2e/02 |
| Ganti password | db/10; e2e/02 (validasi, sesi lain keluar, token perangkat ini diganti, password lama mati) |
| Akses tanpa login | e2e/01 (halaman 307 ke login, `next` terjaga) |
| API tanpa sesi | e2e/01 (401 JSON) |
| Manipulasi cookie | db/10; e2e/01 (sampah, rekaan, diubah satu karakter, terpotong, nama cookie lain) |
| Permintaan lintas origin | e2e/04 (rekaman Server Action login/logout dikirim ulang dari origin lain, tanpa Origin, dan dari situs induk → 403; API → 403; CORS tertutup) |
| Batas per IP | db/09; e2e/03 (10 kegagalan via HTTP → IP ditolak dengan password benar; IP lain bisa) |
| Tidak bisa membuat Admin kedua | Fase 2 (db/03) + e2e/01 (tidak ada rute pendaftaran; tetap satu Admin) |
| Tidak ada peran selain ADMIN | db/10 (tidak ada kolom peran/password lain); API melaporkan `role: "ADMIN"` |
| Tidak ada password/token mentah tersimpan | db/09 (seluruh tabel diperiksa) |

## 9. Temuan keamanan yang belum terselesaikan

1. **IP klien di belakang CDN Hostinger belum terverifikasi.** Bila header yang dipakai salah, ada dua kemungkinan:
   - semua pengunjung terlihat dari satu IP proxy, sehingga batas per IP berubah menjadi batas global (penyerang bisa menghalangi login Admin selama 15 menit);
   - IP bisa dipalsukan.

   Penguncian akun tetap berlaku apa pun hasilnya. Tindakan: ukur header di deployment uji (Fase 8), lalu isi `TRUSTED_PROXY_COUNT`/`CLIENT_IP_HEADER`.
2. **Penguncian bisa dipakai untuk mengganggu.** Siapa pun yang tahu email Admin bisa mengunci login 15 menit berulang kali. Sesi yang aktif tidak terpengaruh, dan `admin:recover -- unlock` tersedia. Mitigasi lanjutan: rahasiakan email login, tambahkan batas laju di edge (WAF/Cloudflare), dan pertimbangkan 2FA.
3. **Belum ada batas umur mutlak sesi.** Sesi bisa terus diperpanjang selama ada aktivitas. Usulan: batas 7 hari atau 24 jam. Perlu keputusan.
4. **Satu faktor (tanpa 2FA).** Password minimal 15 karakter, scrypt, dan penguncian sudah ada. TOTP bisa ditambahkan nanti, dengan persetujuan.
5. **Pemeriksaan Origin di balik proxy Hostinger.** Perlu dipastikan `Host`/`X-Forwarded-Host` berisi `sumenep.matamaduranews.com` (atau isi `ADMIN_ALLOWED_HOSTS`). Bila tidak, login akan ditolak 403. Ini mudah terlihat saat uji deployment.
6. **Batas paralel ada di memori proses.** Bila Hostinger menjalankan lebih dari satu instance, batas ini tidak dibagi antar-instance. Batas di database (per IP, penguncian) tetap berlaku.
7. **HSTS** belum diatur oleh aplikasi. Sebaiknya diatur di hosting/edge. Cookie `__Host-` memang hanya hidup di HTTPS.
8. **CSP mengizinkan `style-src 'unsafe-inline'`** (dibutuhkan atribut style React/Next). Risiko rendah; skrip tetap wajib nonce.
9. **Empat temuan `npm audit`.** Lihat bagian 10.

## 10. Temuan `npm audit` (dari Fase 2)

```
prisma@6.19.3 (devDependency)
└─ @prisma/config@6.19.3
   ├─ deepmerge-ts@7.1.5   GHSA-ggr8-5vv4-36mx  stack exhaustion saat menggabungkan objek rekursif (rentan < 8.0.0)
   └─ effect@3.21.0        GHSA-7589-6fvf-x4pw  ReDoS pada regex Schema.TemplateLiteral (rentan ≤ 3.22.0)
```

npm menghitung 4 temuan: `prisma`, `@prisma/config`, `deepmerge-ts`, dan `effect`. Semuanya berasal dari dua advisory di atas.

| Aspek | Penilaian |
| --- | --- |
| Di mana kodenya berjalan | Hanya di CLI Prisma (`prisma migrate`, `prisma generate`), di komputer operator dan saat build |
| Apakah ikut ke server web | **Tidak.** Aplikasi memakai runtime `@prisma/client/runtime/client.js` (engine `client`), yang tidak memuat `@prisma/config`. Sudah diperiksa: hanya `runtime/binary.js`, yang tidak kita pakai, yang mereferensikannya |
| Siapa yang mengendalikan input | Pengembang (file konfigurasi/skema proyek). Tidak ada input pengunjung atau penyerang yang sampai ke fungsi rentan |
| Risiko praktis | Rendah |
| Perbaikan resmi | `prisma@7.10.1`, yang merupakan **upgrade mayor** dan tidak disetujui |
| Opsi lain (perlu persetujuan) | `overrides` npm untuk `effect` ke 3.22.x terbaru (masih mayor 3), lalu uji CLI Prisma. `deepmerge-ts` hanya diperbaiki di 8.x (mayor), jadi tidak disarankan dipaksa |
| Keputusan Fase 3 | Tidak ada upgrade. Ditinjau ulang saat evaluasi Prisma 7, atau bila ada rilis 6.x yang memperbarui dependensinya |

## 11. Rekomendasi Fase 4 (CMS Artikel)

1. Semua Server Action artikel memakai pola yang sama: `assertSameOrigin()`, lalu `requireAdmin()`, lalu Zod. Ditambah optimistic locking dengan kolom `version`, dan `updateTag` sesuai [06-cache-seo.md](06-cache-seo.md).
2. Editor (TipTap) di halaman CMS dengan CSP nonce. Pastikan editor tidak membutuhkan `unsafe-eval`.
3. Pratinjau `/admin/pratinjau/[id]` di belakang `requireAdmin()`, dengan `noindex`.
4. Revisi, jadwal terbit, arsip, dan tempat sampah sesuai skema Fase 2, dengan uji E2E memakai runner yang sama.
5. Putuskan temuan 3 (batas mutlak sesi) dan 4 (2FA) sebelum produksi.
