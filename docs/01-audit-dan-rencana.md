# SUMENEP – Mata Madura · Laporan Audit Awal & Rencana Teknis

Tanggal audit: 20 November 2026
Lingkup: folder proyek `D:\subdomain.sumenep-mata`, aset identitas Mata Madura, dan infrastruktur MataGen.ai yang ada di mesin pengembangan. Audit bersifat **baca saja** — tidak ada file, database, atau layanan yang diubah.

---

## 1. Kondisi awal

### 1.1 Folder proyek

| Aspek | Temuan |
| --- | --- |
| Isi folder | Hanya `mokup refrensi.png` (mockup mobile, 1024×1536). |
| Repository git | Belum ada. |
| Kode / stack | Belum ada. Tidak ada Next.js, CMS, maupun komponen yang dapat dipakai ulang. |
| Desain desktop | **Tidak ditemukan desain desktop SUMENEP.** `D:\Beranda — desktop.png` ternyata desain RSUD dr. H. Moh. Anwar, bukan SUMENEP. Desktop akan diturunkan dari deskripsi prompt (logo tengah, headline kiri, gambar kanan) dan mockup mobile. |
| CMS / database / media | Belum ada. |
| Domain / deployment | Belum ada konfigurasi untuk `sumenep.matamaduranews.com`. |

### 1.2 Aset identitas

| File | Isi | Catatan |
| --- | --- | --- |
| `D:\AI MATA MADURA\HEADER.jpg` | Wordmark **matamadura** — huruf kondensed geometris, "mata" hitam, "madura" merah. | JPG berlatar putih, bukan vektor. Tidak memuat garis merah. |
| `D:\AI MATA MADURA\LOGO MATA MADURA.jpeg` | Emblem bundar karapan sapi dengan lintasan merah–navy dan huruf "M". | 300 px, JPG. Cocok sebagai sumber aksen garis merah dan favicon. |

**Selisih mockup vs prompt final.** Mockup menulis "Mata Madura" dengan serif miring merah. Prompt final (B.1, kriteria O.2) mewajibkan wordmark asli **matamadura** di bawah SUMENEP. Rencana ini mengikuti prompt final: wordmark asli direkonstruksi menjadi SVG berlatar transparan, dan seluruh bagian lain mockup tetap diikuti.

### 1.3 Toolchain lokal

| Alat | Versi |
| --- | --- |
| Node.js | 22.22.2 |
| npm / pnpm | 10.9.7 / 11.10.0 |
| Git | 2.54.0 |
| PostgreSQL | 16 (layanan Windows `postgresql-x64-16` terpasang) |
| Docker / Python | Tidak tersedia |

### 1.4 Infrastruktur MataGen.ai

| Proyek | Peran | Temuan |
| --- | --- | --- |
| `D:\matagen-ai-platform` (repo `console-matagen-ai`) | **Engine MataGen.ai** yang aktif | Next.js 16 · Supabase (Postgres, Auth, Storage, RLS, multi-tenant) · Pinecone (namespace = slug tenant) · Cohere embed + rerank-v3.5 · Groq LLM. Pipeline auto-ingest dengan persetujuan, dedup, dan kuota tenant. Peran: `super_admin`, `tenant_admin`, `tenant_operator`. |
| `D:\matagen-ai-dashboard` | Dasbor operasional tenant RSUD | Widget `chat-cs` memanggil Groq tanpa RAG. Tidak cocok untuk Chator SUMENEP. |
| `D:\ChatorSUMENEP` | Chatbot RAG Pemkab Sumenep (Python/FastAPI, WhatsApp) | Generasi lama (Mei 2026). Punya index Pinecone tersendiri yang mungkin sudah berisi dokumen Sumenep — perlu diverifikasi sebelum dipakai. |
| `D:\Mata Madura AI` | Prototipe homepage mataGen | UI Chator tanpa endpoint, dengan pola status jujur "belum terhubung". Pola ini akan diikuti. |

**Endpoint yang tersedia:** `POST /api/chat` di console-matagen-ai (header `x-api-key`, body `{ question }`, respons `{ status, answer, sources[] }`).

**Engine yang sudah baik dan akan dipakai ulang:**

- Ambang relevansi rerank 0,55. Jika tidak ada sumber yang lolos, jawabannya "informasi belum tersedia", bukan karangan.
- Temperatur 0,1 dan pembatasan topik.
- Isolasi namespace Pinecone per tenant.
- Pencatatan percakapan di Supabase.

**Celah yang menghalangi pemakaian langsung untuk SUMENEP:**

1. `SYSTEM_PROMPT` ditulis keras untuk RSUD (persona, nomor WA, alur pengaduan).
2. Namespace diambil dari env global (fallback `rsudma`), bukan dari tenant pemanggil.
3. Hanya ada satu `CHAT_API_KEY` bersama untuk semua pemanggil.
4. `sources` hanya berisi `chunk_index`, `score`, dan `snippet`. Tidak ada judul dokumen, tanggal data, atau URL, sehingga syarat "tampilkan sumber dan tanggal data" belum bisa dipenuhi.
5. Log percakapan tidak ditandai per tenant.

Kesimpulannya, engine bisa dipakai ulang, tetapi console-matagen-ai perlu sedikit perubahan agar mendukung banyak tenant. Karena itu repo produksi lain, perubahan ini hanya dikerjakan setelah ada persetujuan (lihat §4, Tahap 6).

### 1.5 WordPress utama

`D:\matamaduranews.com` hanya berisi `wp-content/themes`. Cadangan ada di `D:\back up web mata`. **Keduanya tidak disentuh** dan tidak akan disentuh.

---

## 2. Arsitektur yang diusulkan

```
sumenep.matamaduranews.com  (aplikasi independen)
┌───────────────────────────────────────────────────────────────┐
│ Next.js 16.4 App Router · TypeScript · Tailwind CSS v4         │
│  ├─ (site)   Beranda, kanal, rubrik, artikel, penulis, cari    │
│  ├─ (payload) /admin  ← Payload CMS 3 + Lexical                │
│  ├─ /api/chator       ← proxy server: validasi, rate-limit,    │
│  │                       API key tidak pernah ke browser       │
│  └─ sitemap.xml · robots.txt · rss.xml · OG image              │
└──────────────┬──────────────────────────────┬─────────────────┘
               │ Payload Local API            │ HTTPS + API key tenant
               ▼                              ▼
   PostgreSQL `sumenep_cms`         MataGen.ai (console-matagen-ai)
   (database sendiri)               tenant `sumenep` → Pinecone ns `sumenep`
   Media: disk (dev) / S3-compatible     ▲
   bucket sendiri (produksi)             │ hook afterChange: artikel terbit
                                         └── dikirim ke ingest MataGen
```

Alasan pilihan:

- **Payload 3 berjalan di dalam Next.js.** Satu aplikasi dan satu deployment. Frontend membaca konten lewat Local API tanpa lompatan HTTP. Payload 3.94 mensyaratkan Next ≥ 16.4.5, jadi proyek dipasang di Next 16.4.6 sejak awal agar CMS tidak memaksa penulisan ulang.
- **PostgreSQL sendiri.** Database `sumenep_cms` terpisah dari WordPress dan dari Supabase MataGen.
- **Chator memakai ulang engine MataGen** dan tidak membangun RAG baru. Konfigurasi SUMENEP (prompt, namespace, API key) dibuat terpisah sebagai tenant.

### Struktur direktori (rencana)

```
src/
  app/
    (site)/              layout publik, beranda, [kanal], rubrik/[slug],
                         artikel/[slug], penulis/[slug], cari, halaman statis
    (payload)/           admin & API Payload (dibuat generator Payload)
    api/chator/          proxy ke MataGen
  collections/           Articles, Categories, Rubrics, Authors, Media,
                         Users, Tags, StatusLog
  globals/               Homepage (artikel utama, Tulisan Pilihan, urutan)
  components/
    brand/               Logo, Wordmark, Favicon
    layout/              SiteHeader, MobileNavigation (drawer), SiteFooter
    home/                HeroArticle, FeaturedArticles, EditorialNote,
                         LatestArticles
    article/             StandardTemplate, FeatureTemplate, SpotlightTemplate,
                         ReadingProgress, TableOfContents, ShareBar,
                         Lightbox, PullQuote, Gallery, Timeline, DataTable,
                         MapEmbed, VideoEmbed
    chator/              ChatorWidget, ChatorPanel, SourceList
    ui/                  ikon, tombol, meta
  lib/                   content (adapter), seo, format, chator-client
  seed/                  konten demo berlabel jelas (bukan berita faktual)
public/brand/            logo SVG/PNG transparan, favicon
docs/                    audit, arsitektur, CMS, deployment, env
scripts/                 screenshot & QA responsif (Playwright)
```

---

## 3. Design system (ringkas)

| Token | Nilai |
| --- | --- |
| Merah | `#A61B2B` |
| Navy/hitam | `#111827` |
| Putih / warm white | `#FFFFFF` / `#FAF9F7` |
| Teks sekunder | `#62666D` |
| Border | `#E5E7EB` |
| Headline | Newsreader (serif) |
| Body artikel | Lora (serif) |
| Metadata / UI | Inter (sans) |
| Breakpoint | mobile < 768 · tablet 768–1279 · desktop ≥ 1280 |
| Kolom baca | 680–760 px |

Tidak ada slider, gradien berlebihan, maupun grid kartu bergaya dasbor.

---

## 4. Tahapan, hasil, dan titik persetujuan

| Tahap | Isi | Hasil yang ditunjukkan | Butuh persetujuan? |
| --- | --- | --- | --- |
| 2 · Design system | Logo SVG bertingkat (utama, horizontal, monokrom, favicon), token warna/tipografi/spacing, komponen dasar | Lembar identitas + screenshot | Tidak (lokal) |
| 3 · Homepage responsif | Header, drawer, hero, Tulisan Pilihan, Catatan Sumenep, Artikel Terbaru, footer, tombol Chator (UI) | Screenshot 360–1920 px + cek overflow | Tidak (lokal) |
| 4 · Pengalaman artikel | Template Standard, Feature, dan Spotlight beserta fiturnya | Screenshot desktop/mobile | Tidak (lokal) |
| 5 · CMS | Payload + Postgres lokal, role, workflow Draft→Review→Revisi→Approved→Published + log, homepage management, media library, preview 3 ukuran | Screenshot CMS | **Ya:** kredensial PostgreSQL lokal untuk membuat database baru `sumenep_cms` |
| 6 · Chator AI | Proxy `/api/chator`, panel, sumber dan tanggal data | Screenshot desktop/mobile | **Ya:** perubahan di repo console-matagen-ai (endpoint per tenant, prompt SUMENEP, sumber berjudul dan bertanggal) dan pembuatan tenant `sumenep` di Supabase/Pinecone produksi |
| 7 · SEO & performa | Metadata, schema, sitemap, RSS, `noindex` saat staging, Lighthouse | Laporan Lighthouse | Tidak |
| 8 · Uji & deploy | Uji menyeluruh, build produksi | Laporan uji | **Ya:** hosting, database produksi, bucket media, dan DNS subdomain |

Sampai ada persetujuan di tiap titik tersebut, fitur yang bergantung padanya menampilkan status jujur dan tidak memakai data palsu. Contohnya, Chator menampilkan "belum terhubung" dan konten memakai seed berlabel demo.

## 5. Risiko & catatan

- Foto di mockup tampak hasil ilustrasi. Bila dipakai sebagai gambar demo, caption-nya wajib "Ilustrasi demo", bukan foto peristiwa nyata.
- Index Pinecone lama milik ChatorSUMENEP mungkin berisi dokumen Sumenep. Migrasinya ke namespace `sumenep` dievaluasi di Tahap 6, tanpa menghapus data lama.
- Payload 3.94.0 baru rilis 17 Nov 2026. Saat Tahap 5, versi dikunci ke rilis stabil terbaru yang mendukung Next 16.4.x.
