# Infrastruktur & Jalur Deployment Produksi SUMENEP

Dokumen acuan wajib bagi **Fase 5 dan seluruh fase berikutnya** pada **`sumenep.matamaduranews.com`** (*SUMENEP – Mata Madura*).

Status implementasi di branch **`release/fase-4-production`** (23 November 2026):
- Integrasi **Fase 4 (CMS Artikel + TipTap + Media + Pratinjau)** dengan perbaikan **Fase 3** (tombol mata password `/admin/login`), konflik dependensi/`package-lock.json`, `postinstall: prisma generate`, serta adapter **Cloudflare R2 (`@aws-sdk/client-s3`)** sudah selesai di kode dan teruji.
- Layanan eksternal produksi (**Neon PostgreSQL Launch Singapore**, bucket/token **Cloudflare R2**, serta panel/deploy **Hostinger Web Apps**) **belum aktif/belum dieksekusi** karena credential akun berada di tangan pemilik.

### Status produksi teramati (24 November 2026, `npm run prod:smoke`)

- `origin/main` = `e4e38bf` (sama dengan `release/fase-4-production`) dan **kode Fase 4 sudah berjalan di production**: tombol mata di `/admin/login` dan rute `/media/[...key]` sudah ada. Teramati: push ke `main` langsung ter-deploy (lihat §4).
- **PostgreSQL belum terhubung:** `/api/admin/me` dengan token sesi acak menjawab `500` (seharusnya `401`). Login Admin belum bisa dipakai.
- **Media R2 belum siap:** `/media/<key acak>` menjawab `500` (seharusnya `404`).
- Beranda, halaman artikel seed, `robots.txt` (`Disallow: /`), proteksi `/admin`, penolakan lintas-origin, dan website induk normal.
- Tindakan berikutnya ada di §8.4: semuanya memerlukan akun pemilik.

---

## 1. Arsitektur Production Final & Batasan Mutlak

| Komponen | Ketentuan Produksi | Lokasi / Keterangan |
| --- | --- | --- |
| **Hosting utama** | **Hostinger Business Web Hosting** (paket aktif bersama website induk) | Singapura (`hpanel`, `Server: hcdn`) |
| **Website induk** | `matamaduranews.com` (**WordPress + PHP 8.3.37**) | A record teramati `185.124.137.170` & `88.223.91.122`, `X-LiteSpeed-Cache: hit` — **tidak boleh diubah/terganggu** |
| **Aplikasi SUMENEP** | `sumenep.matamaduranews.com` (**Next.js 16 + React 19 + Node.js**) | A record teramati `88.223.91.58` & `153.92.12.225` (edge `hcdn`), direktori/vhost/env terpisah dari WordPress |
| **Database CMS** | **Neon Launch PostgreSQL** | AWS Asia Pacific Singapore (`aws-ap-southeast-1`), database khusus SUMENEP |
| **Media storage** | **Cloudflare R2** (`@aws-sdk/client-s3@3.1175.0`, S3-compatible API) | Bucket khusus SUMENEP (`S3_ENDPOINT`, `S3_BUCKET`, opsional custom domain `R2_PUBLIC_URL`) |
| **DNS & Nameserver** | Tetap di Hostinger (`ns1.dns-parking.com`, `ns2.dns-parking.com`) | **Tidak diubah** |

**Batasan operasional:**
- Jangan membeli paket hosting baru atau memigrasikan website ke VPS.
- Jangan mengubah website induk `matamaduranews.com` maupun record DNS/nameserver tanpa persetujuan pemilik.
- Jangan memakai database WordPress, database development lokal (`127.0.0.1:54329`), database Busacare, atau database MataGen.
- Jangan menimpa environment variables website lain atau menyimpan secret ke repository Git, log, screenshot, atau chat.
- Pertahankan `Disallow: /` di `robots.txt` (`NEXT_PUBLIC_SITE_ENV=staging`) hingga website dinyatakan siap dibuka ke mesin pencari.

---

## 2. Branch & Integrasi Kode Fase 4

| Referensi | Isi & Status |
| --- | --- |
| `f62ef97` | Baseline production sebelum Fase 4 (homepage redesain + Fase 2–3, tanpa tombol mata login). Titik rollback, lihat §8.3. |
| `origin/main` & `main` (`e4e38bf`) | **Sedang berjalan di production** sejak 24 November 2026: fast-forward ke `release/fase-4-production`. |
| `backend/fase-4-cms-artikel` (`6f49299`) | Branch sumber CMS Artikel (TipTap, upload/crop `sharp`, pratinjau `/pratinjau/[id]`, `/media/[...key]`). |
| `integrasi/cms-produksi` (`53d68a8`) | Hasil merge bersih Fase 4 ke `f62ef97` setelah konflik `package-lock.json` dibereskan. |
| `release/fase-4-production` | **Branch rilis final Fase 4:** menggabungkan `53d68a8` + tombol mata login Fase 3 (`LoginForm.tsx` & `02-browser.test.ts`) + adapter R2 S3 + `docs/INFRASTRUCTURE.md` + `.env.example` + lockfile bersih. |

---

## 3. Dependensi, Node.js & Kompatibilitas Hostinger Singapore

### 3.1 Versi Node.js Minimum & Rekomendasi

| Paket | Versi di `release/fase-4-production` | `engines.node` | Keterangan |
| --- | --- | --- | --- |
| Proyek | `0.1.0` | `>=20.9.0` | `.nvmrc = 22` |
| `next` | `16.4.6` | `>=20.9.0` | Build memakai `next build --webpack` |
| `react` / `react-dom` | `19.3.1` | `>=0.10.0` (react) | App Router + Server Actions |
| `@prisma/client` & `prisma` | `6.19.3` | `>=18.18` | `engineType = "client"` |
| `@prisma/adapter-pg` | `6.19.3` | `-` | Pure-JS adapter |
| `pg` | `8.23.1` | `>= 16.0.0` | Mendukung `sslmode=verify-full` |
| `sharp` | `0.35.5` | `>=20.9.0` | Prebuild Linux x64/musl tersedia |
| `@aws-sdk/client-s3` | `3.1175.0` | `>=20.0.0` | Client S3 untuk Cloudflare R2 |
| `@tiptap/*` | `2.27.3` | `-` | Editor artikel |
| `lucide-react` / `zod` | `1.66.0` / `4.6.7` | `-` | Ikon UI & validasi |

- **Minimum mutlak:** **Node.js `20.9.0`** (wajib untuk `next@16.4.6` dan `sharp@0.35.5` — Node `20.0.0`–`20.8.x` tidak memenuhi syarat).
- **Direkomendasikan:** **Node.js `22.x` LTS** (sesuai `.nvmrc` dan lingkungan verifikasi lokal `v22.22.2`).

### 3.2 Penyelesaian Konflik & Clean Install (`npm ci`)

- Konflik `package-lock.json` pada merge Fase 4 diselesaikan dengan lockfile tunggal yang konsisten terhadap `package.json`.
- Paket yang dibutuhkan pada tahap `npm ci` + `next build` di server Hostinger (`prisma`, `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom`) ditempatkan di `dependencies`, dan script `"postinstall": "prisma generate"` ditambahkan agar Prisma Client otomatis terbuat walau `NODE_ENV=production` aktif saat install.
- `@playwright/test` yang tidak terpakai (seluruh uji memakai `playwright-core`) dihapus dari `dependencies` agar instalasi produksi tetap ramping.

---

## 4. Perintah Build, Start & Deployment Hostinger

| Pengaturan Hostinger | Nilai | Catatan |
| --- | --- | --- |
| **Framework** | Next.js | Output `.next` (Node.js server, bukan static export) |
| **Versi Node.js** | `22.x` (min `20.9.0`) | Sesuai `.nvmrc` |
| **Install command** | `npm ci` | Otomatis menjalankan `postinstall` (`prisma generate`) |
| **Build command** | `npm run build` | Menjalankan `next build --webpack` (**wajib `--webpack`** karena Turbopack panic di Hostinger) |
| **Start command** | `npm start` | Menjalankan `next start` yang membaca `$PORT` Hostinger |

### Jalur Deployment Resmi di Hostinger

1. **Git Deployment via hPanel (Jalur Utama):**
   - Repository `hamrasidi7-rgb/sumenep.matamadura` **tidak memiliki** `.github/workflows/*` dan tidak memiliki repository webhook (`gh api .../hooks` = `[]`). Namun teramati: setelah push ke `main` (`f62ef97` pada 21 November, `e4e38bf` pada 24 November) versi baru langsung tampil di production, jadi integrasi GitHub Hostinger kemungkinan aktif lewat GitHub App (tidak tampil sebagai webhook). **Perlakukan setiap push ke `main` sebagai deploy production.**
   - Hubungkan/arahkan Web App `sumenep.matamaduranews.com` di **hPanel → Websites → Web Apps** ke branch rilis yang disetujui (`release/fase-4-production`, atau setelah di-fast-forward ke `main`), lalu picu **Deploy** dari hPanel.
2. **Hostinger API (`scripts/hostinger.mjs` lama di `main-backup-nov20`):**
   - Tidak wajib dipakai dan saat ini `.env.hostinger` (`HOSTINGER_API_TOKEN`) kosong.
   - **Peringatan:** jangan menjalankan `scripts/hostinger.mjs deploy` lama karena menimpa seluruh Environment Variables di Hostinger.

---

## 5. Integrasi Neon PostgreSQL & Migrasi Database

- **Driver tanpa engine native:** `prisma/schema.prisma` (`engineType = "client"`) + `@prisma/adapter-pg` + `pg` (`src/server/db/client.ts`), `max: 5` pool, dan handler `onPoolError` / `onConnectionError` untuk menangani auto-suspend compute Neon.
- **Pemisahan koneksi:**
  - `DATABASE_URL` (dipasang di **Hostinger hPanel**): memakai endpoint pooler Neon (`-pooler`) dengan role runtime minimum (`DB_APP_ROLE`, mis. `sumenep_app`) + `?schema=public&sslmode=verify-full`.
  - `DIRECT_URL` + `DB_APP_ROLE` (**hanya di komputer operator**, jangan dipasang di web runtime): memakai endpoint direct (non-pooler) untuk `npm run db:migrate`, `db:grants`, `db:seed`, `admin:bootstrap`, dan `admin:recover`.
- **Migrasi & integrity rules (`prisma/migrations/`):**
  - `20261120193912_init`: 17 tabel, 6 enum.
  - `20261120194038_integrity_rules`: 42 `CHECK`, 7 trigger (termasuk akun Admin tunggal `id = 1` dan `activity_log` append-only).
  - Eksekusi aman (non-destruktif) dari mesin operator menggunakan file env sementara yang segera dihapus setelah selesai:
    ```bash
    npm run db:migrate -- --env-file .env.production.local --yes
    npm run db:seed -- --env-file .env.production.local --yes
    npm run db:verify -- --env-file .env.production.local
    npm run admin:bootstrap -- --env-file .env.production.local
    npm run db:verify -- --env-file .env.production.local
    ```
  - **Role runtime wajib dibuat dengan SQL, bukan lewat Neon Console/CLI/API.** Role yang dibuat lewat Console otomatis menjadi anggota `neon_superuser` (termasuk `pg_write_all_data` dan `BYPASSRLS`), sehingga bisa menulis ke semua tabel dan hak minimum dari `grants.ts` tidak berarti. `db:migrate` dan `db:verify` akan gagal bila role seperti itu dipakai. Jalankan di **Neon Console → SQL Editor** sebagai role pemilik database (mis. `neondb_owner`), dengan password acak panjang yang langsung disimpan di password manager:
    ```sql
    CREATE ROLE sumenep_app LOGIN PASSWORD '<password-acak-panjang>';
    ALTER ROLE sumenep_app SET "TimeZone" TO 'UTC';
    ```
    Hak per tabel diberikan oleh `npm run db:migrate` (memanggil `grants.ts`). Bila `ALTER DATABASE … SET "TimeZone"` ditolak, jalankan juga `ALTER ROLE <role-pemilik> SET "TimeZone" TO 'UTC';`.
  - **`npm run db:verify`** (read-only, satu transaksi `READ ONLY` yang selalu di-`ROLLBACK`): memeriksa migrasi, 17 tabel, 42 `CHECK`, 7 trigger aktif, trigger append-only Activity Log, constraint satu Admin dan jumlah Admin, atribut serta keanggotaan role runtime, 13 hak per tabel, sesi UTC, `sslmode=verify-full`, dan data awal. Aman dijalankan ke production kapan saja.

---

## 6. Integrasi Cloudflare R2 (Implementasi Final)

Implementasi berada di [`src/server/media/storage.ts`](../src/server/media/storage.ts), [`src/server/media/service.ts`](../src/server/media/service.ts), [`src/server/articles/queries.ts`](../src/server/articles/queries.ts), [`src/app/media/[...key]/route.ts`](../src/app/media/%5B...key%5D/route.ts), [`next.config.ts`](../next.config.ts), dan [`src/proxy.ts`](../src/proxy.ts):

- **Antarmuka tetap:** `MediaStorage` (`put`, `get`, `remove`) tidak diubah sehingga pipeline Sharp (`15 MB` max, decode dari byte asli, auto-rotate EXIF, strip EXIF, resize `max 2400 px`, format WebP, deduplikasi SHA-256) dan `ArticleEditor` / `MediaPicker` tetap utuh.
- **Adapter `S3Storage` (`@aws-sdk/client-s3@3.1175.0`):**
  - Memakai `forcePathStyle: true`, `region: S3_REGION || "auto"`, serta `requestChecksumCalculation: "WHEN_REQUIRED"` dan `responseChecksumValidation: "WHEN_REQUIRED"` demi kompatibilitas penuh dengan endpoint Cloudflare R2 (`https://<account-id>.r2.cloudflarestorage.com`).
  - Setiap `put()` menyertakan `ContentType` (`image/webp`) dan `CacheControl: "public, max-age=31536000, immutable"`.
  - Validasi ketat `assertMediaKey` (`/^\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/`) sebelum panggilan S3; jika transaksi database gagal setelah upload baru, `service.ts` membersihkan objek R2 yang baru dibuat (kecuali jika `sha256` sudah terdaftar).
- **Wajib R2 di Production:** dalam `NODE_ENV === "production"`, `resolveStorageSelection()` **menolak `LocalStorage`** (bahkan jika `MEDIA_DRIVER=local` dipasang) dan mewajibkan variabel R2 lengkap (`MEDIA_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). `LocalStorage` hanya dipakai di development/unit/db test atau flag khusus internal E2E lokal (`SUMENEP_LOCAL_MEDIA_FOR_E2E_ONLY=1`).
- **Akses Gambar (`/media/[...key]` vs Custom Domain `R2_PUBLIC_URL`):**
  - Default (bucket privat tanpa `R2_PUBLIC_URL`): `buildMediaUrl(key)` menghasilkan `/media/<key>`, disajikan lewat `/media/[...key]` dengan `Cache-Control: public, max-age=31536000, immutable` pada `200` dan `Cache-Control: no-store` pada `404`.
  - Jika custom domain R2 diaktifkan melalui `R2_PUBLIC_URL` (mis. `https://media.sumenep.matamaduranews.com`): `buildMediaUrl(key)` langsung memancarkan URL custom domain tersebut, `next.config.ts` otomatis mendaftarkannya ke `images.remotePatterns`, dan `src/proxy.ts` otomatis mengizinkan origin-nya pada `img-src` CSP.

---

## 7. Konfigurasi Environment Variables & Cache CDN (`hcdn`)

Template lengkap tanpa secret ada di [`.env.example`](../.env.example).

| Variabel | Scope Hostinger (Runtime / Build) | Scope Operator CLI |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://sumenep.matamaduranews.com` (build-time) | — |
| `NEXT_PUBLIC_SITE_ENV` | `staging` (`Disallow: /`) s.d. siap rilis | — |
| `DATABASE_URL` | Neon `-pooler` + role minimum + `sslmode=verify-full` | Sama |
| `DIRECT_URL`, `DB_APP_ROLE` | **Tidak dipasang di Hostinger** | Endpoint direct Neon untuk migrasi/CLI |
| `MEDIA_DRIVER` | `s3` | `local` (dev/test) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Kredensial bucket R2 khusus SUMENEP | Tidak wajib saat migrasi DB |
| `R2_PUBLIC_URL` | Opsional custom domain publik R2 (kosong = `/media/<key>`) | — |
| `CMS_PUBLIC_ARTICLES` | `"on"` bila `/artikel/[slug]` siap membaca DB CMS | — |
| `CMS_CACHE_SECONDS` | `60` | — |
| `ADMIN_ALLOWED_HOSTS`, `TRUSTED_PROXY_COUNT`, `CLIENT_IP_HEADER` | Sesuaikan header proxy `hcdn` Hostinger | — |

**Catatan CDN & Proxy:** `src/proxy.ts` melindungi `/admin/:path*`, `/api/admin/:path*`, dan `/pratinjau/:path*` dengan `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, CSP nonce, serta validasi CSRF `Origin` + `Sec-Fetch-Site: same-origin`.

---

## 8. Prosedur Deployment, Smoke Test, Backup & Rollback

### 8.1 Urutan Deployment ke Hostinger Singapore

1. Siapkan database **Neon Launch Singapore** + runtime role **via SQL** (§5) dan bucket **Cloudflare R2** + API token S3 scoped ke bucket tersebut.
2. Dari komputer operator, siapkan `.env.production.local` sementara (git-ignored) lalu jalankan urutan di §5: `db:migrate` → `db:seed` → `db:verify` → `admin:bootstrap` (password Admin diketik sendiri oleh pemilik di terminal, tidak pernah lewat chat) → `db:verify` (harus `0 gagal` dan "tepat 1 Admin"). Hapus `.env.production.local` setelah selesai.
3. Di **hPanel → Websites → Web Apps → `sumenep.matamaduranews.com`**, catat Commit SHA aktif, pastikan **Node.js `22.x`**, Install `npm ci`, Build `npm run build`, Start `npm start`, lalu isi seluruh Environment Variables produksi (`NEXT_PUBLIC_*`, `DATABASE_URL`, `MEDIA_DRIVER=s3`, `S3_*`, `CMS_PUBLIC_ARTICLES=on`, opsional `R2_PUBLIC_URL`). **Jangan** isi `DIRECT_URL` di Hostinger.
4. Kode Fase 4 sudah ada di `main` (`e4e38bf`), jadi tidak perlu push baru: cukup **Redeploy/Rebuild** dari hPanel agar Environment Variables terbaca (`NEXT_PUBLIC_*` dibaca saat build).
5. Jalankan `npm run prod:smoke`: semua baris harus `[OK]`, terutama **PostgreSQL** (`401` untuk sesi acak) dan **Media (R2)** (`404` untuk objek acak). Lalu lanjutkan uji manual §8.2.

### 8.2 Checklist Smoke Test Pasca-Deployment

`npm run prod:smoke` (read-only, tanpa login, tanpa menulis data) memeriksa otomatis beranda, `robots.txt`, header `/admin/login`, redirect `/admin`, `401` tanpa sesi, koneksi PostgreSQL, koneksi R2, `/artikel/<slug acak>`, penolakan `403` lintas-origin, dan website induk. Sisanya diuji manual oleh pemilik setelah login:

- [ ] `https://sumenep.matamaduranews.com/` tampil normal (`200 OK`), navigasi desktop/mobile bekerja, dan `https://matamaduranews.com/` (WordPress) tetap normal (`200 OK`).
- [ ] `https://sumenep.matamaduranews.com/robots.txt` tetap `Disallow: /` selama `NEXT_PUBLIC_SITE_ENV=staging`.
- [ ] `https://sumenep.matamaduranews.com/admin/login` tampil (`no-store`, `noindex`), ikon mata password berfungsi tanpa men-submit form, dan login Admin berhasil membuat session di Neon (`__Host-sumenep_admin`).
- [ ] Dashboard `/admin`, `/admin/artikel`, pembuatan artikel + editor TipTap, autosave, dan `/pratinjau/[id]` (`noindex, no-store`) berfungsi.
- [ ] Unggah gambar lewat CMS (`/api/admin/media` `201`), objek tersimpan di Cloudflare R2, dan gambar tampil melalui `/media/<key>` (`200 OK`, `immutable`) atau `R2_PUBLIC_URL`.
- [ ] Publikasi artikel membuat `/artikel/<slug>` terbaca oleh publik (`CMS_PUBLIC_ARTICLES=on`), serta `/api/admin/me` mengembalikan `401` tanpa session dan `403` untuk request lintas origin (`matamaduranews.com`).

### 8.3 Backup, Recovery & Rollback ke `f62ef97`

- **Backup sebelum perubahan produksi:** manfaatkan **Neon Point-in-Time Restore (PITR)** (riwayat Launch hingga 7 hari) dan/atau snapshot logis `pg_dump` sebelum mengubah data.
- **Rollback aplikasi ke `f62ef97`:**
  1. Arahkan deploy Web App SUMENEP di hPanel kembali ke commit `f62ef97` (`origin/main` sebelum Fase 4) dan jalankan ulang build/restart Web App.
  2. **Kompatibilitas database:** skema Fase 4 tidak menambah migrasi destruktif maupun menghapus tabel/kolom Fase 2–3 — `f62ef97` tetap dapat berjalan dengan tabel PostgreSQL yang ada. **Jangan pernah menjalankan `prisma migrate reset` atau `DROP TABLE`.**
  3. Bila perlu memulihkan data Neon, lakukan PITR ke **branch Neon terpisah** terlebih dahulu untuk verifikasi sebelum mempromosikan/memulihkan data.

### 8.4 Tindakan Manual yang Masih Memerlukan Akses Pemilik

1. Pembuatan/penyediaan project **Neon Launch Singapore**, role runtime `sumenep_app` lewat SQL (§5), connection string `DATABASE_URL` & `DIRECT_URL`, serta eksekusi interaktif `admin:bootstrap`.
2. Pembuatan bucket **Cloudflare R2** + API token S3 (serta pengaturan DNS/custom domain R2 jika memilih opsi `R2_PUBLIC_URL`).
3. Pengisian Environment Variables produksi dan eksekusi/pemicuan Git Deploy Web App `sumenep.matamaduranews.com` di **hPanel Hostinger**.
