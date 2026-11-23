# Infrastruktur & Jalur Deployment Produksi SUMENEP

Dokumen acuan wajib bagi seluruh fase pengembangan, integrasi CMS, dan deployment produksi **`sumenep.matamaduranews.com`** (*SUMENEP – Mata Madura*).

Status dokumen: **audit & kesiapan infrastruktur selesai (per 23 November 2026)**. Belum ada perubahan DNS, konfigurasi Hostinger, pembelian/aktivasi layanan, migrasi database produksi, maupun deployment produksi yang dijalankan dari dokumen ini.

---

## 1. Arsitektur Final & Batasan Mutlak

| Komponen | Keputusan Final | Lokasi / Keterangan |
| --- | --- | --- |
| **Hosting utama** | **Hostinger Business Web Hosting** (paket aktif bersama website induk) | Singapura (`hpanel`, `Server: hcdn`) |
| **Website induk** | `matamaduranews.com` (**WordPress + PHP 8.3.37**) | A record teramati `185.124.137.170` & `88.223.91.122`, `X-LiteSpeed-Cache` — **tidak boleh disentuh/terganggu** |
| **Aplikasi SUMENEP** | `sumenep.matamaduranews.com` (**Next.js 16 + React 19 + Node.js**) | A record teramati `88.223.91.58` & `153.92.12.225` (edge `hcdn`), direktori/vhost/env terpisah dari WordPress |
| **Database CMS** | **Neon Launch PostgreSQL** | AWS Asia Pacific Singapore (`aws-ap-southeast-1`), database khusus SUMENEP |
| **Media storage** | **Cloudflare R2** (S3-compatible API + AWS S3 SDK) | Bucket privat khusus SUMENEP (dilarang memakai disk lokal Hostinger di produksi) |
| **DNS & Nameserver** | Tetap di Hostinger (`ns1.dns-parking.com`, `ns2.dns-parking.com`) | **Tidak diubah** |

**Larangan keras:**
- Jangan merekomendasikan atau melakukan pembelian paket hosting baru maupun migrasi ke VPS sebagai solusi default.
- Jangan memindahkan website induk atau SUMENEP ke provider lain.
- Jangan mengubah DNS atau nameserver tanpa persetujuan eksplisit pemilik.
- Jangan memakai database WordPress, database development lokal (`127.0.0.1:54329`), database Busacare, atau database MataGen.
- Jangan menimpa environment variables atau direktori WordPress maupun aplikasi lain di akun Hostinger.
- Jangan menyimpan credential/secret ke repository Git, log, screenshot, atau chat.

---

## 2. Status Repository & Baseline Git Saat Audit

Verifikasi repository `hamrasidi7-rgb/sumenep.matamadura` pada tanggal audit:

| Referensi | Commit | Isi & Status |
| --- | --- | --- |
| `origin/main` & `main` | `f62ef97` | Sudah memuat `f2704a2` (`--webpack`), `c08d8f8` (Backend Fase 2), `80d5614` (Backend Fase 3 `/admin/login`), `01ccc5b` & `f62ef97` (redesain editorial). |
| `backend/fase-3-auth` | `f62ef97` + perubahan lokal UI login | Base commit sama persis dengan `origin/main` (`f62ef97`), ditambah perbaikan tombol mata tampil/sembunyikan password (`LoginForm.tsx`) dan E2E test (`02-browser.test.ts`). |
| `backend/fase-4-cms-artikel` | `6f49299` | Berisi CMS Artikel (TipTap, upload/crop `sharp`, pratinjau `/pratinjau/[id]`, rute `/media/[...key]` berbasis `LocalStorage`). **Belum digabung ke `origin/main` dan belum live.** |
| `integrasi/cms-produksi` (worktree `D:/subdomain.sumenep-mata-fase4`) | `f62ef97` (konflik merge tertunda pada `package-lock.json`) | Worktree terpisah untuk integrasi Fase 4; tidak dipakai pada jalur UI login-only. |
| `main-backup-nov20` | `1ad6d84` (atas `e788bb4`) | Snapshot sebelum Fase 2–3 dan redesain 21 November 2026; menyimpan skrip lama `scripts/hostinger.mjs`. |

**Verifikasi kondisi live (`https://sumenep.matamaduranews.com`) pada 23 November 2026:**
- Homepage `/` aktif melayani layout `f62ef97` (elemen `md:container-site`, `berita-utama`, aset `/Logo Pertama Header.png` → `200 OK`).
- `/admin/login` sudah aktif melayani `200 OK` (`Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`), namun belum memiliki tombol mata tampil/sembunyikan password (`f62ef97`).
- `/admin` mengembalikan `307 Temporary Redirect` ke `/admin/login` dan `/api/admin/me` mengembalikan `401 Unauthorized`.
- `/pratinjau/...` mengembalikan `404` (mengonfirmasi Fase 4 belum aktif di produksi).

---

## 3. Audit Kompatibilitas Node.js, Next.js & Dependensi Aktual

### 3.1 Versi Node.js Minimum & Rekomendasi

Audit langsung terhadap `package.json`, `.nvmrc`, `node_modules/*/package.json`, dan lockfile `backend/fase-4-cms-artikel` (`6f49299`):

| Paket | Versi (`f62ef97`) | Versi (`6f49299` Fase 4) | `engines.node` | Catatan |
| --- | --- | --- | --- | --- |
| `package.json` proyek | `0.1.0` | `0.1.0` | `>=20.9.0` | `.nvmrc` ditetapkan `22` |
| `next` | `16.4.6` | `16.4.6` | `>=20.9.0` | Syarat resmi Next.js 16 |
| `react` / `react-dom` | `19.3.1` | `19.3.1` | `>=0.10.0` (react) / `-` | App Router + Server Actions |
| `@prisma/client` & `prisma` | `6.19.3` | `6.19.3` | `>=18.18` | `engineType = "client"` |
| `@prisma/adapter-pg` | `6.19.3` | `6.19.3` | `-` | Pure-JS adapter |
| `pg` | `8.23.1` | `8.23.1` | `>= 16.0.0` | Mendukung `sslmode=verify-full` |
| `sharp` | Belum terpasang | `0.35.5` | `>=20.9.0` | Prebuild `@img/sharp-linux-x64` & `musl-x64` ada di lockfile Fase 4 |
| `playwright-core` (dev) | `1.65.1` | `1.65.1` | `>=20` | Hanya pengujian lokal |
| `lucide-react` | `1.66.0` | `1.66.0` | `-` | UI icons |
| `zod` | `4.6.7` | `4.6.7` | `-` | Validasi input/Server Actions |
| `@tiptap/*` (Fase 4) | Belum terpasang | `2.27.3` | `-` | Editor CMS Artikel |

**Kesimpulan versi Node.js untuk Hostinger Singapore:**
- **Versi minimum mutlak:** **Node.js `20.9.0`** (berdasarkan syarat ketat `next@16.4.6` dan `sharp@0.35.5`). **Jangan berasumsi semua Node `20.x` memenuhi syarat** — Node `20.0.0`–`20.8.x` akan gagal atau tidak didukung.
- **Versi yang direkomendasikan:** **Node.js `22.x` LTS** (sesuai `.nvmrc = 22` dan runtime uji lokal `v22.22.2` / `npm 10.9.7`).

### 3.2 Temuan Audit Dependensi & Clean Install (Untuk Fase Integrasi Berikutnya)

1. **`prisma` dan paket build di `devDependencies`:** pada `f62ef97` dan `6f49299`, `prisma`, `tailwindcss`, `@tailwindcss/postcss`, `typescript`, dan `@types/*` berada di `devDependencies`, dan `package.json` belum memiliki script `"postinstall": "prisma generate"`.
   - Jika server build Hostinger menjalankan `npm ci` dengan `NODE_ENV=production` (melewati `devDependencies`), build Next.js dan generate Prisma Client akan gagal.
   - Skrip postinstall `@prisma/client` (`node_modules/@prisma/client/scripts/postinstall.js`) mula-mula membuat berkas stub *throwing* di `node_modules/.prisma/client`, lalu hanya menjalankan `prisma generate` bila paket lokal `prisma` ditemukan (gagal/terlewati bila `devDependencies` tidak terpasang).
   - **Tindakan wajib sebelum integrasi Fase 4–8:** tambahkan `"postinstall": "prisma generate"` dan pindahkan `prisma`, `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` ke `dependencies` (seperti pola `e788bb4` dan rekomendasi `docs/05-backend-fondasi.md` §11.8).
2. **Paket uji di `dependencies` (`f62ef97`):** `@playwright/test: ^1.65.1` tercatat masuk ke `dependencies` pada `01ccc5b` padahal tidak diimpor oleh kode aplikasi dan membuat instalasi produksi membengkak. Hapus dari `dependencies` saat integrasi/pembersihan berikutnya (perbaikan UI login Opsi A tetap tidak mengubah `package.json`).
3. **Catatan keamanan dependensi (`npm audit`):** pada `f62ef97` tercatat 4 temuan tingkat *high* pada rantai CLI `prisma` (`prisma`, `@prisma/config`, `deepmerge-ts`, `effect` — tidak berjalan di web server produksi). Untuk branch Fase 4 (`6f49299`), jalankan ulang `npm audit` (termasuk terhadap `@tiptap/core@2.27.3`) saat integrasi Fase 4 sebelum CMS Artikel dibuka ke produksi.

---

## 4. Konfigurasi Build, Start & Deployment Hostinger

### 4.1 Perintah Resmi Aplikasi

| Tahap | Perintah di Hostinger | Isi di `package.json` | Keterangan |
| --- | --- | --- | --- |
| **Install** | `npm ci` | Standar npm (terkunci `package-lock.json`) | Pastikan `NODE_ENV` tidak melewati `devDependencies` selama paket build belum dipindah ke `dependencies` |
| **Build** | `npm run build` | `next build --webpack` | **Wajib mempertahankan `--webpack`.** Build Turbopack mengalami panic (`FATAL: An unexpected Turbopack error occurred`) di lingkungan build Hostinger (`f2704a2`) |
| **Start** | `npm start` | `next start` | Next.js otomatis membaca port dari `$PORT` platform Hostinger |
| **Output** | `.next` | Output standar Node.js App Router | Bukan `output: "export"` (fitur SSR, Route Handler, `proxy.ts`, Server Actions, dan `/_next/image` butuh server Node.js aktif) |

### 4.2 Audit Metode Deployment Aktual di Hostinger

1. **Integrasi GitHub / Git di hPanel (Websites → Web Apps):**
   - Repository `hamrasidi7-rgb/sumenep.matamadura` tidak memiliki workflow `.github/workflows/*`.
   - Keberadaan remote GitHub **tidak berarti GitHub auto-deploy (webhook) pasti aktif**. Status koneksi GitHub App / auto-deploy vs tombol **Deploy** manual harus diverifikasi langsung oleh pemilik di **hPanel → Web Apps → `sumenep.matamaduranews.com`**.
2. **Hostinger Official API (`scripts/hostinger.mjs`, hanya ada di `main-backup-nov20` commit `e788bb4`):**
   - Skrip ini **tidak ada** di `origin/main` (`f62ef97`), dan `.env.hostinger` (`HOSTINGER_API_TOKEN`) saat ini **kosong**, sehingga status Web App/Node version internal Hostinger belum bisa dibaca via API.
   - **PERINGATAN KRITIS:** `scripts/hostinger.mjs deploy` memanggil `PUT .../nodejs/builds/settings/env` yang melakukan **full replace** dan hanya menuliskan `NEXT_PUBLIC_SITE_URL` + `NEXT_PUBLIC_SITE_ENV=staging`. **Jangan gunakan perintah `deploy` pada skrip lama tersebut setelah environment variables produksi (`DATABASE_URL`, `S3_*`, dll.) terpasang di hPanel**, karena akan menghapus seluruh secret produksi.
3. **Upload Arsip Aman melalui hPanel (jika GitHub pull tidak tersedia):**
   - Unggah arsip bersih dari Git (`git archive --format=zip`) ke direktori aplikasi Web App SUMENEP **saja** (bukan `public_html` WordPress `matamaduranews.com`), lalu jalankan install/build/restart dari panel Node.js Web App tanpa menimpa env vars atau folder media lokal jika masih ada.

---

## 5. Audit Kesiapan Neon PostgreSQL (Produksi CMS)

Status saat audit: **Arsitektur kode Fase 2–3 siap, layanan Neon produksi belum diaktifkan.**

### 5.1 Arsitektur Koneksi & Prisma Tanpa Engine Native

- `prisma/schema.prisma` menggunakan `engineType = "client"` dengan `PrismaPg` (`@prisma/adapter-pg@6.19.3` + `pg@8.23.1`) dalam `src/server/db/client.ts`:
  - Query dikompilasi ke WebAssembly dan dikirim lewat driver JS murni `pg` — **nol native `.node` query engine binary**, aman terhadap keterbatasan OS/glibc container Hostinger.
  - `createPrismaClient()` memisahkan parameter `?schema=` dari URL via `splitSchema()`, membatasi pool default `max: 5` (aman untuk batas koneksi terkelola), serta menangani `onPoolError` dan `onConnectionError` agar tahan saat compute Neon mengalami auto-suspend (5 menit idle).

### 5.2 Pemisahan `DATABASE_URL` dan `DIRECT_URL` + Hak Minimum

| Variabel | Dipakai Oleh | Endpoint Neon | Hak Akses Role PostgreSQL | Ditaruh di Hostinger? |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Web app runtime (`getDb()`) | Host pooler Neon (`-pooler`) + `?schema=public&sslmode=verify-full` | Role runtime minimum (`DB_APP_ROLE`, mis. `sumenep_app`): `USAGE` schema; DML (`SELECT/INSERT/UPDATE/DELETE`) pada tabel CMS; `activity_log` **hanya `INSERT, SELECT`**; `admin_user`, `homepage_settings`, `site_settings` **hanya `SELECT, UPDATE`**; nol akses pada `_prisma_migrations`; nol kepemilikan tabel | **Ya** (hPanel Environment Variables Web App SUMENEP) |
| `DIRECT_URL` | Operator CLI (`db:migrate`, `db:grants`, `db:seed`, `admin:bootstrap`, `admin:recover`) | Host direct Neon (**non-pooler**) + `?schema=public&sslmode=verify-full` | Role pemilik skema/tabel untuk DDL & `prisma migrate deploy` | **TIDAK** (hanya di lingkungan operator terisolasi / `.env.production.local` sementara lalu dihapus) |
| `DB_APP_ROLE` | Skrip operator `scripts/db/grants.ts` | — | Nama role runtime (mis. `sumenep_app`) | **TIDAK** |

### 5.3 SSL, Timezone UTC & Integritas Database

- **SSL:** `pg-connection-string` (`pg@8.23.1`) menerima `sslmode=verify-full` tanpa warning deprecasi; wajib diaktifkan pada `DATABASE_URL` dan `DIRECT_URL` produksi Neon.
- **Timezone UTC:** `scripts/db/grants.ts` (`finalizeDatabase`) mencoba `ALTER DATABASE ... SET "TimeZone" TO 'UTC'` lalu memverifikasi sesi baru dari `DIRECT_URL` maupun `DATABASE_URL`.
  - **Catatan penting Neon:** apabila role owner Neon tidak memiliki izin `ALTER DATABASE` atau `CREATEROLE`, buat runtime role langsung melalui Neon Console/SQL lebih dulu, dan jalankan `ALTER ROLE <owner_role> SET "TimeZone" TO 'UTC';` serta `ALTER ROLE <app_role> SET "TimeZone" TO 'UTC';` sebelum/sesudah menjalankan `npm run db:grants`.
- **Migrasi & Trigger Terpasang (dalam repo `f62ef97`):**
  - `20261120193912_init`: 17 tabel, 6 enum.
  - `20261120194038_integrity_rules`: 42 `CHECK` constraint, 7 trigger (termasuk trigger `admin_user_single_admin` pengunci akun Admin tunggal `id = 1` dan `activity_log_append_only` penolak `UPDATE/DELETE/TRUNCATE`), serta singleton `homepage_settings` / `site_settings`.
  - Prosedur migrasi produksi wajib memakai `npm run db:migrate -- --env-file <file> --yes` (`prisma migrate deploy` + `finalizeDatabase`). Dilarang menjalankan `prisma migrate reset`, `db push --force-reset`, atau menghapus data.

---

## 6. Audit Kesiapan Cloudflare R2 (Media Storage)

Status saat audit: **Keputusan disetujui, bucket & SDK belum diimplementasikan di kode maupun diaktifkan di Cloudflare.**

### 6.1 Temuan Kesenjangan Kode Saat Ini

- Pada `origin/main` (`f62ef97`), modul Media Library belum ada.
- Pada `backend/fase-4-cms-artikel` (`6f49299`), `src/server/media/storage.ts` hanya memiliki driver `LocalStorage` (`MEDIA_ROOT || "media"`), belum menginstal `@aws-sdk/client-s3`, dan belum membaca variabel `S3_*`.
- `src/components/ui/MediaImage.tsx` menggunakan `next/image`, sehingga berkas dari `/media/<key>` diolah oleh Image Optimizer Next.js menggunakan `sharp@0.35.5` (membutuhkan Node `>=20.9.0` pada server Linux Hostinger).

### 6.2 Kebutuhan Implementasi Sebelum CMS Artikel (Fase 4–6) Diaktifkan ke Produksi

1. **Dependensi SDK:** pasang `@aws-sdk/client-s3` (S3-compatible client untuk Cloudflare R2).
2. **Driver `S3Storage` pada `src/server/media/storage.ts`:**
   - Implementasikan antarmuka `MediaStorage` (`put`, `get`, `remove`) memakai `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand` ke Cloudflare R2.
   - Pemilihan driver berdasarkan konfigurasi: `MEDIA_DRIVER=s3` memakai `S3Storage`; **tolak boot/upload memakai `LocalStorage` jika `NODE_ENV=production`** agar media tidak pernah tersimpan di disk sementara Hostinger.
   - Validasi integrasi R2: cek kompatibilitas checksum AWS SDK v3 terhadap R2 (`requestChecksumCalculation` / `responseChecksumValidation` bila versi SDK terbaru mengirim header checksum S3 yang berbeda) dan format endpoint `https://<account-id>.r2.cloudflarestorage.com`.
3. **Bucket & Keamanan Cloudflare R2 (saat diaktifkan pemilik):**
   - Satu bucket **privat** khusus SUMENEP (tanpa akses publik `r2.dev` dan tanpa perlu mengubah DNS `matamaduranews.com` ke Cloudflare).
   - Satu API token S3 scoped hanya ke bucket tersebut (*Object Read & Write*).
   - Penyajian gambar tetap melalui rute aplikasi `/media/[...key]` (`Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`); tambahkan header `Cache-Control: no-store` pada respons `404` di rute `/media/[...key]` agar `404` sementara tidak ter-cache di CDN.
4. **Environment Variables Produksi R2 (di hPanel Hostinger Web App SUMENEP):**
   `MEDIA_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

---

## 7. Audit Environment Variables & Cache CDN (`hcdn`)

### 7.1 Isolasi Environment Variables

- Seluruh variabel tercantum dalam template tanpa rahasia [`.env.example`](../.env.example).
- File `.env`, `.env.*` (kecuali `!.env.example`) diabaikan `.gitignore` (`status` lokal: hanya dev lokal `127.0.0.1:54329` dan `HOSTINGER_API_TOKEN` kosong).
- **Build-time vs Runtime di Next.js:** `NEXT_PUBLIC_SITE_URL` (`https://sumenep.matamaduranews.com`) dan `NEXT_PUBLIC_SITE_ENV` (`staging` selama belum diluncurkan; `production` hanya setelah persetujuan indeksasi) ditanam saat `next build --webpack`. Perubahan nilainya mewajibkan rebuild; perubahan secret server (`DATABASE_URL`, `S3_*`) mewajibkan restart/redeploy Web App di hPanel.

### 7.2 Audit Cache CDN (`hcdn`) & Keamanan Proxy

- **Rute Admin & API (`src/proxy.ts`):** `matcher` mencakup `/admin/:path*` dan `/api/admin/:path*` (di Fase 4 ditambah `/pratinjau/:path*`), memasang `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, CSP ketat berbasis *nonce* per request (`frame-ancestors 'none'`), dan validasi CSRF `checkSameOrigin()` yang mewajibkan `Origin` cocok serta `Sec-Fetch-Site: same-origin` (menolak request lintas-subdomain dari induk `matamaduranews.com`).
- **Terukur di produksi sekarang (`23 November 2026`):** `/admin/login` mengembalikan `x-hcdn-cache-status: DYNAMIC` dan `cache-control: no-store` — CDN Hostinger **tidak menyimpan** halaman login Admin.
- **Hal yang wajib diukur saat CMS aktif di produksi (Fase 8):**
  - Verifikasi header `Host` / `X-Forwarded-Host` di balik `hcdn` (isi `ADMIN_ALLOWED_HOSTS` hanya jika proxy Hostinger tidak meneruskan `sumenep.matamaduranews.com`).
  - Verifikasi header IP klien aktual (`X-Forwarded-For` vs header khusus) untuk menyetel `TRUSTED_PROXY_COUNT` atau `CLIENT_IP_HEADER` agar rate-limiting IP pada `/admin/login` tidak menganggap seluruh pengunjung berasal dari satu IP CDN.
  - Saat artikel CMS aktif membaca database (`CMS_PUBLIC_ARTICLES=on` / Fase 8), halaman publik yang bersumber dari CMS harus dinamis (`no-store` HTML di `hcdn` + Next.js Data Cache bertag sesuai `docs/06-cache-seo.md`) dan halaman statis redaksi menurunkan `revalidate` agar HTML tidak tertahan 1 tahun di CDN.

---

## 8. Prosedur Deployment Khusus SUMENEP

### Jalur A — Deployment Perbaikan UI Login Saja (Baseline `origin/main` = `f62ef97`)

Tujuan: membawa tombol mata tampil/sembunyikan password (`LoginForm.tsx`) ke `https://sumenep.matamaduranews.com/admin/login` tanpa membawa Fase 4 maupun mengubah DNS, WordPress, atau environment variables Hostinger.

1. **Verifikasi lokal pra-commit:**
   - Pastikan hanya file UI login & tes terkait yang masuk commit (`src/app/(admin)/admin/login/LoginForm.tsx`, `tests/e2e/02-browser.test.ts`; file dokumentasi/template opsional sesuai persetujuan commit; **jangan** memasukkan folder `qa/` atau skrip temp lokal).
   - Pastikan `npm run typecheck`, `npm run build` (`next build --webpack`), dan `npm run test:e2e` lulus 100%.
2. **Integrasi aman ke `origin/main` (setelah persetujuan pemilik):**
   - Karena `backend/fase-3-auth` berada tepat di commit `f62ef97` (identik dengan `origin/main`), commit bersih di atas `f62ef97` dapat di-fast-forward ke `main` dan di-push ke `origin/main` (`git checkout main && git merge --ff-only backend/fase-3-auth && git push origin main`).
   - Alternatif paling konservatif bila ada commit tambahan lain: `git cherry-pick <commit-ui-login>` di atas `origin/main` yang baru di-fetch.
   - **Larangan:** jangan `push --force`, jangan merge `backend/fase-4-cms-artikel` (`6f49299`), dan jangan menyentuh `main-backup-nov20`.
3. **Verifikasi metode & jalankan deploy di Hostinger Web App SUMENEP (oleh pemilik / setelah verifikasi hPanel):**
   - Masuk ke **hPanel → Websites → Web Apps → `sumenep.matamaduranews.com`** (pastikan **bukan** website `matamaduranews.com`).
   - Catat Commit SHA aktif sebelum deploy (untuk rollback).
   - Pastikan pengaturan tetap: Framework **Next.js**, Node.js **22.x** (min `20.9.0`), Install `npm ci`, Build `npm run build` (`next build --webpack`), Start `npm start`, Output `.next`.
   - **Jangan ubah** Environment Variables, Domain/Subdomain routing, atau file manager `matamaduranews.com`.
   - Jika GitHub auto-deploy sudah aktif dan build baru muncul otomatis di riwayat build hPanel untuk commit baru, pantau sampai selesai (`completed`). Jika tidak aktif, tekan tombol **Deploy / Redeploy** dari repository `hamrasidi7-rgb/sumenep.matamadura` branch `main` di hPanel (atau unggah arsip bersih `git archive` bila memakai metode arsip).
   - Jika CDN masih menyajikan chunk lama setelah build sukses, lakukan purge cache **khusus subdomain `sumenep.matamaduranews.com`** saja (halaman `/admin/login` sudah `no-store`, hanya cek jika aset statis terpengaruh).

### Jalur B — Deployment Integrasi CMS Penuh (Fase 4–6–8, Setelah Infrastruktur Aktif)

Jangan dijalankan sebelum prasyarat berikut selesai disetujui & diverifikasi:
1. Selesaikan konflik `integrasi/cms-produksi`, hapus `@playwright/test` dari `dependencies`, tambahkan `"postinstall": "prisma generate"`, dan pindahkan paket build (`prisma`, `tailwindcss`, `typescript`, `@types/*`) ke `dependencies`.
2. Implementasikan driver `S3Storage` (Cloudflare R2 via `@aws-sdk/client-s3`) dan larangan `LocalStorage` di produksi; uji build & E2E lengkap.
3. Aktifkan Neon Launch Singapore & buat database khusus SUMENEP + runtime role `DB_APP_ROLE`; jalankan dari mesin operator: `npm run db:migrate -- --env-file .env.production.local --yes`, `npm run db:seed`, `npm run admin:bootstrap` (password interaktif). Pastikan timezone sesi UTC & constraint satu Admin/Activity Log terverifikasi; hapus `.env.production.local` dari mesin operator setelah selesai.
4. Aktifkan bucket privat Cloudflare R2 & API token bucket-scoped.
5. Isi env produksi di **hPanel Web App SUMENEP** (`DATABASE_URL` pooler + `sslmode=verify-full`, `MEDIA_DRIVER=s3`, `S3_*`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_ENV`, serta hasil ukur `TRUSTED_PROXY_COUNT` / `CLIENT_IP_HEADER` / `ADMIN_ALLOWED_HOSTS` — **tanpa `DIRECT_URL`**), lalu deploy branch `main` yang terintegrasi.

---

## 9. Checklist Smoke Test & Prosedur Rollback

### 9.1 Checklist Smoke Test Pasca-Deployment (Read-Only + Uji Terkendali)

**Untuk Jalur A (Perbaikan UI Login):**
- [ ] `https://sumenep.matamaduranews.com/` merespons `200 OK`, layout homepage `f62ef97` normal, tanpa asset rusak atau error console.
- [ ] `https://sumenep.matamaduranews.com/robots.txt` tetap sesuai `NEXT_PUBLIC_SITE_ENV` yang terpasang (saat staging: `Disallow: /`).
- [ ] `https://sumenep.matamaduranews.com/admin/login` merespons `200 OK` dengan header `cache-control: no-store`, `x-robots-tag: noindex, nofollow`, `x-hcdn-cache-status: DYNAMIC`.
- [ ] Di desktop (1440 px) dan mobile (390 px), kolom `#password` menampilkan tombol ikon mata di sisi kanan dalam kotak input (rata tengah vertikal), password default tersembunyi (`type="password"`), klik ikon mengubah ke teks & ikon mata tercoret (`aria-pressed="true"`), klik ulang menyembunyikan kembali, dan **tidak memicu request `POST` / submit form**.
- [ ] `https://sumenep.matamaduranews.com/admin` tanpa login mengembalikan `307` ke `/admin/login`.
- [ ] `https://sumenep.matamaduranews.com/api/admin/me` tanpa sesi mengembalikan `401 Unauthorized`.
- [ ] Website induk `https://matamaduranews.com/` tetap merespons `200 OK` (WordPress PHP + LiteSpeed normal) dan record DNS (`A` & `NS`) tidak berubah.

**Tambahan Untuk Jalur B (Saat CMS + Neon + R2 Aktif):**
- [ ] Login Admin berhasil dengan akun bootstrap produksi, cookie `__Host-sumenep_admin` (`HttpOnly; Secure; SameSite=Lax; Path=/`) aktif, header IP klien (`TRUSTED_PROXY_COUNT`/`CLIENT_IP_HEADER`) & `Origin` terverifikasi (request dari `matamaduranews.com` tetap ditolak `403`).
- [ ] Dashboard Admin, halaman `/admin/akun` (ganti password & manajemen sesi), dan logout berfungsi normal; hanya ada 1 Admin di database.
- [ ] Pembuatan draft artikel, upload/crop media ke Cloudflare R2, penyimpanan, `/pratinjau/[id]` (tetap `noindex, no-store`), publikasi, dan `/media/<key>` (`200` + `immutable`) berjalan; `activity_log` tercatat.

### 9.2 Prosedur Rollback

| Skenario | Langkah Rollback Aman |
| --- | --- |
| **Build gagal di Hostinger** | App produksi lama tetap berjalan hingga build baru berhasil. Periksa log build di hPanel Web Apps, perbaiki pada branch kerja, jangan menimpa env atau website induk. |
| **Bug UI / Regresi runtime setelah Jalur A live** | 1. Dari repository lokal: `git revert <commit-ui-login>` lalu push ke `origin/main` (jangan `reset --hard` riwayat publik jika tim lain menarik dari `main`), ATAU pilih riwayat build commit sebelumnya (`f62ef97`) / re-deploy tag/commit stabil terakhir di hPanel.<br>2. Jalankan smoke test ulang pada `/`, `/admin/login`, dan `matamaduranews.com`. |
| **Regresi integrasi Jalur B (CMS/Database)** | 1. Kembalikan kode ke commit stabil terakhir (`f62ef97` atau rilis sebelumnya) via `git revert` + deploy Web App SUMENEP (atau set `CMS_PUBLIC_ARTICLES=` kosong jika hanya perlu menonaktifkan pembacaan artikel DB publik).<br>2. **Jangan pernah menjalankan `prisma migrate reset` atau menghapus tabel produksi.** Bila terjadi kesalahan data di Neon, lakukan *Point-in-Time Restore (PITR)* ke **branch Neon baru** terlebih dahulu, verifikasi isinya, baru tukar/pulihkan sesuai prosedur Neon. |
