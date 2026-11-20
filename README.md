# SUMENEP – Mata Madura

Media editorial untuk `sumenep.matamaduranews.com`.
*Catatan, Berita, dan Perspektif tentang Sumenep.*

Aplikasi ini berdiri sendiri. Ia tidak mengubah WordPress `matamaduranews.com`, database, media, maupun DNS-nya.

**Stack:** Next.js 16.4 (App Router) · React 19.3 · TypeScript · Tailwind CSS v4 · lucide-react. Font Newsreader, Lora, dan Inter di-host sendiri lewat `next/font`. Payload CMS + PostgreSQL menyusul di Tahap 5 (lihat [docs/01-audit-dan-rencana.md](docs/01-audit-dan-rencana.md)).

## Status

| Tahap | Status |
| --- | --- |
| 1 · Audit & rencana | Selesai: [docs/01-audit-dan-rencana.md](docs/01-audit-dan-rencana.md) |
| 2 · Design system & logo | Selesai: [docs/02-design-system.md](docs/02-design-system.md) |
| 3 · Homepage responsif | Selesai. Lolos QA otomatis pada 12 lebar layar (360–1920 px) |
| 4 · Pengalaman artikel | Selesai: tiga template (Standard, Feature, Spotlight), lihat [docs/03-template-artikel.md](docs/03-template-artikel.md) |
| 5 · CMS | Belum. **Butuh kredensial PostgreSQL lokal** untuk database baru `sumenep_cms` |
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

## Struktur

```
src/
  app/(site)/            layout publik + rute (route group; Payload memakai (payload) di Tahap 5)
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
brand/source/            data sumber logo (hasil outline dan trace)
scripts/                 build-brand, prepare-demo-media, shoot (QA)
public/brand · public/demo · public/illustrations · public/og-default.png
```

## Konten

Komponen hanya mengambil data lewat [src/lib/content.ts](src/lib/content.ts). Saat ini adapter membaca `src/content/seed.ts`. Isinya **konten contoh desain, bukan berita faktual**: tanpa angka, tanpa kutipan, dan setiap gambar diberi kredit "Ilustrasi demo". Footer dan halaman artikel menampilkan label tersebut. Di Tahap 5, fungsi-fungsi adapter diganti dengan Payload Local API tanpa perlu mengubah komponen.

## Variabel lingkungan

| Variabel | Fungsi |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | URL kanonik. Produksi: `https://sumenep.matamaduranews.com` |
| `NEXT_PUBLIC_SITE_ENV` | Hanya `production` yang boleh diindeks. Nilai lain dianggap staging: `noindex` dan robots.txt menolak semua crawler |

**Chator AI** sedang dalam pengembangan. Integrasi dengan MataGen.ai menjadi proyek terpisah. Untuk saat ini tidak ada API, kunci, atau proxy AI di aplikasi ini. Panelnya hanya menjelaskan rencana fitur, tanpa kolom pertanyaan dan tanpa jawaban otomatis.

## Batasan yang diketahui

- **Gambar demo** diambil dari mockup dengan resolusi rendah. Gambar utama tampak agak lembut di layar desktop beresolusi tinggi. Foto asli beserta kreditnya masuk lewat CMS.
- **Wordmark matamadura** hasil trace dari `HEADER.jpg`. Hasilnya tajam untuk web dan cetak ukuran kecil. Untuk cetak besar, sebaiknya gunakan berkas vektor asli dari desainer bila ada.
- **Warna "madura"** pada logo memakai merah palet `#A61B2B`, bukan merah terang di `HEADER.jpg`. Dapat diubah di `scripts/build-brand.mjs`.
- **Belum ada git.** Disarankan `git init` sebelum Tahap 4.
