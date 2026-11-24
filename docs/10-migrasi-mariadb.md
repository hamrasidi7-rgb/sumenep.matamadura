# Migrasi backend: PostgreSQL/R2 → MariaDB + disk Hostinger

Status: **Tahap B dan C selesai di lokal; Tahap D: semua yang bisa diotomatisasi selesai, menunggu akses SSH + password database dari pemilik** (branch `migration/hostinger-mysql`, belum di-commit, belum di-push, production tidak berubah). Diuji dengan MariaDB **10.11.20** dan **11.8.9** (versi server Hostinger), paket resmi archive.mariadb.org.

## 1. Ringkasan keputusan

| Bagian | Sebelum (Fase 2–4) | Sesudah |
| --- | --- | --- |
| Database | PostgreSQL 16 (rencana Neon) | MariaDB Hostinger |
| Driver Prisma | `@prisma/adapter-pg` + `pg` | `@prisma/adapter-mariadb` 6.19.3 + `mariadb` 3.4.5 (tetap tanpa engine native) |
| Media | Cloudflare R2 wajib di production | Disk Hostinger (`MEDIA_ROOT` di luar folder aplikasi); S3/R2 hanya opsional |
| Data produksi lama | — | Tidak ada: database PostgreSQL dan bucket R2 produksi tidak pernah dibuat |

## 2. Padanan fitur PostgreSQL di MariaDB

| PostgreSQL | MariaDB | Catatan |
| --- | --- | --- |
| `uuid` + `gen_random_uuid()` | `CHAR(36)` + `uuid()` dari Prisma | Id dibuat aplikasi |
| `timestamptz(3)` | `DATETIME(3)` berisi UTC | Setiap koneksi `SET time_zone = '+00:00'`; server uji sengaja +07:00 untuk membuktikannya |
| `text` | `VARCHAR(n)` sesuai validasi, `TEXT`/`MEDIUMTEXT` untuk teks panjang | Batas ≥ batas validasi Zod |
| `text[]` (tags) + indeks GIN | `JSON` array + CHECK `JSON_TYPE = 'ARRAY'` | Filter `array_contains`; `toTags()` mempersempit tipe |
| `jsonb` | `JSON` (MariaDB: LONGTEXT + `json_valid`) | Default `{}`/`[]` diisi Prisma |
| enum | `ENUM(...)` | Sama |
| `ILIKE` / `mode: "insensitive"` | Collation `utf8mb4_unicode_ci` (case-insensitive) | Pencarian tetap tidak peka huruf besar |
| 42 CHECK constraint | 42 CHECK constraint, nama sama | Regex peka huruf memakai `(?-i)`; perbandingan huruf kecil memakai `CAST(... AS BINARY)` |
| FK `ON UPDATE CASCADE` pada kolom yang dipakai CHECK | `ON UPDATE RESTRICT` untuk `kanal_id`, `rubrik_id`, `hero_media_id` | MariaDB menolak CHECK pada kolom FK beraksi CASCADE (error 1901). Id tidak pernah berubah |
| 7 trigger (plpgsql) | Lihat §3 | |
| Role runtime + `GRANT` per skema | User runtime + `GRANT` per tabel (bila ada user kedua) | Hostinger: satu user per database → mode satu user |
| `SELECT … FOR UPDATE` | Sama | Penguncian akun login dan state artikel |
| Hak `TRUNCATE` | Butuh `DROP` | User runtime terpisah tidak punya `DROP` |

## 3. Trigger: kenapa dipindah, dan ke mana

Uji lokal dengan binary logging aktif (kondisi umum shared hosting) membuktikan: user tanpa SUPER **tidak bisa** `CREATE TRIGGER` (MariaDB error 1419). Migrasi yang bergantung pada trigger akan gagal di Hostinger. Maka:

| Trigger PostgreSQL | Sekarang |
| --- | --- |
| `article_slug_history` (redirect 301) | Aplikasi, transaksi yang sama: `src/server/articles/history.ts` (dipanggil `createArticle` dan `bump()`) |
| `article_status_history` | Aplikasi, idem |
| `activity_log_append_only` | Guard aplikasi (`src/server/db/guards.ts`) + trigger opsional + hak akses user runtime |
| `activity_log_stamp` (waktu DB) | Guard aplikasi membuang `createdAt` kiriman → `DEFAULT CURRENT_TIMESTAMP(3)` + trigger opsional |
| `section_kind_immutable` | Guard aplikasi + trigger opsional |
| `article_section_kinds` | Service (`checkReferences`) + guard aplikasi + trigger opsional |
| `homepage_rubric_kind` | Guard aplikasi + trigger opsional |
| (baru) Admin & singleton tidak boleh dihapus | Guard aplikasi + trigger opsional (PostgreSQL: hak akses role) |

Trigger opsional ada di `prisma/sql/guard-triggers.sql` (11 trigger, hanya menolak/mencap waktu, tidak pernah menulis tabel lain sehingga tidak menggandakan riwayat). `npm run db:migrate` memasangnya bila host mengizinkan dan melaporkan hasilnya.

**Batas yang jujur:** dalam mode satu user tanpa trigger, pemegang password database (mis. lewat phpMyAdmin) masih bisa mengubah Activity Log dengan SQL langsung. Aplikasi sendiri tidak bisa. Di PostgreSQL hal yang sama berlaku bagi pemilik database. `npm run db:verify` menampilkan lapisan yang aktif.

## 4. Media di disk

- `resolveStorageSelection()`: default `local`; S3 hanya bila `MEDIA_DRIVER=s3` eksplisit (variabel S3 sisa tidak lagi mengalihkan production).
- Production: `MEDIA_ROOT` wajib absolut, di luar `process.cwd()` dan bukan di `.next`, atau aplikasi berhenti dengan pesan jelas.
- `LocalStorage`: key divalidasi pola ketat + path diperiksa tetap di dalam root; tulis atomik; izin `0640`/`0750`.
- Baru: `deleteMedia()` + `DELETE /api/admin/media/[id]` (409 bila gambar masih dipakai; UI tombol hapus menyusul di Fase 6). Nama berkas asli dibersihkan (`safeOriginalName`).

## 5. Pengujian Tahap B (lokal, Node.js 22.22.2, MariaDB 10.11.20)

| Suite | Hasil |
| --- | --- |
| Typecheck (app + tools) | lolos |
| Unit | 65/65 |
| Database, mode host tanpa trigger | 107 lolos, 2 dilewati (khusus lapisan trigger), 0 gagal |
| Database, trigger diizinkan | 109/109 |
| E2E (`next build --webpack` + `next start` + Chrome headless) | 36/36 |
| Drift `schema.prisma` vs database hasil migrasi | tidak ada |

Bug yang ditemukan dan diperbaiki selama Tahap B:
1. Guard jenis kanal/rubrik membaca lewat pool Prisma yang sama → `db:seed` (pool 1 koneksi) menunggu dirinya sendiri sampai timeout 5 detik. Diperbaiki: koneksi pendek tersendiri + cache (jenis section tidak pernah berubah); ditambah tes regresi.
2. `offset` adalah kata kunci MariaDB (alias kolom gagal).
3. CHECK pada kolom FK `ON UPDATE CASCADE` ditolak MariaDB (error 1901).

## 6. Tahap C: validasi (24 November 2026)

Lingkungan: Node.js 22.22.2, Next.js 16.4.6 (`next build --webpack`), React 19.3.1, Prisma 6.19.3, MariaDB 10.11.20 (binary log aktif, zona waktu server +07:00). Instalasi bersih `npm ci` + `prisma generate` (tanpa engine native; binary Linux x64 tetap ada di lockfile).

| Suite | Konfigurasi | Hasil |
| --- | --- | --- |
| Typecheck | app + tools | lolos |
| Unit | — | 68/68 |
| Database | user runtime terpisah, **tanpa trigger** | 111 lolos, 2 dilewati (khusus trigger), 0 gagal |
| Database | **satu user, tanpa trigger** (kondisi Hostinger) | 106 lolos, 3 dilewati (trigger, hak akses user terpisah), 0 gagal |
| Database | trigger diizinkan | 113/113 |
| E2E + smoke + simulasi media | user runtime terpisah | 44/44, smoke 9/9, media 7 berkas identik setelah restart & redeploy |
| E2E + smoke + simulasi media | satu user (Hostinger) | 44/44, smoke 9/9, media 7 berkas identik setelah restart & redeploy |

Tambahan pengujian Tahap C: `tests/db/13-transactions.test.ts` (rollback total, penyimpanan bersamaan, kunci baris login), `tests/e2e/06-media.test.ts` (upload/validasi/ukuran/akses/hapus lewat HTTP), `tests/unit/db-guards.test.ts` (penyaringan SQL mentah), mode `--single-user` untuk `test:db` dan `test:e2e`, smoke test dan simulasi restart/redeploy media di akhir `test:e2e`.

Bug ditemukan di Tahap C:
1. **Upload 10–15 MB gagal (400)** — sudah ada sejak Fase 4, bukan akibat migrasi: proxy Next.js (`src/proxy.ts` mencakup `/api/admin/*`) memotong body di 10 MB. Diperbaiki: `experimental.proxyClientMaxBodySize: "16mb"` di `next.config.ts`; berkas > 15 MB tetap 413.

Penguatan Activity Log di Tahap C: guard aplikasi kini juga menyaring SQL mentah lewat Prisma (`$queryRaw`/`$executeRaw` dan varian *Unsafe*) yang mengubah/menghapus Activity Log, menghapus Admin/singleton, atau mengubah trigger/tabel.

**Persistensi media:** yang terbukti hanya **simulasi lokal** (folder di luar aplikasi, restart, `.next` dihapus + build ulang). Persistensi **aktual di Hostinger belum terbukti** — butuh uji di server Hostinger (Tahap D).

## 7. Tahap D: persiapan produksi (24 November 2026)

Disiapkan dan diuji di lokal (branch yang sama, belum di-commit):

| Hasil | Berkas | Bukti |
| --- | --- | --- |
| Pemeriksaan database Hostinger (phpMyAdmin) | `prisma/sql/hostinger-probe.sql` | Bagian 1–4 hanya membaca; bagian 5–6 tabel uji sementara + uji trigger, lalu dihapus |
| Pemeriksaan server lewat SSH | `scripts/ops/hostinger-check.sh` | Diuji pada folder home tiruan: membuat `~/sumenep-data/{media,backups}`, uji tulis, penanda persistensi |
| Backup database + media dengan manifest SHA-256 | `scripts/ops/backup.mjs` (`npm run backup`) | `npm run test:backup` lulus |
| Restore yang tidak pernah menimpa | `scripts/ops/restore.mjs` (`npm run restore`) | `npm run test:backup`: CHECKSUM TABLE 18 tabel identik, CHECK/FK 48/18 sama, media SHA-256 sama, password Admin tetap berlaku; database berisi, folder berisi, berkas rusak ditolak |
| Template environment variables tanpa secret | `deploy/hostinger.env.template` | — |
| Build tanpa database | — | `prisma generate` + `next build --webpack` lulus tanpa `.env` dan tanpa `DATABASE_URL`/`DIRECT_URL` |
| Trigger tidak dipasang dari koneksi remote | `scripts/db/triggers.ts` | Disimulasikan dengan definer `user@127.0.0.%`: pemasangan dilewati dengan pesan jelas |

Fakta Hostinger dari dokumentasi resmi yang memengaruhi rencana: `hbuilds/` dan `public_html/` ditimpa setiap deployment; menyimpan Environment variables langsung me-redeploy; tidak ada rollback per-commit (revert lalu push); build gagal tidak mengganti build aktif; satu user per database (dukungan Hostinger).

### 7.1 Server Hostinger yang sebenarnya: MariaDB 11.8.9

Dibaca tanpa login dari handshake `srvNNN.hstgr.io:3306`: **11.8.9-MariaDB-log**, TLS didukung, autentikasi `mysql_native_password`. SSH `srvNNN.hstgr.io:65002` terbuka (OpenSSH 9.9); host key dipatok di `deploy/hostinger_known_hosts`.

Seluruh pengujian diulang pada MariaDB **11.8.9** lokal (paket resmi, SHA-256 cocok; binary log aktif, zona waktu server +07:00, collation bawaan `utf8mb4_uca1400_ai_ci`):

| Suite | Hasil 11.8.9 |
| --- | --- |
| Typecheck, unit | lulus, 68/68 |
| Database, user runtime terpisah, tanpa trigger | 112 lulus, 2 dilewati, 0 gagal |
| Database, satu user (Hostinger), tanpa trigger | 107 lulus, 3 dilewati, 0 gagal |
| Database, trigger diizinkan | 114/114 |
| Backup → restore | lulus (CHECKSUM 18 tabel identik, media SHA-256 sama, restore tidak pernah menimpa) |
| E2E + smoke + simulasi media, user terpisah | 44/44, smoke 9/9, 7 berkas identik setelah restart & redeploy |
| E2E + smoke + simulasi media, satu user | 44/44, smoke 9/9, 7 berkas identik setelah restart & redeploy |

**Bug yang hanya muncul di 11.8 (ditemukan dan diperbaiki di Tahap D):** MariaDB 11.6.2+ menyalakan `innodb_snapshot_isolation` secara bawaan (11.8.9: global ON). Dua penyimpanan artikel yang sama pada saat bersamaan lalu gagal dengan error **1020** ("Record has changed since last read"), bukan berakhir dengan satu sukses dan satu pesan konflik yang ramah. Perbaikan: setiap koneksi aplikasi menjalankan `SET time_zone = '+00:00' /*M!110602 , innodb_snapshot_isolation = OFF */` (`SESSION_SETUP_SQL` di `src/server/db/client.ts`). Komentar eksekusi khusus MariaDB itu hanya berlaku pada 11.6.2+, sehingga 10.11 tidak terpengaruh. Perilaku ini sama dengan yang dirancang dan diuji sejak Fase 2–4 (PostgreSQL READ COMMITTED, MariaDB 10.11). User biasa tanpa SUPER boleh mengubah variabel sesi ini (dibuktikan di 11.8.9). Tes baru di `tests/db/13-transactions.test.ts` memastikan setiap koneksi berjalan dengan snapshot isolation OFF.

### 7.2 Pemeriksaan Hostinger otomatis

- `npm run hosting:check` (`scripts/ops/hostinger-remote-check.mjs`): SSH dengan kunci khusus SUMENEP (host key dipatok, berkas akses diperiksa sebelum koneksi), tunnel ke MariaDB, menjalankan isi `prisma/sql/hostinger-probe-clean.sql`, perilaku transaksi, uji trigger dengan pengaman (hanya database SUMENEP yang kosong, selalu dibersihkan), backup uji lewat tunnel (hanya bila tidak ada tabel asing), dan `hostinger-check.sh` lewat SSH (menulis hanya di `~/sumenep-data`). Diuji lokal pada 11.8.9: trigger ditolak maupun diizinkan, database berisi tabel WordPress (dihentikan, tabel utuh), hanya tabel SUMENEP, dan sisa tabel uji.
- `scripts/ops/hostinger-tunnel.mjs -- <perintah>`: menjalankan satu perintah operator (mis. `npm run db:migrate -- --yes` di Tahap E) lewat tunnel, mode satu user; menolak reset/hapus database.
- Akses dibaca dari `.env.hostinger-db.local` (git-ignored, template `deploy/hostinger-db.env.template`); password tidak pernah dicetak.

## 8. Yang belum (menunggu pemilik, lihat INFRASTRUCTURE.md §11.3)

- Kunci SSH laptop belum terdaftar di hPanel, dan password database belum diisi di `.env.hostinger-db.local`. Setelah keduanya, `npm run hosting:check` menjawab sisanya secara otomatis: binary log, izin `CREATE TRIGGER`, `max_user_connections`, hak user, charset database, folder `~/sumenep-data/media`, hak tulis, kapasitas disk, alat backup.
- Bukti persistensi media setelah redeploy di Hostinger (butuh satu redeploy; Tahap E atau redeploy tanpa perubahan bila disetujui).
