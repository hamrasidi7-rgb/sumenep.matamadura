# Rancangan cache, sitemap/RSS, dan noindex

Status: **rancangan**, disiapkan di Fase 2 sebelum integrasi CMS. Belum ada kode atau konfigurasi produksi yang diubah. Implementasinya di Fase 8 (integrasi) dan Fase 7 (SEO), dan deployment-nya menunggu persetujuan.

Tujuan:
- perubahan konten tampil cepat;
- tidak ada HTML yang tertahan di cache selama satu tahun;
- sitemap dan RSS selalu terbaru;
- situs tetap noindex sampai peluncuran disetujui.

## 1. Kondisi sekarang (diukur 21 November 2026, hanya GET)

| URL | Rendering Next.js | `Cache-Control` | CDN Hostinger (`x-hcdn-cache-status`) |
| --- | --- | --- | --- |
| `/` | statis (prerender) | `s-maxage=31536000` | **HIT**, `Age: 2433` |
| `/tentang-kami` | statis | `s-maxage=31536000` | DYNAMIC, lalu **HIT** pada permintaan berikutnya |
| `/artikel/[slug]` | SSG (`generateStaticParams`) | `s-maxage=31536000` | DYNAMIC (bergantung edge) |
| `/kanal/…`, `/rubrik/…`, `/terbaru`, `/pilihan`, `/cari` | dinamis | `private, no-cache, no-store, max-age=0, must-revalidate` | DYNAMIC (tidak disimpan) |
| `/robots.txt` | statis | `public, max-age=0, must-revalidate` | MISS |
| `/_next/static/…` | aset ber-hash | `public, max-age=31536000, immutable` | disimpan (aman, nama file berubah tiap build) |
| `/sitemap.xml`, `/rss.xml` | belum ada | 404 | — |

Kesimpulan:

1. **CDN Hostinger memang menyimpan HTML** bila respons membawa `s-maxage`. Sesuai dokumentasi Hostinger, respons `private`/`no-store` dilewatkan (DYNAMIC).
2. Halaman statis Next.js mendapat `s-maxage` **satu tahun**. Hari ini itu tidak masalah, karena kontennya berasal dari kode dan setiap deploy membangun ulang halaman. Tetapi untuk konten CMS ini tidak boleh dipertahankan.
3. Pembersihan cache Next.js (`revalidateTag`/`updateTag`/`revalidatePath`) **tidak menghapus salinan di CDN**. Dokumentasi Next.js 16 menyatakan CDN tetap menyajikan salinannya sampai `s-maxage` habis, kecuali di-purge.

## 2. Rancangan

### Lapisan cache

| Lapisan | Yang disimpan | Berapa lama | Cara diperbarui |
| --- | --- | --- | --- |
| Browser | Aset `/_next/static`, media ber-hash | 1 tahun, immutable | Nama file berubah |
| CDN Hostinger | Aset dan media. **HTML halaman CMS tidak disimpan** | — | — |
| Data cache Next.js (server) | Hasil query database, diberi tag | maksimal 60 detik | `updateTag` saat CMS menyimpan, atau kedaluwarsa 60 detik |
| PostgreSQL | Sumber kebenaran | — | — |

**Halaman publik yang berasal dari CMS dirender dinamis.** HTML-nya `no-store`, sehingga CDN tidak menyimpannya dan tidak ada yang perlu di-purge. Render tetap cepat karena datanya diambil dari data cache, bukan langsung dari database setiap kali. Ini sejalan dengan rancangan Fase 1 yang sudah disetujui.

**Mengapa HTML tidak disimpan di CDN dulu:**
- respons App Router punya beberapa varian (HTML, RSC, prefetch) yang dibedakan lewat `Vary` dan parameter `_rsc`;
- purge CDN otomatis belum teruji di Web App ini;
- untuk volume pembaca saat ini, render dinamis dari data cache sudah cukup.

Bila nanti beban naik, lihat Opsi lanjutan di bagian 5.

### Per rute

| Rute | Sekarang | Rancangan | Tag data |
| --- | --- | --- | --- |
| `/` | statis | dinamis | `home`, `articles`, `sections` |
| `/artikel/[slug]` | SSG | dinamis; slug lama → 301 dari `article_slug_history` | `article:<id>`, `articles` |
| `/kanal/[slug]`, `/rubrik/[slug]`, `/penulis/[slug]`, `/terbaru`, `/pilihan` | dinamis | dinamis | `articles`, `sections`, `authors` |
| `/cari` | dinamis | dinamis, tanpa data cache (query bebas) | — |
| `/sitemap.xml` | belum ada | dinamis (`app/sitemap.ts`) | `sitemap`, `articles`, `sections` |
| `/rss.xml` | belum ada | Route Handler, 20 artikel terbaru | `articles` |
| Halaman tetap (`/tentang-kami`, `/kontak-redaksi`, `/pedoman-media-siber`, `/kebijakan-privasi`) | statis, 1 tahun | `export const revalidate = 3600`. Ini bukan konten CMS; batas di CDN turun dari 1 tahun menjadi maksimal 1 jam | — |
| `/admin/**`, pratinjau | — | selalu dinamis, `no-store`, noindex | — |

Semua query publik hanya mengambil artikel `PUBLISHED` dengan `published_at <= now()` dan `deleted_at IS NULL`.

### Invalidasi (di Server Action CMS)

`updateTag` (Next.js 16) dipanggil di Server Action, sehingga permintaan berikutnya langsung memakai data baru (read-your-own-writes). `revalidateTag(tag, "max")` hanya dipakai untuk proses latar yang tidak perlu langsung.

| Kejadian | Tag yang diperbarui |
| --- | --- |
| Terbitkan, perbarui artikel terbit, batal terbit, arsipkan, pindah ke/keluar dari tempat sampah, hapus | `articles`, `article:<id>`, `home`, `sitemap` |
| Ganti slug artikel terbit | sama seperti di atas. Slug lama otomatis masuk riwayat oleh trigger, lalu dialihkan dengan 301 |
| Jadwalkan (tanggal terbit di masa depan) | tidak ada. Artikel muncul paling lambat **60 detik** setelah waktunya, saat data cache kedaluwarsa |
| Ubah pengaturan homepage (berita utama, Tulisan Pilihan, band rubrik) | `home` |
| Ubah kanal/rubrik (nama, urutan, aktif) | `sections`, `home`, `sitemap` |
| Ubah penulis | `authors`, `articles` |
| Ubah alt/caption media | `articles` |
| Ubah pengaturan situs | `site` |

Tag sengaja kasar (`articles` membersihkan semua daftar sekaligus). Lebih aman daripada tag per daftar yang mudah terlewat, dan biayanya hanya beberapa query ulang.

Jadwal 60 detik bergantung pada sesi database yang berjalan dalam UTC. Ini sudah dijaga dan diuji di Fase 2 (lihat [05-backend-fondasi.md](05-backend-fondasi.md), bagian 4).

## 3. Sitemap dan RSS

- `app/sitemap.ts` berisi homepage, kanal, rubrik, penulis, dan artikel terbit dengan `lastModified` (= `updated_at`). Bila jumlah artikel melewati sekitar 45.000, dipecah dengan `generateSitemaps`.
- `/rss.xml` (RSS 2.0) berisi 20 artikel terbaru: judul, ringkasan (`standfirst`), tautan kanonik, `pubDate`, kategori (kanal/rubrik). Tanpa konten penuh.
- Keduanya dinamis dari data cache. Setiap penerbitan memperbarui tag `articles`/`sitemap`, jadi keduanya ikut terbaru tanpa purge CDN.
- Selama **staging**:
  - sitemap dan RSS tetap bisa diuji;
  - responsnya diberi `X-Robots-Tag: noindex`;
  - `robots.txt` tidak mencantumkan `Sitemap:`.

  Di produksi, `robots.txt` menambahkan `Sitemap: https://sumenep.matamaduranews.com/sitemap.xml`.

## 4. noindex selama pengembangan

Kondisi sekarang (terverifikasi di situs live):
- `NEXT_PUBLIC_SITE_ENV=staging` → semua halaman membawa `<meta name="robots" content="noindex, nofollow">`;
- `robots.txt` berisi `Disallow: /`.

Kondisi ini dipertahankan.

Tambahan di Fase 7–8:
- `X-Robots-Tag: noindex` untuk respons non-HTML (sitemap, RSS) saat staging;
- halaman admin dan pratinjau **selalu** noindex, juga setelah peluncuran.

### Prosedur pelepasan noindex (hanya setelah peluncuran disetujui)

Prasyarat:
1. Persetujuan tertulis pemilik untuk peluncuran publik.
2. Konten: semua artikel demo (`is_demo`) sudah diturunkan; halaman Tentang/Kontak/Pedoman/Privasi final; artikel terbit punya deskripsi meta dan alt gambar (menu SEO di CMS).
3. Sitemap dan RSS valid di staging; redirect slug lama berfungsi; 404 rapi.
4. Akses Google Search Console. Pilih properti awalan URL dengan verifikasi file HTML atau meta tag, karena verifikasi domain membutuhkan perubahan DNS yang perlu izin tersendiri.

Langkah:
1. Di panel Hostinger, ubah `NEXT_PUBLIC_SITE_ENV` menjadi `production`. Variabel `NEXT_PUBLIC_*` ditanam saat build, jadi **wajib build/deploy ulang** (dengan persetujuan).
2. Setelah deploy selesai, **purge cache CDN Hostinger** (hPanel → CDN → Flush cache, atau API pada bagian 5). Tanpa langkah ini, halaman statis yang tersimpan masih membawa `noindex`.
3. Verifikasi:
   ```bash
   curl -s https://sumenep.matamaduranews.com/robots.txt            # Allow + Sitemap
   curl -s https://sumenep.matamaduranews.com/ | grep -o '<meta name="robots"[^>]*>'   # index, follow
   curl -sI https://sumenep.matamaduranews.com/sitemap.xml          # 200, tanpa X-Robots-Tag noindex
   ```
   Periksa juga satu artikel dan satu rubrik, serta `<link rel="canonical">` yang menunjuk URL produksi.
4. Di Search Console: kirim `sitemap.xml`, lalu periksa URL homepage dan minta pengindeksan.
5. Pantau 1–2 minggu: laporan halaman, 404, dan redirect.

Rollback:
1. Kembalikan nilainya ke `staging`, lalu deploy ulang dan purge CDN.
2. Bila ada halaman yang harus segera hilang dari Google, pakai fitur Removals di Search Console.

## 5. Purge CDN dan opsi lanjutan

- **Manual:** hPanel → Websites → CDN → Flush cache.
- **API resmi Hostinger:** `DELETE /api/hosting/v1/accounts/{username}/websites/{domain}/cache/clear`. Menurut referensi API, endpoint ini juga mem-purge CDN bila CDN aktif. Skrip `scripts/hostinger.mjs` (commit lokal `e788bb4`, belum di-push) sudah memakai API yang sama dan bisa diberi perintah `purge`. Endpoint ini **belum diuji** pada Web App ini.

**Opsi lanjutan (bila trafik menuntut):** artikel dibuat ISR dengan `revalidate = 60`, sehingga CDN menyimpan HTML maksimal 60 detik, dan Server Action memanggil purge API setelah menerbitkan. Syaratnya:
- purge API terbukti bekerja untuk Web App;
- CDN membedakan varian `_rsc`;
- ada persetujuan.

Sampai itu terpenuhi, HTML halaman CMS tidak disimpan di CDN.

## 6. Perubahan kode yang direncanakan (Fase 7–8, perlu persetujuan)

1. Adapter `src/lib/content.ts` membaca database lewat `unstable_cache` dengan tag di atas dan `revalidate: 60`. Tanda tangan fungsi tetap, sehingga komponen tidak berubah.
2. Rute publik CMS memakai `export const dynamic = "force-dynamic"`. `generateStaticParams` artikel dihapus.
3. Halaman tetap memakai `export const revalidate = 3600`.
4. `app/sitemap.ts`, `app/rss.xml/route.ts`, redirect 301 slug lama, dan `X-Robots-Tag` saat staging.
5. Server Action CMS memanggil `updateTag` sesuai tabel invalidasi.
6. QA: periksa header setiap rute dengan `curl -I` (`Cache-Control`, `x-hcdn-cache-status`), lalu terbitkan artikel uji dan pastikan ia muncul di homepage, rubrik, sitemap, dan RSS tanpa purge.

## Sumber

- Next.js 16 (dibundel di `node_modules/next/dist/docs`): *CDN Caching*, *Caching without Cache Components*, `expireTime`, `revalidateTag`/`updateTag`.
- [How Hostinger CDN caching works](https://www.hostinger.com/support/how-hostinger-cdn-caching-works/)
- [Hostinger API reference](https://developers.hostinger.com/) dan [Hostinger API Python SDK: HostingWebsitesApi](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingWebsitesApi.md) (endpoint `cache/clear`)
