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
| 4 · Pengalaman artikel | Belum. Halaman artikel saat ini memakai tata letak Standard dasar |
| 5 · CMS | Belum. **Butuh kredensial PostgreSQL lokal** untuk database baru `sumenep_cms` |
| 6 · Chator AI | UI dan proxy siap. **Butuh persetujuan perubahan** di repo console-matagen-ai |
| 7 · SEO & performa | Sebagian: metadata, canonical, `noindex` saat staging, robots.txt |
| 8 · Uji & deploy | Belum. **Butuh keputusan** hosting, database produksi, bucket media, DNS |

## Menjalankan

```bash
npm install
cp .env.example .env.local
npm run dev                # http://localhost:3200

npm run build && npm start # produksi lokal di :3200
npm run typecheck
npm run qa:shots           # screenshot + uji responsif (server harus jalan)
```

`npm run qa:shots` memakai Chrome yang terpasang di komputer (`playwright-core`, tanpa mengunduh browser). Untuk setiap halaman dan lebar layar, skrip memeriksa:

- tidak ada overflow horizontal;
- tidak ada gambar rusak dan setiap gambar punya alt;
- tepat satu `<h1>`;
- area sentuh ≥ 44 px;
- tidak ada error di console;
- drawer berisi 11 tautan dan bisa ditutup dengan Esc;
- Chator AI menjawab jujur saat belum tersambung;
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
    api/chator           proxy server ke MataGen.ai
  app/icon.svg · favicon.ico · apple-icon.png · robots.ts
  components/
    brand/Logo           satu sumber logo (public/brand/*.svg)
    layout/              SiteHeader, MobileNavigation (drawer), SiteFooter
    home/                HeroArticle, FeaturedArticles, EditorialNote, LatestArticles
    article/             ArticleRow, ArchiveView, Pagination, StaticPage
    chator/              ChatorWidget (tombol), ChatorPanel (dimuat saat dibuka)
    ui/                  MediaImage, ArticleMeta, AuthorAvatar, SectionHeading
  content/               types (kontrak = calon koleksi CMS), sections, seed (konten contoh)
  lib/                   content (adapter), site, format, chator
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
| `MATAGEN_CHAT_URL` | Endpoint chat tenant SUMENEP di MataGen.ai (Tahap 6) |
| `MATAGEN_CHAT_API_KEY` | API key tenant. Hanya dipakai di server, tidak pernah dikirim ke browser |

Selama variabel MataGen kosong, `/api/chator` membalas `not_configured`. Panel lalu menyatakan Chator AI belum tersambung, dan **tidak pernah membuat jawaban sendiri**.

## Batasan yang diketahui

- **Gambar demo** diambil dari mockup dengan resolusi rendah. Gambar utama tampak agak lembut di layar desktop beresolusi tinggi. Foto asli beserta kreditnya masuk lewat CMS.
- **Wordmark matamadura** hasil trace dari `HEADER.jpg`. Hasilnya tajam untuk web dan cetak ukuran kecil. Untuk cetak besar, sebaiknya gunakan berkas vektor asli dari desainer bila ada.
- **Warna "madura"** pada logo memakai merah palet `#A61B2B`, bukan merah terang di `HEADER.jpg`. Dapat diubah di `scripts/build-brand.mjs`.
- **Rate limit Chator** masih di memori per instance. Sebelum produksi perlu diganti store bersama (misalnya Redis).
- **Belum ada git.** Disarankan `git init` sebelum Tahap 4.
