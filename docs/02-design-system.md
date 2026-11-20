# Design System · SUMENEP – Mata Madura

Semua token di sini didefinisikan di satu tempat, [src/app/(site)/globals.css](../src/app/(site)/globals.css), di dalam blok `@theme`.

## Logo

Semua aset logo dihasilkan oleh `npm run brand:build` dari satu sumber, `brand/source/brand-source.json`. Jangan menyunting file di `public/brand` secara manual.

| Variasi | File | Pemakaian |
| --- | --- | --- |
| Utama bertingkat | `sumenep-matamadura-stacked.svg/.png` | Header, footer, Open Graph |
| Horizontal | `sumenep-matamadura-horizontal.svg/.png` | Ruang pendek dan lebar (kop surat, spanduk tipis) |
| Monokrom gelap | `sumenep-matamadura-mono.svg/.png` | Cetak satu warna |
| Monokrom terang | `sumenep-matamadura-mono-white.svg/.png` | Di atas latar gelap atau foto |
| Favicon | `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` | "S" Newsreader miring, putih di atas merah |

Komposisi logo:

- **SUMENEP** memakai Newsreader ExtraBold Italic (lisensi SIL OFL), diubah menjadi path.
- Di bawahnya wordmark asli **matamadura** hasil trace dari `HEADER.jpg`: "mata" berwarna `#111827`, "madura" berwarna `#A61B2B`.
- Lebar wordmark 70% dari lebar SUMENEP.
- Di bawahnya ada garis merah meruncing yang mengikuti lintasan merah pada emblem Mata Madura.
- Semua latar transparan.

Lebar minimum logo bertingkat: 120 px di layar.

## Warna

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| `brand` | `#A61B2B` | Label rubrik, tautan aksi, tombol Chator, aksen |
| `brand-deep` | `#8A1523` | Hover |
| `ink` | `#111827` | Teks utama, headline |
| `muted` | `#62666D` | Standfirst, metadata (kontras 5,7:1 di atas putih) |
| `line` | `#E5E7EB` | Garis pemisah |
| `paper` | `#FFFFFF` | Latar halaman |
| `warm` | `#FAF9F7` | Footer, latar sekunder |
| `blush` | `#F8EFEC` | Banner Catatan Sumenep, catatan |

## Tipografi

| Peran | Font | Mobile | Tablet | Desktop |
| --- | --- | --- | --- | --- |
| Headline utama | Newsreader 700 | 32–38 px (`clamp`) | 44 px | 54 px |
| Standfirst | Newsreader 400 | 19 px | 21 px | 23 px |
| Judul Tulisan Pilihan | Newsreader 700 | 17–19 px | 20 px | 18 px |
| Judul daftar artikel | Newsreader 700 | 19 px | 24 px | 26 px |
| Body artikel | Lora 400 | 17 px / 1.8 | 19 px / 1.85 | 19 px / 1.85 |
| Metadata | Inter | 12,5–13 px | 13–14 px | 14 px |

Lebar kolom baca artikel maksimum 720 px. Padding horizontal 20 px (mobile), 32 px (tablet), dan 40 px (desktop).

## Breakpoint

Breakpoint mengikuti bawaan Tailwind dan dirancang mobile-first.

| Nama | Lebar | Perubahan utama |
| --- | --- | --- |
| (dasar) | < 768 | Satu kolom. Tulisan Pilihan 34% gambar dan 66% teks |
| `md` | ≥ 768 | Ukuran huruf tablet. Daftar artikel dengan gambar di kiri |
| `lg` | ≥ 1024 | Hero dua kolom (headline kiri, gambar kanan) |
| `xl` | ≥ 1280 | Tulisan Pilihan tiga kolom. Indeks rubrik di samping Artikel Terbaru |

## Komponen dan perilaku

- **Header**: grid `1fr auto 1fr` agar logo tepat di tengah. Tidak ada bar kategori horizontal.
- **Drawer navigasi**: memakai `<dialog>` native, muncul dari kanan. Fokus terkunci di dalam drawer. Drawer bisa ditutup dengan Esc, tombol tutup, atau ketukan di area gelap. Tinggi baris 52 px. Kanal dan rubrik dipisahkan oleh label kecil.
- **Gambar**: `next/image` dalam bingkai berasio tetap, sehingga tidak ada layout shift. Format AVIF/WebP. Gambar utama dimuat eager dengan `fetchPriority="high"`, gambar lain lazy.
- **Chator AI**:
  - Tombol bulat 68–72 px di kanan bawah, memperhitungkan safe-area.
  - Di ponsel, tombol menyingkir saat pembaca menggulir ke bawah, lalu muncul lagi saat menggulir ke atas atau di akhir halaman.
  - Panel tampil layar penuh di ponsel dan tablet, dan sebagai panel 416 px di desktop.
  - Kode panel baru dimuat ketika tombol diklik.
- **Area sentuh**: minimal 44 × 44 px untuk semua kontrol header, drawer, dan Chator.
- **Hindari**: slider, carousel, gradien dekoratif, grid kartu, dan widget bergaya dasbor.
