# Backend CMS · Fase 2: Fondasi database

Status per 21 November 2026: fondasi selesai dan teruji di database lokal yang terisolasi. Branch `backend/fase-2-fondasi`, belum di-push, belum di-deploy. Website produksi tidak berubah.

Yang termasuk Fase 2: Prisma, skema, migrasi, aturan database (satu Admin, Activity Log append-only), bootstrap dan pemulihan Admin lewat CLI, seed kanal/rubrik, dan pengujian.

Yang belum: login dan sesi (Fase 3), CMS artikel dan editor (Fase 4), Media Library (Fase 6), dan integrasi ke halaman publik (Fase 8). Frontend publik masih membaca konten contoh dari `src/content/seed.ts`.

## 1. Arsitektur

| Bagian | Pilihan |
| --- | --- |
| Aplikasi | Next.js 16.4 (App Router), satu aplikasi untuk situs publik dan CMS |
| ORM | Prisma 6.19.3, `engineType = "client"` + driver adapter `@prisma/adapter-pg` |
| Database | PostgreSQL 16, khusus SUMENEP |
| Validasi | Zod 4 (CLI sekarang; Server Actions dan Route Handlers di Fase 3–4) |
| Password | scrypt bawaan Node (`node:crypto`), N = 2^17, r = 8, p = 1 |

**Tanpa engine native.** Prisma Client menyusun query lewat WebAssembly dan mengirimnya melalui driver `pg` (JavaScript murni). Tidak ada file `.node` yang harus cocok dengan sistem operasi server Hostinger; ini diuji di `tests/unit/validation.test.ts`. Hanya CLI migrasi (`prisma migrate`) yang memakai binary, dan itu dijalankan dari komputer operator, bukan di Hostinger.

**Build tidak butuh database.** Belum ada halaman yang memakai database. `getDb()` (`src/server/db/index.ts`) baru membuka koneksi saat pertama dipakai.

### Struktur kode

```
prisma/
  schema.prisma                 model + relasi + indeks
  migrations/                   SQL yang diterapkan, berurutan
src/server/                     kode server (tidak pernah dikirim ke browser)
  db/client.ts                  createPrismaClient(url)
  db/index.ts                   getDb() untuk web app (role runtime)
  auth/password.ts              hash/verify scrypt, needsRehash, generatePassword
  validation/admin.ts, common.ts  skema Zod
  admin/bootstrap.ts            membuat Admin pertama
  admin/recover.ts              status, reset password, cabut sesi, buka kunci, ganti email
  activity-log.ts               logActivity()
  seed.ts                       data awal
scripts/
  db/dev-db.mjs                 PostgreSQL lokal: setup/start/stop/status
  db/migrate.ts                 migrate deploy + hak akses + cek UTC
  db/grants.ts                  hak akses role runtime + sesi UTC
  db/seed.ts                    npm run db:seed
  admin/bootstrap.ts, recover.ts  CLI Admin
  test/run-db-tests.ts          runner pengujian database
tests/unit/, tests/db/          pengujian
```

## 2. Struktur database

17 tabel, 6 enum, 18 foreign key, 48 indeks, 42 CHECK constraint, 7 trigger.

| Kelompok | Tabel | Isi |
| --- | --- | --- |
| Admin | `admin_user` | Satu-satunya akun. `id` selalu 1. Email (huruf kecil), nama, hash scrypt, hitungan gagal login, `locked_until`, waktu ganti password dan login terakhir |
| | `admin_session` | Sesi login. Hanya **hash SHA-256 token** yang disimpan. `expires_at` paling lama 8 jam setelah `last_seen_at`; bisa dicabut (`revoked_at`, `revoked_reason`) |
| | `login_attempt` | Setiap percobaan login (email yang diketik, IP, alasan) untuk pembatasan per IP |
| Editorial | `author` | Profil penulis. Data redaksi, **bukan akun login** |
| | `section` | Kanal (`KANAL`) dan rubrik (`RUBRIK`): slug unik per jenis, urutan, status aktif. Jenisnya tidak bisa diubah |
| | `article` | Status `DRAFT/PUBLISHED/ARCHIVED`. `published_at` di masa depan berarti terjadwal; `deleted_at` untuk tempat sampah; `version` untuk mencegah simpan saling menimpa. Body JSON editor + teks polos, template, kanal, rubrik, penulis, gambar utama, tag, SEO, sembunyikan dari homepage, label demo |
| | `article_slug_history` | Slug lama → artikel (untuk redirect 301). Diisi otomatis oleh trigger |
| | `article_revision` | Snapshot saat simpan manual, terbit, atau pulihkan |
| | `article_status_change` | Riwayat status. Diisi otomatis oleh trigger |
| | `article_media` | Media yang dipakai di body/galeri artikel, agar media yang masih dipakai tidak terhapus |
| Media | `media` | Metadata file di object storage: key, nama asli, MIME, ukuran, dimensi, SHA-256 (anti-duplikat), alt, caption, kredit, varian ukuran |
| | `media_folder` | Folder satu tingkat |
| Situs | `homepage_settings` | Singleton: berita utama pilihan redaksi, jumlah Berita Terbaru (default 4) |
| | `homepage_featured` | Urutan Tulisan Pilihan (posisi 0–11) |
| | `homepage_rubric` | Band rubrik di homepage; seed memasang Catatan Sumenep (3 tulisan) |
| | `site_settings` | Singleton: tagline, deskripsi, email kontak, tautan sosial, gambar OG bawaan |
| Audit | `activity_log` | Jejak audit append-only: pelaku (`ADMIN/CLI/SYSTEM`), aksi, entitas, ringkasan, meta, IP, user agent, waktu |

Urutan homepage (Berita utama → Tulisan Pilihan → Catatan Sumenep → Berita Terbaru) tetap di kode. Database hanya menentukan isinya. Noindex tidak disimpan di database; ia diatur lewat konfigurasi deployment (lihat [06-cache-seo.md](06-cache-seo.md)).

### Relasi penting

- `article.author_id` → `author` (RESTRICT: penulis yang masih punya artikel tidak bisa dihapus).
- `article.kanal_id`, `article.rubrik_id` → `section` (RESTRICT). Trigger memastikan kanal menunjuk `KANAL` dan rubrik menunjuk `RUBRIK`.
- `article.hero_media_id`, `og_media_id`, `author.avatar_id`, `site_settings.default_og_media_id`, `article_media.media_id` → `media` (RESTRICT: media yang dipakai tidak bisa dihapus).
- Menghapus artikel (bukan memindah ke tempat sampah) ikut menghapus riwayat slug, revisi, riwayat status, pemakaian media, dan slot Tulisan Pilihan. `homepage_settings.hero_article_id` menjadi kosong, sehingga homepage kembali memakai berita terbaru.
- `activity_log.admin_id` → `admin_user` (RESTRICT, termasuk saat UPDATE): jejak audit tidak bisa kehilangan pemiliknya.

## 3. Aturan yang dijaga database

Aturan ini berlaku untuk semua jalur, termasuk SQL langsung. Bug di kode aplikasi tidak bisa melanggarnya.

| Aturan | Mekanisme |
| --- | --- |
| **Hanya satu Admin** | `admin_user.id` primary key dengan default 1 dan `CHECK (id = 1)`. Insert kedua dengan id 1 ditolak primary key; id lain ditolak CHECK. Role runtime juga tidak punya hak INSERT/DELETE |
| **Activity Log tidak bisa diubah/dihapus** | Trigger `activity_log_append_only` (BEFORE UPDATE OR DELETE OR TRUNCATE, per statement) menolak perintah apa pun, bahkan dari pemilik tabel dan bahkan bila tidak ada baris yang kena. Role runtime juga tidak punya hak UPDATE/DELETE/TRUNCATE. Trigger `activity_log_stamp` selalu mengisi waktu dengan jam database |
| Format email Admin dan hash | Huruf kecil, ≤ 254 karakter, pola email; hash harus `scrypt$…` |
| Sesi maksimal 8 jam dari aktivitas terakhir | `expires_at <= last_seen_at + 8 jam`; token disimpan sebagai hex SHA-256 |
| Kanal/rubrik benar | Trigger `article_section_kinds`, `homepage_rubric_kind`; trigger `section_kind_immutable` |
| Artikel terbit lengkap | `PUBLISHED` wajib punya `published_at`, gambar utama, dan kanal atau rubrik. `ARCHIVED` wajib punya `archived_at` |
| Slug | Huruf kecil-angka-tanda hubung (`catatan-sumenep`); artikel ≤ 120, kanal/rubrik/penulis ≤ 80 |
| Riwayat otomatis | `article_slug_history` (slug lama tersimpan; slug yang dipakai lagi keluar dari riwayat) dan `article_status_history` |
| Singleton | `homepage_settings` dan `site_settings` hanya punya baris `id = 1`; baris dibuat oleh migrasi |
| Lainnya | URL kanonik wajib `https://`, posisi Tulisan Pilihan unik 0–11, metadata media valid, format aksi Activity Log (`admin.bootstrap`, `article.publish`, …) |

Pemilik database (role migrasi) secara teknis bisa mematikan trigger dengan `ALTER TABLE … DISABLE TRIGGER`. Itu wewenang DBA, bukan jalur aplikasi: role runtime tidak memiliki tabel, sehingga tidak bisa melakukannya. Pengujian membuktikannya.

## 4. Role database dan hak akses

| Role | Dipakai oleh | Hak |
| --- | --- | --- |
| Pemilik (`sumenep_owner` di lokal) | Migrasi Prisma, `db:grants`, CLI `admin:*`, `db:seed`. **Tidak dipasang di server web** | Memiliki semua tabel |
| Runtime (`sumenep_app` di lokal, nama di `DB_APP_ROLE`) | Web app (`DATABASE_URL`) | SELECT/INSERT/UPDATE/DELETE pada tabel CMS, dengan pengecualian di bawah. Bukan superuser, tidak bisa membuat tabel, bukan anggota role pemilik |

| Tabel | Hak role runtime |
| --- | --- |
| `activity_log` | SELECT, INSERT saja |
| `admin_user` | SELECT, UPDATE saja (tidak bisa membuat atau menghapus Admin) |
| `homepage_settings`, `site_settings` | SELECT, UPDATE saja |
| `_prisma_migrations` | tidak ada |
| tabel lain | SELECT, INSERT, UPDATE, DELETE |

`npm run db:grants` menerapkan dan memverifikasi hak ini. `npm run db:migrate` menjalankannya otomatis setelah migrasi. Tabel baru dari migrasi berikutnya otomatis mendapat DML (default privileges). Bila tabel baru perlu pengecualian, tambahkan di `scripts/db/grants.ts`.

### Wajib: sesi database dalam UTC

Driver adapter `pg` mengirim waktu sebagai UTC tanpa offset, dan membaca `timestamptz` seolah offset-nya +00:00. Jika zona waktu sesi database bukan UTC (misalnya `Asia/Jakarta`), setiap tanggal bergeser 7 jam. Akibatnya perbandingan seperti `published_at <= now()` untuk artikel terjadwal ikut salah.

Masalah ini ketahuan saat pengujian, karena PostgreSQL lokal di komputer ini memakai `Asia/Bangkok`. Perbaikannya ada di dua tempat:

- `db:grants` menjalankan `ALTER DATABASE … SET TimeZone = 'UTC'`, lalu memeriksa sesi baru untuk kedua role. Bila hasilnya bukan UTC, perintah gagal.
- `tests/db/01-schema.test.ts` menguji bahwa nilai waktu bolak-balik tanpa bergeser.

## 5. Migrasi

| Migrasi | Isi |
| --- | --- |
| `20261120193912_init` | Dibuat Prisma dari `schema.prisma`: 6 enum, 17 tabel, indeks, foreign key |
| `20261120194038_integrity_rules` | Ditulis manual: 42 CHECK constraint, 7 fungsi + trigger, baris singleton, komentar tabel |

Aturan kerja:

1. **Membuat migrasi (development):** ubah `prisma/schema.prisma`, lalu jalankan `npm run db:migrate:dev -- --name <perubahan>`. Hak akses diterapkan ulang otomatis.
2. **SQL khusus** (CHECK, trigger): buat migrasi kosong dengan `npx prisma migrate dev --create-only --name <nama>`, isi SQL-nya, lalu jalankan `npm run db:migrate:dev`. Prisma mengabaikan CHECK dan trigger saat membandingkan skema, jadi migrasi berikutnya tidak akan menghapusnya. Pengujian juga memeriksa tidak ada selisih antara `schema.prisma` dan database (`prisma migrate diff --exit-code`).
3. **Jangan mengubah migrasi yang sudah diterapkan.** Buat migrasi baru.
4. **Staging/produksi:** `npm run db:migrate -- --env-file <file> --yes` (`prisma migrate deploy` + hak akses + cek UTC). Perintah ini tidak pernah membuat migrasi baru dan tidak pernah mereset data.

`prisma migrate reset` tidak dipakai di skrip mana pun. Pengujian memakai database sementara yang dibuat dan dihapus sendiri (lihat bagian 9).

## 6. Database development lokal

| Perintah | Fungsi |
| --- | --- |
| `npm run db:setup` | Membuat cluster PostgreSQL 16 di `.data/postgres`, dua role, database `sumenep_cms_dev` dan `sumenep_cms_test`, lalu menulis `.env` dan `.env.test` dengan password acak. Aman dijalankan ulang |
| `npm run db:start` / `db:stop` / `db:status` | Menyalakan, mematikan, dan memeriksa server |
| `npm run db:migrate:dev` | Menerapkan atau membuat migrasi di database dev |
| `npm run db:seed` | Mengisi kanal, rubrik, dan band Catatan Sumenep |

Isolasi:
- folder data sendiri di dalam proyek (`.data/`, diabaikan git);
- port sendiri, 54329 (ubah dengan `DEV_DB_PORT`);
- hanya mendengar di 127.0.0.1;
- autentikasi scram-sha-256.

Server ini terpisah dari layanan PostgreSQL sistem, dari database Busacare, dan dari database website induk. Password hanya ada di file yang diabaikan git dan tidak pernah dicetak. Bila biner PostgreSQL ada di lokasi lain, isi `PG_BIN`.

Status saat laporan ini ditulis: migrasi diterapkan, seed sudah dijalankan (5 kanal, 5 rubrik, band Catatan Sumenep). **Admin belum dibuat.** Bootstrap sengaja diserahkan kepada pemilik, supaya password tidak pernah melewati chat.

## 7. Variabel lingkungan

| Variabel | Rahasia | Development | Produksi (Hostinger) | Fungsi |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | tidak | `.env.local` | panel env | URL kanonik |
| `NEXT_PUBLIC_SITE_ENV` | tidak | `.env.local` | panel env | `staging` = noindex. Ditanam saat build |
| `DATABASE_URL` | **ya** | `.env` (otomatis) | panel env | Role runtime. Di produksi tambahkan `sslmode=verify-full` |
| `DIRECT_URL` | **ya** | `.env` (otomatis) | **jangan dipasang di server web**; hanya di komputer operator saat migrasi/CLI | Role pemilik |
| `DB_APP_ROLE` | tidak | `.env` (otomatis) | komputer operator | Nama role runtime untuk `db:grants` |
| `DEV_DB_PORT`, `PG_BIN` | tidak | opsional | — | PostgreSQL lokal |

Template ada di `.env.example`. Variabel untuk Fase 3 dan seterusnya (misalnya kredensial object storage) ditambahkan saat fasenya disetujui.

## 8. Admin: bootstrap dan pemulihan

Semua perintah memakai `DIRECT_URL`, jadi hanya bisa dijalankan oleh orang yang punya akses database. Tidak ada halaman, Server Action, atau API untuk membuat akun. Database remote selalu diminta konfirmasi (`ya`), atau `--yes`.

Password tidak pernah ditampilkan, kecuali yang dibuat dengan `--generate`. Itu pun hanya sekali, di terminal operator. **Jangan kirim password lewat chat atau email.**

### Membuat Admin pertama

```bash
npm run admin:bootstrap -- --email redaksi@contoh.id --name "Nama Admin"
# password diketik dua kali (tidak tampil), minimal 15 karakter
# alternatif: --generate (password acak 24 karakter, tampil sekali)
```

- Bila Admin sudah ada, perintah ditolak (exit code 2) dan tidak ada yang berubah.
- Bila dua bootstrap berjalan bersamaan, primary key memastikan hanya satu yang berhasil.
- Hasilnya tercatat di Activity Log: `admin.bootstrap`, pelaku CLI.

**Produksi:** jalankan dari komputer operator dengan file env sementara berisi `DIRECT_URL` produksi:

```bash
npm run admin:bootstrap -- --email … --name "…" --env-file .env.production.local
```

Hapus file itu setelah selesai. Nama `.env.*` sudah diabaikan git.

### Pemulihan bila kehilangan akses

| Situasi | Perintah | Efek |
| --- | --- | --- |
| Memeriksa akun | `npm run admin:recover -- status` | Email login, kapan password diganti, login terakhir, status kunci, jumlah sesi aktif. Tanpa rahasia |
| Lupa password | `npm run admin:recover -- reset-password` (`--generate` bisa dipakai) | Password baru, kunci dibuka, **semua sesi dicabut** |
| Terkunci setelah 5 kali gagal | `npm run admin:recover -- unlock` | Hitungan gagal kembali 0. Kunci juga lepas sendiri setelah waktunya habis |
| Perangkat hilang atau dicuri | `npm run admin:recover -- revoke-sessions` | Semua sesi dicabut. Ganti password juga bila ada kemungkinan password bocor |
| Lupa email login | `status` | Email ditampilkan |
| Ganti email login | `npm run admin:recover -- set-email --email baru@contoh.id` | Email diganti; akunnya tetap yang sama |
| Kehilangan `DIRECT_URL` | Reset password role pemilik di konsol penyedia database, perbarui file env operator | Tidak berpengaruh ke web app, karena web app memakai role runtime |

Setiap tindakan tercatat di Activity Log (`admin.recover.*`, pelaku CLI) dan tidak bisa dihapus. Skrip tidak pernah membuat Admin kedua: semua perintah bekerja pada baris `id = 1`.

## 9. Pengujian

```bash
npm run typecheck    # aplikasi + skrip + tes
npm test             # tes unit + tes database
npm run build        # next build --webpack (frontend)
```

`npm run test:db` hanya mau berjalan bila `.env.test` menunjuk database lokal bernama `*_test`. Urutannya:

1. membuat database sementara `sumenep_cms_test_run_<acak>`;
2. menerapkan migrasi (`migrate deploy`);
3. menerapkan hak akses dan memeriksa UTC;
4. memeriksa `schema.prisma` sama dengan database;
5. menjalankan `tests/db/*` satu per satu;
6. menghapus **hanya** database sementara itu (`--keep` untuk menyimpannya).

Database lain tidak pernah direset.

Hasil 21 November 2026: **77 tes lulus, 0 gagal** (16 unit, 61 database). Build `next build --webpack` berhasil, dengan daftar rute yang sama seperti sebelumnya.

| Berkas | Yang dibuktikan |
| --- | --- |
| `unit/password` | Format hash scrypt; verifikasi benar/salah; salt unik; hash rusak/palsu ditolak tanpa error; `needsRehash`; normalisasi Unicode; password acak lolos kebijakan |
| `unit/validation` | Zod: email, nama, kebijakan password, slug sama dengan CHECK database; URL koneksi tidak membocorkan kredensial; Prisma Client tanpa engine native |
| `db/01-schema` | Semua migrasi diterapkan; daftar tabel, CHECK, dan trigger lengkap; sesi UTC dan waktu bolak-balik akurat; singleton ada |
| `db/02-privileges` | Role runtime bukan superuser dan bukan anggota pemilik; tidak bisa ALTER, mematikan trigger, atau membuat tabel; matriks hak sesuai tabel di bagian 4 |
| `db/03-single-admin` | Bootstrap membuat id 1 dan mencatat log; Admin kedua ditolak (fungsi, balapan dua bootstrap, CHECK, primary key, bahkan untuk pemilik); role runtime tidak bisa membuat/menghapus Admin; CLI: sukses, ditolak bila Admin ada (exit 2), password lemah (exit 3), `--generate`, tanpa TTY |
| `db/04-activity-log` | Role runtime bisa menambah entri; waktu dipaksa ke jam database; UPDATE/DELETE/TRUNCATE ditolak trigger untuk pemilik (termasuk lewat TRUNCATE … CASCADE); ditolak hak akses untuk role runtime; isi log identik sebelum dan sesudah semua percobaan |
| `db/05-editorial-rules` | Kanal/rubrik sesuai jenis; jenis tidak bisa diubah; syarat PUBLISHED/ARCHIVED; riwayat status dan slug otomatis; RESTRICT dan CASCADE; singleton; Tulisan Pilihan; metadata media |
| `db/06-sessions` | Hanya hash token tersimpan; batas 8 jam; perpanjangan sesi; aturan `login_attempt` |
| `db/07-recover` | Reset password (password lama mati, kunci lepas, 2 sesi aktif dicabut, log tercatat); cabut sesi; buka kunci; ganti email; CLI menolak tanpa `--yes` di shell non-interaktif |
| `db/08-seed` | 5 kanal + 5 rubrik sama persis dengan `src/content/sections.ts`; band Catatan Sumenep; dijalankan ulang tidak mengubah apa pun dan tidak menimpa suntingan CMS |

## 10. Keamanan: status per fase

| Persyaratan | Status |
| --- | --- |
| Scrypt untuk password | **Selesai**: `src/server/auth/password.ts` (parameter OWASP, parameter tersimpan per hash) |
| Hanya role ADMIN, hanya satu Admin | **Selesai** di database dan kode. Tidak ada kolom role dan tidak ada tabel pengguna lain |
| Activity Log tidak bisa diubah atau dihapus lewat aplikasi | **Selesai**: trigger + hak akses, teruji |
| Bootstrap dan pemulihan CLI, cabut semua sesi | **Selesai** |
| Zod | **Selesai**: CLI (Fase 2), login, ganti password, dan id sesi di Server Actions (Fase 3) |
| Login, rate limiting per IP, kunci sementara setelah 5 gagal | **Selesai di Fase 3**: lihat [08-autentikasi-admin.md](08-autentikasi-admin.md) |
| Sesi 8 jam, cookie httpOnly + Secure, pemeriksaan server-side | **Selesai di Fase 3**: cookie `__Host-`, `requireAdmin()`, `proxy.ts` |
| Proteksi CSRF | **Selesai di Fase 3**: Origin wajib di proxy, Server Action, dan Route Handler |

## 11. Rekomendasi Fase 3 (Keamanan dan login)

> Sudah dikerjakan di Fase 3, kecuali poin 4 (batas mutlak 24 jam; menunggu keputusan) dan poin 8 (dilakukan saat backend digabung ke `main`). Hasilnya: [08-autentikasi-admin.md](08-autentikasi-admin.md).

1. **Login (Server Action + Zod).** Verifikasi scrypt. Jalankan hash palsu untuk email yang tidak dikenal, supaya waktu respons tidak membocorkan email Admin. Pesan gagal seragam. `needsRehash` untuk menaikkan parameter.
2. **Pembatasan per IP** dari `login_attempt` (usulan: 10 gagal per 15 menit). Kunci akun setelah 5 gagal beruntun selama 15 menit. Batasi juga jumlah hash scrypt yang berjalan bersamaan, karena tiap hash memakan sekitar 128 MiB.
3. **IP klien di belakang CDN Hostinger.** Tentukan header tepercaya (uji `X-Forwarded-For`), supaya batas per IP tidak bisa diakali.
4. **Sesi.** Token acak 32 byte; cookie `__Host-sumenep_admin`, httpOnly, Secure, SameSite=Lax, Path=/. Perpanjang `last_seen_at`/`expires_at` paling sering tiap 5 menit. Usulan tambahan: batas mutlak 24 jam (perlu persetujuan). Logout, "keluar dari semua perangkat", dan pencabutan otomatis saat ganti password.
5. **Guard server-side** di setiap halaman `/admin`, Server Action, dan Route Handler (bukan hanya `proxy.ts`). Halaman admin selalu dinamis dan `noindex`.
6. **CSRF.** Origin bawaan Server Actions + `serverActions.allowedOrigins`. Upload (Route Handler) memeriksa `Origin`/`Sec-Fetch-Site`.
7. **Header keamanan admin** (CSP ketat, `Cache-Control: no-store`) dan pembersihan berkala `login_attempt`/sesi kedaluwarsa.
8. Sebelum menggabungkan backend ke `main`: pindahkan `prisma` ke `dependencies` dan jalankan `prisma generate` sebelum `next build --webpack`, mengikuti pola commit `e788bb4` yang belum di-push.
