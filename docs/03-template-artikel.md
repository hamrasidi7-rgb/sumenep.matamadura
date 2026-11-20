# Tahap 4 · Template Artikel

## Tiga template

Template dipilih per artikel lewat field **Jenis template** di CMS (Tahap 5). Komponen multimedia hanya tampil bila blok tersebut ada di isi artikel.

| Template | Untuk | Ciri |
| --- | --- | --- |
| **Standard News** | Berita harian | Header rata kiri: breadcrumb, kategori, headline, standfirst, penulis, tanggal & jam, waktu baca, tombol berbagi. Lalu gambar utama 16:9 dengan caption & kredit, isi, topik, berbagi, artikel terkait |
| **Editorial / Feature** | Laporan mendalam, profil, opini | Header terpusat, standfirst miring, hero lebar. Pembuka naratif dengan *drop cap*, subjudul, kutipan penting, foto pendukung lebar. Penutup diberi tanda akhir ■, lalu kotak penulis dan artikel terkait |
| **Spotlight / Longform** | Liputan panjang & investigasi | Hero layar penuh dengan headline di atasnya, intro, indikator progres baca. Daftar isi yang dapat diklik: sidebar dengan penanda bagian aktif di ≥1280 px, blok lipat di layar lebih kecil. Mendukung H2/H3, pull quote, galeri, infografik, timeline, tabel, peta, video, caption & kredit, artikel terkait |

## Komponen

Semua komponen ada di [src/components/article/](../src/components/article/).

| Komponen | File | Catatan |
| --- | --- | --- |
| ArticleHeader | `ArticleHeader.tsx` | Varian `standard` / `feature`, beserta `Breadcrumb` |
| ArticleMetadata | `ArticleMetadata.tsx` | Penulis, tanggal & jam WIB, waktu baca, "Diperbarui" |
| ArticleHero | `ArticleHero.tsx` | `ArticleHero` (kolom / lebar) dan `SpotlightHero` (layar penuh) |
| ArticleBody | `ArticleBody.tsx` | Merender semua blok. Opsi drop cap, tanda akhir, dan slot daftar isi |
| ArticleImage, ImageCaption | `ArticleImage.tsx`, `ImageCaption.tsx` | Gambar sebagai tombol lightbox. Kredit diberi awalan "Foto:" |
| PullQuote | `PullQuote.tsx` | |
| ArticleTable | `ArticleTable.tsx` | Tabel ≥4 kolom digulir di dalam wadahnya sendiri, bukan halaman |
| ArticleGallery | `ArticleGallery.tsx` | |
| ArticleTimeline | `ArticleTimeline.tsx` | |
| ArticleInfographic | `ArticleInfographic.tsx` | Selalu menampilkan sumber & tanggal data |
| ArticleMap | `ArticleMap.tsx` | OpenStreetMap: tanpa API key, dimuat lazy, penanda opsional |
| ArticleVideo | `ArticleVideo.tsx` | YouTube (nocookie) / Vimeo (dnt). Dimuat hanya setelah tombol putar ditekan |
| ArticleTableOfContents | `ArticleTableOfContents.tsx` + `TocActiveTracker.tsx` | |
| ReadingProgress | `ReadingProgress.tsx` | Hanya `transform`, tanpa layout ulang |
| RelatedArticles | `RelatedArticles.tsx` | Urutan: kanal sama → rubrik sama → terbaru |
| ShareArticle | `ShareArticle.tsx` | WhatsApp, Facebook, X, Telegram, salin tautan, dan share bawaan ponsel. Tanpa skrip pihak ketiga |
| ArticleLightbox | `ArticleLightbox.tsx` | Satu `<dialog>` per halaman. Tombol ←/→, Esc, dan penghitung |

Isi artikel memakai model blok netral ([src/content/types.ts](../src/content/types.ts)). Output Lexical dari CMS dinormalisasi ke model ini, sehingga template tidak bergantung pada format editor.

Keamanan isi:

- Teks selalu di-escape oleh React.
- Tautan hanya boleh `http(s)`, `mailto`, `tel`, atau path internal.
- URL video diurai menjadi provider + ID. Iframe peta dan video dibangun dari nilai itu, bukan dari URL mentah.

## Tipografi terukur (hasil QA otomatis)

| Lebar | Headline | Standfirst | Body | Line-height | Kolom teks |
| --- | --- | --- | --- | --- | --- |
| 360–430 | 30–36 px | 19 px | 17 px | 1,80 | lebar layar − 40 px |
| 768–1024 | 44 px | 22 px | 19 px | 1,85 | 704–720 px |
| 1280–1920 | 52 / 54 / 56 px (Standard / Feature / Spotlight) | 24–26 px | 20 px | 1,85 | 720 px |

Semua nilai berada dalam rentang brief §4.3. Padding horizontal di ponsel 20 px.

## QA

```bash
npm run build && npm run start:local
npm run qa:articles   # 3 template × 9 lebar (360–1920) + interaksi
```

Skrip memeriksa hal berikut:

- tidak ada overflow horizontal;
- headline tidak meluber dari kotaknya;
- gambar termuat dan punya alt;
- tepat satu `<h1>`;
- ukuran huruf sesuai rentang;
- tidak ada error console;
- daftar isi (blok lipat di ponsel dan sidebar di desktop) membawa pembaca ke bagian yang benar dan menandai bagian aktif;
- progres baca bertambah saat menggulir;
- lightbox bisa dibuka, maju, dan ditutup dengan Esc;
- tombol salin tautan tersedia.

Hasil terakhir: **27/27 pemeriksaan halaman lolos, dan semua uji interaksi lolos.**

Screenshot ada di [docs/screenshots/tahap-4/](screenshots/tahap-4/). Peta difoto terpisah karena Chromium tidak menggambar iframe lintas-domain pada screenshot satu halaman penuh.

## Catatan

- **Video:** konten contoh tidak memuat video karena tidak ada video berlisensi yang bisa dipakai. Komponennya siap, dan redaksi cukup menempelkan URL YouTube/Vimeo di CMS.
- **Gambar contoh** beresolusi rendah (crop dari mockup), sehingga hero Feature/Spotlight tampak lembut di desktop. Foto asli dari CMS akan tajam.
