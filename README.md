# SUMENEP – Mata Madura

Media editorial untuk `sumenep.matamaduranews.com`.
*Catatan, Berita, dan Perspektif tentang Sumenep.*

Aplikasi ini berdiri sendiri. Ia tidak mengubah WordPress `matamaduranews.com`, database, media, maupun DNS-nya.

**Stack:** Next.js 16.4 (App Router) · React 19.3 · TypeScript · Tailwind CSS v4 · lucide-react. Font Newsreader, Lora, dan Inter di-host sendiri lewat `next/font`. Backend CMS: Prisma 6.19 + MariaDB (Hostinger) + Zod (fondasi: [docs/05-backend-fondasi.md](docs/05-backend-fondasi.md); migrasi dari PostgreSQL: [docs/10-migrasi-mariadb.md](docs/10-migrasi-mariadb.md)).

## Status

| Tahap | Status |
| --- | --- |
| 1 · Audit & rencana | Selesai: [docs/01-audit-dan-rencana.md](docs/01-audit-dan-rencana.md) |
| 2 · Design system & logo | Selesai: [docs/02-design-system.md](docs/02-design-system.md) |
| 3 · Homepage responsif | Selesai. Lolos QA otomatis pada 12 lebar layar (360–1920 px) |
| 4 · Pengalaman artikel | Selesai: tiga template (Standard, Feature, Spotlight), lihat [docs/03-template-artikel.md](docs/03-template-artikel.md) |
| 5 · CMS | Fondasi backend (Fase 2): skema, migrasi, satu Admin, Activity Log append-only, CLI bootstrap/pemulihan, seed kanal/rubrik. Login dan keamanan Admin (Fase 3, branch `backend/fase-3-auth`): `/admin/login`, sesi database, cookie `__Host-`, penguncian, batas per IP, CSRF, dashboard awal; 142 tes ([docs/08-autentikasi-admin.md](docs/08-autentikasi-admin.md)). CMS artikel (Fase 4, branch `backend/fase-4-cms-artikel`): editor TipTap, simpan otomatis tanpa konflik, pratinjau, terbit/jadwal/arsip/tempat sampah, unggah gambar, SEO ([docs/09-cms-artikel.md](docs/09-cms-artikel.md)). Rancangan cache/SEO: [docs/06-cache-seo.md](docs/06-cache-seo.md); layanan eksternal: [docs/07-layanan-eksternal.md](docs/07-layanan-eksternal.md) |
| 6 · Chator AI | **Ditunda (keputusan pemilik proyek).** Widget tampil dengan status "sedang dalam pengembangan", tanpa integrasi |
| 7 · SEO & performa | Sebagian: metadata, canonical, `noindex` saat staging, robots.txt |
| 8 · Uji & deploy | Persiapan deployment Hostinger: [docs/04-deployment-hostinger.md](docs/04-deployment-hostinger.md). Deployment menunggu langkah pemilik di hPanel |

## Menjalankan

```bash
npm install
cp .env.example .env.local
npm run dev                # http://localhost:3200

npm run build && npm run start:local   # produksi lokal di :3200 (di server: npm start, port dari $PORT)
npm run typecheck
npm run qa:shots           # screenshot + uji responsif (server harus jalan)
npm run qa:articles        # 3 template artikel × 9 lebar + interaksi
```

`npm run qa:shots` memakai Chrome yang terpasang di komputer (`playwright-core`, tanpa mengunduh browser). Untuk setiap halaman dan lebar layar, skrip memeriksa:

- tidak ada overflow horizontal;
- tidak ada gambar rusak dan setiap gambar punya alt;
- tepat satu `<h1>`;
- area sentuh ≥ 44 px;
- tidak ada error di console;
- drawer berisi 11 tautan dan bisa ditutup dengan Esc;
- panel Chator AI menampilkan status pengembangan tanpa kolom pertanyaan;
- semua tautan internal di homepage merespons 200.

Hasilnya disimpan di `qa/shots/` dan `qa/report.json`.

### Backend (development)

```bash
npm run db:setup           # MariaDB lokal terisolasi (.data/mariadb) + .env/.env.test (password acak)
npm run db:migrate:dev     # terapkan/buat migrasi, lalu hak akses
npm run db:seed            # 5 kanal + 5 rubrik + band Catatan Sumenep
npm run db:verify          # cek read-only: migrasi, constraint, trigger, satu Admin, hak role runtime
npm run admin:bootstrap -- --email … --name "…"   # Admin pertama (satu-satunya)
npm run admin:recover -- status                    # pemulihan: lihat docs/05
npm test                   # tes unit + tes database (database sementara)
npm run test:e2e           # build produksi + server :3301 + Chrome headless (database sementara)
npm run prod:smoke         # cek read-only website live: halaman, keamanan admin, database, media
npm run test:backup        # uji backup → restore (database + media) pada MariaDB lokal
npm run backup -- --env-file <f> --out <folder> [--media-root <folder>]   # backup + manifest SHA-256
```

## Struktur

```
src/
  app/(site)/            layout publik + rute (route group terpisah dari CMS)
    page.tsx             beranda
    artikel/[slug]       artikel
    kanal/[slug]         5 kanal        rubrik/[slug]   5 rubrik
    terbaru · pilihan · penulis/[slug] · cari · 4 halaman redaksi · 404
  app/icon.svg · favicon.ico · apple-icon.png · robots.ts
  components/
    brand/Logo           satu sumber logo (public/brand/*.svg)
    layout/              SiteHeader, MobileNavigation (drawer), SiteFooter
    home/                HeroArticle, FeaturedArticles, EditorialNote, LatestArticles
    article/             templates (Standard/Feature/Spotlight), ArticleHeader, ArticleBody,
                         ArticleHero, ArticleImage, PullQuote, ArticleTable, ArticleGallery,
                         ArticleTimeline, ArticleInfographic, ArticleMap, ArticleVideo,
                         ArticleTableOfContents, ReadingProgress, ShareArticle, ArticleLightbox,
                         RelatedArticles, ArticleRow, ArchiveView, Pagination, StaticPage
    chator/              ChatorWidget (tombol), ChatorPanel (info mode pengembangan)
    ui/                  MediaImage, ArticleMeta, AuthorAvatar, SectionHeading
  content/               types (kontrak = calon koleksi CMS), sections, seed (konten contoh)
  lib/                   content (adapter), article-utils, site, format
  app/(admin)/admin/     CMS: login, dashboard, akun, artikel (daftar + editor)
  app/(site)/pratinjau/  pratinjau artikel (Admin saja, noindex)
  components/admin/      header, editor (TipTap + blok), articles (formulir, SEO, status)
  server/                backend: db (Prisma), auth, admin (bootstrap/recover), articles (sanitasi,
                         blok, layanan, query, cache publik), media (unggah, penyimpanan),
                         validation (Zod), activity-log, seed
prisma/                  schema.prisma + migrations/
tests/                   unit/ + db/ + e2e/ (lihat docs/05, 08, 09)
brand/source/            data sumber logo (hasil outline dan trace)
scripts/                 build-brand, prepare-demo-media, shoot (QA)
public/brand · public/demo · public/illustrations · public/og-default.png
```

## Konten

Komponen hanya mengambil data lewat [src/lib/content.ts](src/lib/content.ts). Saat ini adapter membaca `src/content/seed.ts`. Isinya **konten contoh desain, bukan berita faktual**: tanpa angka, tanpa kutipan, dan setiap gambar diberi kredit "Ilustrasi demo". Footer dan halaman artikel menampilkan label tersebut. Saat integrasi CMS (Fase 8), fungsi-fungsi adapter membaca database lewat Prisma tanpa perlu mengubah komponen. Sejak Fase 4, dengan `CMS_PUBLIC_ARTICLES=on`, `/artikel/[slug]` sudah membaca artikel terbit dari CMS lebih dulu; daftar (beranda, kanal, rubrik) tetap konten contoh.

## Variabel lingkungan

| Variabel | Fungsi |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | URL kanonik. Produksi: `https://sumenep.matamaduranews.com` |
| `NEXT_PUBLIC_SITE_ENV` | Hanya `production` yang boleh diindeks. Nilai lain dianggap staging: `noindex` dan robots.txt menolak semua crawler |
| `DATABASE_URL` · `DIRECT_URL` · `DB_APP_ROLE` | Database CMS (role runtime · role pemilik untuk migrasi/CLI · nama role runtime). Development: dibuat otomatis oleh `npm run db:setup`. Rincian: [docs/05-backend-fondasi.md](docs/05-backend-fondasi.md) |
| `ADMIN_ALLOWED_HOSTS` · `TRUSTED_PROXY_COUNT` · `CLIENT_IP_HEADER` | Opsional, untuk CMS di balik proxy: host tambahan untuk pemeriksaan Origin, dan cara membaca IP klien untuk batas login per IP. Rincian: [docs/08-autentikasi-admin.md](docs/08-autentikasi-admin.md) |
| `CMS_PUBLIC_ARTICLES` · `CMS_CACHE_SECONDS` · `MEDIA_ROOT` | `on` = `/artikel/[slug]` menampilkan artikel terbit dari CMS · lama cache data artikel publik (detik) · folder gambar unggahan. Rincian: [docs/09-cms-artikel.md](docs/09-cms-artikel.md) |

**Chator AI** sedang dalam pengembangan. Integrasi dengan MataGen.ai menjadi proyek terpisah. Untuk saat ini tidak ada API, kunci, atau proxy AI di aplikasi ini. Panelnya hanya menjelaskan rencana fitur, tanpa kolom pertanyaan dan tanpa jawaban otomatis.

## Batasan yang diketahui

- **Gambar demo** diambil dari mockup dengan resolusi rendah. Gambar utama tampak agak lembut di layar desktop beresolusi tinggi. Foto asli beserta kreditnya masuk lewat CMS.
- **Logo** adalah hasil trace vektor dari logo resmi `brand/source/logo.png` (2172×724 px), tajam untuk web dan cetak ukuran sedang. Untuk cetak besar, sebaiknya gunakan berkas vektor asli dari desainer bila ada.
