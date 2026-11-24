# Infrastruktur & Jalur Deployment Produksi SUMENEP

Dokumen acuan wajib bagi **Fase 5 dan seluruh fase berikutnya** pada **`sumenep.matamaduranews.com`** (*SUMENEP – Mata Madura*).

## Status (24 November 2026, Tahap D)

- **Keputusan pemilik:** seluruh backend memakai langganan **Hostinger Business Web Hosting** yang sudah ada: Node.js 22, **MariaDB Hostinger**, dan **disk Hostinger** untuk media. **Tidak** memakai Neon PostgreSQL maupun Cloudflare R2, dan tidak membeli layanan tambahan.
- **Kode:** branch `migration/hostinger-mysql` (lokal, belum di-commit/push). Tahap B dan C selesai; rincian dan hasil uji: [10-migrasi-mariadb.md](10-migrasi-mariadb.md).
- **Production saat ini** (`origin/main` = `e4e38bf`): kode Fase 4 versi PostgreSQL, database dan media belum tersambung (halaman publik normal, login Admin belum bisa dipakai).
- **Tahap D:** alat dan prosedur siap (§8–§11). Server Hostinger: **MariaDB 11.8.9** (seluruh pengujian diulang pada versi ini), TLS didukung, SSH 65002 terbuka.
- **Jalur deploy yang dipakai (keputusan pemilik, 24 November 2026): tanpa SSH.** Pemilik hanya mengisi `DATABASE_URL`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di Environment variables. Saat server start, aplikasi sendiri yang menyiapkan database dan folder media (§8). Pemeriksaan lewat SSH (§11) menjadi opsional.

---

## 1. Arsitektur Produksi & Batasan Mutlak

| Komponen | Ketentuan Produksi | Keterangan |
| --- | --- | --- |
| **Hosting** | Hostinger Business Web Hosting (paket aktif bersama website induk) | Web App Node.js, `Server: hcdn` |
| **Website induk** | `matamaduranews.com` (WordPress) | **Tidak boleh diubah/terganggu**, termasuk databasenya |
| **Aplikasi SUMENEP** | `sumenep.matamaduranews.com` (Next.js 16 + React 19, Node.js 22) | Web App terpisah dari WordPress |
| **Database CMS** | **MariaDB 11.8.9 Hostinger** (`u123456789_sumenep` di `srvNNN.hstgr.io`) | Database khusus SUMENEP. Diuji lokal dengan MariaDB 10.11 dan 11.8.9 |
| **Media** | **Disk Hostinger**: `/home/<user>/sumenep-data/media` | Di luar folder yang dikelola deployment (§6) |
| **Backup** | `/home/<user>/sumenep-data/backups` + salinan di luar server | §9 |
| **DNS & Nameserver** | Tetap di Hostinger | **Tidak diubah** |

**Batasan operasional:**
- Jangan membeli paket/layanan baru, jangan memindahkan ke VPS.
- Jangan mengubah website induk, database WordPress, DNS/nameserver, atau `public_html` website induk.
- Jangan memakai database WordPress, database development lokal, Busacare, atau MataGen.
- Jangan menimpa environment variables website lain; jangan menyimpan secret di Git, log, screenshot, atau chat.
- Pertahankan `Disallow: /` (`NEXT_PUBLIC_SITE_ENV=staging`) sampai peluncuran disetujui.

---

## 2. Branch

| Referensi | Isi & Status |
| --- | --- |
| `f62ef97` | Production sebelum Fase 4 (homepage redesain + Fase 2–3). |
| `origin/main` = `e4e38bf` | **Sedang berjalan di production**: Fase 4 versi PostgreSQL/R2 (DB & media belum tersambung). Titik rollback Tahap E. |
| `ops/verifikasi-produksi` (`7399b98`, lokal) | `db:verify` + `prod:smoke` versi PostgreSQL. |
| `migration/hostinger-mysql` (lokal, belum di-commit) | **Target Tahap E:** MariaDB + media disk. Dibuat dari `7399b98`. |

---

## 3. Dependensi & Node.js

- **Node.js 22.x** (minimum 20.9.0; `.nvmrc = 22`; default Hostinger juga 22). Build **wajib** `next build --webpack` (Turbopack panic di Hostinger).
- Database: `prisma` / `@prisma/client` **6.19.3**, `engineType = "client"` (tanpa engine native) + **`@prisma/adapter-mariadb` 6.19.3** + driver **`mariadb` 3.4.5** (JavaScript murni).
- Media: `sharp` 0.35.5 (binary Linux x64 ada di `package-lock.json`). `@aws-sdk/client-s3` hanya untuk driver S3 **opsional**.
- Paket build ada di `dependencies`; `postinstall: prisma generate`. **Build tidak butuh database:** `prisma generate` + `next build` lulus tanpa `.env` dan tanpa `DATABASE_URL` (diuji Tahap D).

---

## 4. Web App Hostinger: build, deploy, dan perilaku penting

Konfigurasi (hPanel → Websites → sumenep.matamaduranews.com):

| Pengaturan | Nilai |
| --- | --- |
| Framework | Next.js |
| Branch | `main` (target akhir, hanya setelah persetujuan) |
| Node.js | `22.x` |
| Root directory | `./` |
| Package manager | npm (dideteksi dari `package-lock.json`) |
| Build | `npm run build` (= `next build --webpack`) |
| Output | `.next` |

Perilaku yang **dinyatakan dokumentasi Hostinger** (docs.hostinger.com/node.js):
- **Struktur folder:** `/home/<user>/domains/<domain>/hbuilds/` dikelola deployment (`versions/<build-id>/`, `current` → build aktif, `last-source/`, `config/`, `logs/`), plus `public_html/`. **"Files in hbuilds/ and public_html are overwritten on every deployment."** Hanya build aktif yang disimpan; build lama dihapus.
- **Push ke branch terhubung = build otomatis.** Build gagal **tidak** mengganti build aktif (situs lama tetap jalan).
- **Environment variables:** dipakai saat build **dan** runtime, tersimpan terenkripsi, bertahan antar-deploy. **Menyimpan perubahan langsung me-redeploy aplikasi.** Bisa "Import .env".
- **Tidak ada rollback per-commit:** versi lama dikembalikan dengan revert/reset di Git lalu push.
- Batas: install dan build masing-masing maks. 15 menit; satu deployment pada satu waktu.
- Uploads/berkas runtime: **tidak disebut** di dokumentasi → persistensi harus dibuktikan sendiri (§6, §11).
- Jangan menjalankan `scripts/hostinger.mjs deploy` lama (menimpa seluruh Environment Variables).

---

## 5. Database MariaDB Hostinger

### 5.1 User dan hak akses
- Menurut dukungan Hostinger, **satu database punya satu user** pada paket Web/Cloud/Agency; hak user itu bisa dikurangi lewat hPanel → Databases → Management → **Change permissions** (tingkat database, bukan per tabel). Akan dipastikan di §11.
- Maka di Hostinger yang hampir pasti berlaku **mode satu user**: `DATABASE_URL` (Web App) dan `DIRECT_URL` (operator) memakai user yang sama; `DB_APP_USER` dikosongkan.
- Hak "SELECT + INSERT saja" pada `activity_log` butuh hak **per tabel** untuk user runtime terpisah (`npm run db:grants`, teruji lokal). Bila Hostinger tidak menyediakannya, perlindungan Activity Log = **guard aplikasi** (setiap query Prisma, termasuk SQL mentah) **+ trigger** bila diizinkan.
- **Opsi pengerasan (usul, butuh persetujuan):** setelah migrasi, cabut hak DDL (`DROP`, `ALTER`, `CREATE`, `INDEX`, `CREATE VIEW`) user lewat "Change permissions". Akibatnya: `TRUNCATE`/`DROP TABLE` dan penghapusan CHECK (mis. aturan satu Admin) tidak bisa lagi, oleh aplikasi maupun SQL apa pun dengan user itu. Untuk migrasi berikutnya hak dikembalikan sementara. `TRIGGER` jangan dicabut bila trigger terpasang (trigger dijalankan atas nama pembuatnya).

### 5.2 Koneksi
- Format: `mysql://USER:PASSWORD@HOST:3306/DATABASE` (password di-URL-encode). Host dari hPanel ("MySQL host"); dari server sendiri biasanya `localhost`. `?ssl=true` untuk koneksi remote bila didukung.
- Setiap koneksi `SET time_zone = '+00:00'`; kolom waktu `DATETIME(3)` berisi UTC.
- Pool aplikasi 5 koneksi (`connectionLimit`); sesuaikan dengan `max_user_connections` hasil §11.

### 5.3 Migrasi dan trigger
- `20261124020000_init` (17 tabel, 18 FK) dan `20261124020100_integrity_rules` (42 CHECK, singleton). **Tanpa trigger.**
- Trigger penjaga opsional (`prisma/sql/guard-triggers.sql`) dipasang `npm run db:migrate`/`db:triggers` **hanya** bila host mengizinkan **dan** koneksi dari server sendiri (definer `@localhost`/`%`). Dari Remote MySQL, pemasangan dilewati: definer `user@<IP>` akan membuat semua penulisan gagal bila akses IP itu kelak dihapus.
- Tempat menjalankan migrasi: **dari komputer operator lewat tunnel SSH** — `node scripts/ops/hostinger-tunnel.mjs -- npm run db:migrate -- --yes`. Tidak butuh Node.js atau salinan repo di server, tidak butuh izin IP Remote MySQL; server melihat koneksi dari localhost sehingga definer trigger stabil. Pembungkus ini menolak perintah reset/hapus database. Alternatif: Remote MySQL (butuh izin IP di hPanel; trigger tidak dipasang dari koneksi remote).

### 5.4 Perintah operator
```bash
npm run db:migrate -- --env-file .env.production.local --yes   # migrate deploy + grants (bila ada user runtime) + trigger (bila diizinkan)
npm run db:seed    -- --env-file .env.production.local --yes   # kanal, rubrik, penulis redaksi (idempoten)
npm run db:verify  -- --env-file .env.production.local         # read-only
npm run admin:bootstrap -- --env-file .env.production.local    # password diketik pemilik sendiri
```
Tidak ada perintah yang mereset atau menghapus data. `prisma migrate reset` dilarang.

---

## 6. Media di Disk Hostinger

- Lokasi: **`/home/<user>/sumenep-data/media`** — di luar `domains/<domain>/hbuilds/` dan `public_html/` (keduanya ditimpa setiap deployment), tidak bisa diakses langsung dari web.
- Production **wajib** `MEDIA_ROOT` absolut di luar direktori aplikasi dan `.next`; bila tidak, setiap operasi media ditolak dengan pesan jelas di log dan `prod:smoke` melaporkan Media `500`.
- Key berkas `YYYY/MM/<16-hex>.webp` dari SHA-256 isi; nama asli tidak pernah dipakai sebagai path; path dicek tetap di dalam `MEDIA_ROOT`; tulis atomik; izin `0640`/`0750`.
- Upload divalidasi dari **isi** berkas (JPEG/PNG/WebP/AVIF-HEIF/GIF, maks 15 MB, maks 50 MP), EXIF dibuang, disimpan WebP ≤ 2400 px. PDF/SVG ditolak.
- Hapus: `DELETE /api/admin/media/<id>` (409 bila masih dipakai).
- **Persistensi:** simulasi lokal lulus (Tahap C). **Bukti di Hostinger belum ada** — prosedur §10.

---

## 7. Environment Variables Produksi

Template tanpa secret, siap "Import .env": [`deploy/hostinger.env.template`](../deploy/hostinger.env.template). **Diisi di Tahap E** (menyimpan = redeploy).

| Variabel | Web App Hostinger | Operator CLI |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://sumenep.matamaduranews.com` | — |
| `NEXT_PUBLIC_SITE_ENV` | `staging` s.d. peluncuran | — |
| `DATABASE_URL` | MariaDB SUMENEP (`mysql://user:password@localhost:3306/nama_db`); password apa adanya, tidak perlu URL-encode | Sama |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` (opsional `ADMIN_NAME`) | Akun Admin pertama, dibuat saat start bila belum ada; password min. 15 karakter; hapus `ADMIN_PASSWORD` setelah login pertama | — |
| `DIRECT_URL`, `DB_APP_USER` | **Tidak dipasang** | Migrasi/CLI |
| `MEDIA_DRIVER` | tidak perlu (bawaan `local`) | — |
| `MEDIA_ROOT` | tidak perlu (bawaan `~/sumenep-data/media`) | Backup |
| `CMS_PUBLIC_ARTICLES` | `on` | — |
| `CMS_CACHE_SECONDS` | `60` | — |
| `TRUSTED_PROXY_COUNT`, `CLIENT_IP_HEADER`, `ADMIN_ALLOWED_HOSTS` | Sesuai proxy `hcdn` (dicek di Tahap E) | — |
| `S3_*`, `R2_PUBLIC_URL` | **Tidak ada** | — |

---

## 8. Deployment

### 8.1 Jalur yang dipakai: setup otomatis saat start (tanpa SSH)

1. Pemilik mengisi `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` di hPanel → Environment variables Web App SUMENEP.
2. Push ke `main` → Hostinger build dan start.
3. Saat start, [`src/instrumentation.ts`](../src/instrumentation.ts) menjalankan [`src/server/deploy/auto-setup.ts`](../src/server/deploy/auto-setup.ts) di latar belakang, sekali per start:
   - membaca `DATABASE_URL` secara toleran (password tanpa URL-encode, `localhost` diganti `127.0.0.1`);
   - **menolak** database yang berisi tabel bukan milik SUMENEP (mis. WordPress), tanpa mengubah apa pun;
   - menjalankan `prisma migrate deploy` (tidak pernah reset);
   - membuat data awal satu kali, lalu Admin dari `ADMIN_EMAIL`/`ADMIN_PASSWORD` bila belum ada Admin;
   - membuat dan menguji tulis folder media `~/sumenep-data/media`.
4. Hasilnya terlihat tanpa login hPanel di **`/api/status`**: build yang aktif (commit + waktu build) dan status tiap langkah, tanpa nilai rahasia.

Gagal di satu langkah tidak menghentikan situs: halaman publik tetap berjalan, dan alasannya tampil di `/api/status`. Diuji lokal pada MariaDB 11.8.9 (database kosong, start ulang, database berisi tabel WordPress, password salah, password Admin terlalu pendek).

### 8.2 Jalur lama lewat SSH (opsional)

Urutan dipilih agar situs publik tidak pernah mati: build gagal tidak mengganti build aktif, dan selama database/media belum siap halaman publik tetap berjalan seperti sekarang.

| # | Langkah | Bila gagal |
| --- | --- | --- |
| 0 | Prasyarat §11 lengkap; catat commit aktif (`e4e38bf`); backup Hostinger (hPanel → Backups) dan folder `sumenep-data` | Berhenti; tidak ada yang berubah |
| 1 | Migrasi di database SUMENEP yang **kosong**, lewat `scripts/ops/hostinger-tunnel.mjs`: `db:migrate` → `db:seed` → `db:verify` | Database baru belum dipakai situs; perbaiki lalu ulangi. Database kosong boleh dibuat ulang di hPanel |
| 2 | `admin:bootstrap` (password diketik pemilik) → `db:verify` = 1 Admin | Sama seperti 1 |
| 3 | Backup pertama (`npm run backup`) | Ulangi sebelum lanjut |
| 4 | Commit + merge ke `main` + push (build otomatis) | Build gagal → situs tetap versi lama; perbaiki dan push lagi |
| 5 | Isi Environment Variables (Import .env) → redeploy otomatis | Variabel salah → Admin/media error, publik tetap jalan; betulkan variabel |
| 6 | `npm run prod:smoke` (9/9 + website induk), uji manual CMS, uji persistensi §10 | Rollback §9.3 bila kritis |

Risiko utama: build Hostinger > 15 menit (lokal ±1–2 menit); `max_user_connections` kecil; header IP `hcdn` salah membuat batas login per IP berlaku untuk semua orang (dicek di langkah 6).

---

## 9. Backup, Restore, dan Rollback

### 9.1 Backup (sebelum setiap deploy/migrasi, dan berkala)
- **Hostinger:** hPanel → Websites → Backups (backup otomatis paket + "generate" manual) — untuk seluruh akun.
- **SUMENEP sendiri** (teruji lokal: `npm run test:backup`):
  ```bash
  # di server (SSH) atau dari komputer operator (database saja, lewat Remote MySQL)
  node scripts/ops/backup.mjs --env-file <env-berisi-DIRECT_URL> --out /home/<user>/sumenep-data/backups --media-root /home/<user>/sumenep-data/media --label "sebelum-deploy"
  ```
  Menghasilkan `sumenep-<waktu>-db.sql.gz` (mariadb-dump `--single-transaction`, tanpa mengunci situs), `sumenep-<waktu>-media.tar.gz`, dan `sumenep-<waktu>-manifest.json` (SHA-256 setiap berkas, jumlah baris per tabel, daftar berkas media). Password tidak pernah masuk argumen proses, log, atau manifest. Backup lama tidak pernah dihapus otomatis.
- **Tanpa Node/SSH:** phpMyAdmin → database SUMENEP → Export (SQL) dan File Manager → `sumenep-data/media` → Compress → Download.
- Simpan salinan di luar server (unduh ke komputer redaksi).

### 9.2 Restore (tidak pernah menimpa)
```bash
node scripts/ops/restore.mjs --manifest <…-manifest.json> --env-file <env-database-BARU-yang-kosong> --db
node scripts/ops/restore.mjs --manifest <…-manifest.json> --media-target /home/<user>/sumenep-data/media-pulih-<tanggal>
```
Database berisi atau folder berisi → ditolak; berkas backup rusak (SHA-256 beda) → ditolak. Setelah pulih dan `db:verify` lulus, arahkan `DATABASE_URL`/`MEDIA_ROOT` ke salinan pulihan (Environment variables → redeploy). Data lama tetap ada sampai diputuskan.

### 9.3 Rollback aplikasi
1. Hentikan perubahan lebih lanjut; jangan menghapus database, media, atau backup.
2. Kembalikan kode: `git revert` commit migrasi di `main` lalu push (Hostinger: tidak ada rollback per-commit; push = build otomatis; build aktif tetap jalan sampai build revert berhasil).
3. Hasilnya kembali ke `e4e38bf`: halaman publik normal, Admin/media tidak aktif (sama dengan kondisi sebelum Tahap E). Environment variables MariaDB tidak dipakai versi itu dan boleh dibiarkan.
4. Database MariaDB dan folder media tetap utuh untuk percobaan berikutnya; website induk tidak tersentuh oleh langkah mana pun.

---

## 10. Uji Persistensi Media di Hostinger

1. Sekarang (Tahap D): `sh scripts/ops/hostinger-check.sh sumenep.matamaduranews.com` lewat SSH membuat `~/sumenep-data/media/.persistensi-penanda` (waktu + build aktif + nilai acak). Tanpa SSH: File Manager → buat folder `sumenep-data/media` di home dan berkas teks berisi tanggal.
2. Setelah redeploy berikutnya (Tahap E, atau redeploy tanpa perubahan bila Anda setujui lebih awal): jalankan skrip yang sama. Penanda identik + build aktif berbeda = **terbukti bertahan**.
3. Tahap E, uji end-to-end: unggah foto lewat CMS → redeploy → URL `/media/…` tetap 200 dengan isi sama.

---

## 11. Pemeriksaan Server Hostinger (Tahap D)

### 11.1 Pemeriksaan otomatis (tanpa phpMyAdmin, tanpa salin-tempel SQL)

```bash
npm run hosting:check      # = node scripts/ops/hostinger-remote-check.mjs --env-file .env.hostinger-db.local --trigger-test --backup-test
```

- Jalur: SSH ke akun hosting yang sudah ada (`u123456789@srvNNN.hstgr.io:65002`) dengan **kunci khusus SUMENEP** `~/.ssh/sumenep_hostinger_ed25519` (bukan kunci umum laptop), tanpa `~/.ssh/config`, tanpa agent forwarding; host key dipatok di [`deploy/hostinger_known_hosts`](../deploy/hostinger_known_hosts) dan dicocokkan dengan kartu *SSH details* di hPanel (koneksi ditolak bila berubah). Lalu tunnel lokal `127.0.0.1` ke MariaDB di server. Tidak perlu membuka Remote MySQL; trigger yang dibuat lewat tunnel ber-definer `@localhost`.
- Kredensial database hanya di `.env.hostinger-db.local` (git-ignored; template [`deploy/hostinger-db.env.template`](../deploy/hostinger-db.env.template)). Nama database dan nama user disalin persis dari hPanel (bisa berbeda). Password tidak pernah dicetak; hash password di `SHOW GRANTS` disamarkan otomatis.
- Sebelum koneksi apa pun berkas akses diperiksa: user SSH dan nama database/user harus milik akun yang sama (awalan `u123456789_`), domain harus `sumenep.*`, `--no-ssh` hanya ke `127.0.0.1`. Kunci yang tidak ada menghentikan skrip tanpa percobaan login.
- Menjalankan isi `prisma/sql/hostinger-probe-clean.sql`: bagian 1–4 hanya membaca; uji trigger (bagian 5–6) hanya bila database yang terhubung = `HOSTINGER_DB_NAME` dan **kosong**, dan tabel uji selalu dihapus lagi. Backup uji (salinan lokal sementara, langsung dihapus) hanya bila database tidak berisi tabel selain milik SUMENEP. Lalu `scripts/ops/hostinger-check.sh` lewat SSH: menulis hanya di `~/sumenep-data/{media,backups}` (uji tulis, penanda persistensi), membaca folder Web App SUMENEP, alat, dan `df`/`quota` (tidak menelusuri folder lain).
- Tidak menjalankan migrasi atau deployment, tidak mengubah tabel aplikasi, WordPress, DNS, atau Environment variables.
- Diuji lokal pada MariaDB **11.8.9** (versi Hostinger): database kosong, database berisi tabel WordPress (uji tulis dan backup dihentikan, tabel utuh), hanya tabel SUMENEP, dan sisa tabel uji; serta skrip server pada home tiruan (hanya `~/sumenep-data` yang berubah; domain induk dan symlink ditolak).

**Batas akses SSH.** SSH masuk sebagai user akun hosting, pemilik semua file di paket itu, termasuk WordPress `matamaduranews.com` dan `wp-config.php`-nya. hPanel tidak menyediakan pembatasan SSH per folder. Pengamannya: hanya skrip di repo ini yang dijalankan, kunci khusus didaftarkan selama Tahap D–E saja, dan SSH dinonaktifkan lagi sesudahnya.

### 11.2 Hasil per 24 November 2026

| # | Pemeriksaan | Hasil | Bukti |
| --- | --- | --- | --- |
| 1 | Database SUMENEP | **ada**: `u123456789_sumenep` (dari pemilik) | Isi, charset, dan bukan-WordPress dicek `hosting:check` |
| 2 | Versi MariaDB | **LULUS: 11.8.9-MariaDB-log** | Dibaca dari handshake server `srvNNN.hstgr.io:3306` tanpa login |
| 3 | TLS ke 3306 | **didukung**; autentikasi bawaan `mysql_native_password` | Flag kapabilitas handshake |
| 4 | Binary log, batas koneksi, hak user, charset, zona waktu | belum: butuh login | `hosting:check` |
| 5 | `CREATE TRIGGER` | belum: butuh login | `hosting:check --trigger-test` |
| 6 | User kedua / hak per tabel | belum dikonfirmasi; menurut dukungan Hostinger satu user per database | Tidak menghalangi rencana (mode satu user) |
| 7 | SSH | **port 65002 terbuka (OpenSSH 9.9)**; kunci khusus `sumenep_hostinger_ed25519` **belum didaftarkan** (satu percobaan sebelumnya dengan kunci umum laptop: `Permission denied (publickey,password)`); sidik jari belum dicocokkan dengan hPanel | Host key RSA `SHA256:ikvmucfm…`, ECDSA `SHA256:Ja94GhDv…`, ED25519 `SHA256:BzVVkNV+…` |
| 8 | Folder media/backup, hak tulis, disk, Node.js di SSH | belum: butuh SSH | `hosting:check` |
| 9 | Persistensi media setelah redeploy | belum: butuh SSH + satu redeploy | §10 |

### 11.3 Tindakan minimal pemilik
1. hPanel → **Advanced → SSH Access**, kartu *SSH details*: cocokkan username (`u123456789`), port (`65002`), dan tiga sidik jari host key dengan yang tercatat di [`deploy/hostinger_known_hosts`](../deploy/hostinger_known_hosts). Bila ada yang berbeda, berhenti.
2. Aktifkan SSH bila belum aktif (tanpa mengganti password), lalu **Add SSH key**: tempel kunci publik khusus `~/.ssh/sumenep_hostinger_ed25519.pub` (`ssh-ed25519 … sumenep-hostinger-u123456789`).
3. hPanel → **Databases → Management**: salin persis nama database dan nama user SUMENEP ke `.env.hostinger-db.local` (`HOSTINGER_DB_NAME`, `HOSTINGER_DB_USER`), isi `HOSTINGER_DB_PASSWORD`, simpan. Jangan kirim isinya ke chat.

Setelah itu seluruh pemeriksaan berjalan otomatis dengan `npm run hosting:check`. Sesudah Tahap E: hapus kunci itu di hPanel, nonaktifkan SSH bila sebelumnya nonaktif, dan kosongkan password di `.env.hostinger-db.local`.
