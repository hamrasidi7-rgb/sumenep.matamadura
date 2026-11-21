# 09 · CMS Artikel (Fase 4)

Branch `backend/fase-4-cms-artikel`, dibangun di atas Fase 3 (`80d5614`). Dokumen ini berisi panduan memakai CMS, aturan publikasi, rincian teknis, dan daftar modul Busacare yang dipakai ulang.

Ringkasnya, Admin bisa menulis, menyimpan otomatis, mempratinjau, menerbitkan, menjadwalkan, mengarsipkan, membuang ke tempat sampah, memulihkan, dan menghapus artikel. Isi ditulis dengan editor TipTap, lalu disimpan sebagai JSON yang sudah disaring di server. Saat ditampilkan, JSON itu diubah ke model blok frontend SUMENEP (`ArticleBlock[]`), sehingga komponen artikel publik tidak berubah.

Tetap ada **satu akun dengan satu peran: ADMIN**. Tidak ada login Penulis, Editor, atau Operator, dan tidak ada pendaftaran publik. Profil penulis hanya data redaksi yang dipilih di formulir.

---

## 1. Memulai (development)

```bash
npm run db:start            # PostgreSQL lokal (dibuat oleh npm run db:setup)
npm run db:migrate:dev      # memastikan skema terbaru (Fase 4 tidak menambah migrasi)
npm run db:seed             # kanal, rubrik, dan penulis "Redaksi SUMENEP"
npm run admin:bootstrap -- --email … --name "…"   # dijalankan PEMILIK PROYEK sendiri
npm run dev                 # http://localhost:3200/admin/login → menu "Artikel"
```

- **Admin development belum dibuat.** Pemilik proyek menjalankan `admin:bootstrap` di terminal sendiri. Password diketik langsung di terminal, tidak pernah dikirim lewat chat, dan tidak disimpan di repository (prosedur lengkap ada di [docs/05](05-backend-fondasi.md)).
- Agar artikel terbit dari CMS tampil di `/artikel/<slug>`, isi `CMS_PUBLIC_ARTICLES=on` di `.env`. Lihat [§8](#8-variabel-lingkungan).
- Gambar unggahan disimpan di folder `media/` (`MEDIA_ROOT`). Folder ini diabaikan git.

---

## 2. Panduan pemakaian

### Daftar artikel: `/admin/artikel`

| Fitur | Cara pakai |
| --- | --- |
| Status | Tab **Semua · Draf · Terjadwal · Terbit · Arsip · Tempat sampah**, masing-masing dengan jumlahnya. "Semua" tidak memuat isi tempat sampah. |
| Cari | Mencari di judul, lead, slug, dan isi tanpa membedakan huruf besar/kecil, ditambah tag yang ditulis sama persis. |
| Filter | Kanal, rubrik, serta rentang tanggal **Dari–Sampai (WIB)**. Untuk artikel terbit atau terjadwal, yang dipakai tanggal terbit. Untuk artikel lain, tanggal dibuat. |
| Halaman | 20 artikel per halaman. Semua filter tersimpan di URL, jadi bisa dibookmark dan dibagikan. |

### Menulis: `/admin/artikel/baru`

1. **Judul.** Slug terisi otomatis dari judul sampai Anda mengubahnya sendiri. Slug memakai huruf kecil, angka, dan tanda hubung, paling panjang 120 karakter. Slug yang masih dipakai artikel lain, termasuk slug lama yang dialihkan, tidak bisa dipakai lagi.
2. **Lead (standfirst):** satu sampai dua kalimat inti tulisan.
3. **Isi artikel.** Blok yang tersedia ada di [§3](#3-blok-isi-artikel).
4. **Gambar utama.** Pilih dari unggahan atau unggah baru. Teks alternatif wajib diisi. Caption dan kredit foto bisa diubah kapan saja, dan langsung tersimpan begitu kolomnya ditinggalkan.
5. **Pengaturan:** penulis, kanal, rubrik, tag (maksimal 12), template (Berita, Feature, atau Sorotan, yang sesuai dengan template Standard, Feature, dan Spotlight di frontend), dan pilihan "sembunyikan dari beranda".
6. **SEO.** Isi judul SEO, meta description, canonical URL (opsional, hanya `https://`), dan gambar OG. Di bawahnya ada pratinjau hasil pencarian dan **panel SEO**, yang menampilkan temuan berstatus Lolos, Perlu perhatian, atau Belum ada. Panel ini tidak memberi skor angka.

### Menyimpan

- **Simpan otomatis** berjalan 2,5 detik setelah ketikan terakhir, khusus untuk artikel yang belum terbit. Fitur ini **tidak pernah menerbitkan** artikel.
- **Simpan draf** menyimpan sekaligus membuat **revisi**. Revisi juga dibuat setiap kali artikel diterbitkan. Panel *Revisi* menampilkan 20 revisi terakhir. Tombol **Muat ke editor** hanya memuat isi revisi ke formulir; perubahan itu baru tersimpan setelah Anda menyimpan.
- Indikator status di kanan atas:

| Status | Arti |
| --- | --- |
| Belum disimpan / Menyimpan… | Ada perubahan yang sedang disimpan. |
| **Tersimpan** | Perubahan sudah ada di database (disertai jamnya). |
| **Offline, tersimpan di perangkat ini** | Koneksi putus. Salinan ada di browser (localStorage) dan dikirim lagi otomatis begitu koneksi kembali. |
| **Konflik: ada versi lebih baru** | Artikel sudah disimpan dari tab atau perangkat lain. Tidak ada yang ditimpa. Anda memilih **Muat versi terbaru** atau **Timpa dengan versi saya**. |
| **Perubahan belum tayang** | Artikel sedang terbit. Perubahan baru tayang setelah Anda menekan **Perbarui**. |

- Jika browser tertutup sebelum perubahan tersimpan, editor menawarkan **Pulihkan** atau **Buang** salinan lokal saat artikel dibuka lagi.
- Menutup tab yang masih punya perubahan belum tersimpan memunculkan peringatan dari browser.

### Pratinjau

Tombol **Pratinjau** menyimpan perubahan dulu, lalu membuka `/pratinjau/<id>` di tab baru. Halaman ini memakai template artikel SUMENEP yang sama dengan situs publik, dengan pita **PRATINJAU**. Halaman hanya bisa dibuka Admin yang sedang login dan bertanda `noindex` (`X-Robots-Tag` dan meta robots).

### Menerbitkan dan mengatur status

| Tombol | Hasil |
| --- | --- |
| **Terbitkan sekarang** | Artikel langsung tayang. Syaratnya: lead, gambar utama, kanal atau rubrik, dan isi sudah diisi. |
| **Jadwalkan** (tanggal-jam WIB) | Status menjadi terbit dengan waktu di masa depan. Artikel **tidak tampil** sampai waktunya tiba. Jadwal bisa diubah lewat tombol **Ubah**. |
| **Perbarui** | Menayangkan perubahan pada artikel yang sudah terbit, dan membuat revisi. |
| **Tarik dari publikasi** | Artikel kembali menjadi draf dan hilang dari situs. |
| **Arsipkan** / **Kembalikan dari arsip** | Artikel yang diarsipkan tidak tampil di situs. Jika dikembalikan, artikel menjadi draf. |
| **Pindahkan ke tempat sampah** / **Pulihkan** | Artikel di tempat sampah tidak tampil di situs dan tidak bisa disunting. Artikel yang dipulihkan kembali ke status semula. Artikel yang sudah terbit sebelum dibuang akan langsung tampil lagi. |
| **Hapus permanen** | Hanya tersedia dari tempat sampah dan meminta konfirmasi. Tindakan ini tidak bisa dibatalkan. |

Jika slug **artikel yang pernah terbit** diganti, alamat lama otomatis dialihkan secara permanen (301/308) ke alamat baru. Selama artikel belum pernah terbit, slug lama tidak dicatat.

Setiap tindakan tercatat di **Activity Log** (dashboard → Aktivitas terbaru).

---

## 3. Blok isi artikel

| Blok | Toolbar | Ditampilkan di situs sebagai |
| --- | --- | --- |
| Paragraf; tebal, miring, garis bawah, coret, kode | Tebal · Miring · Garis bawah · Coret · Kode | paragraf (teks kaya) |
| Subjudul H2, H3, H4 | Subjudul H2/H3/H4 | heading (beserta daftar isi) |
| Daftar berpoin dan bernomor, boleh bertingkat | Daftar berpoin · Daftar bernomor | list |
| Kutipan (blockquote) | Kutipan | quote |
| Kutipan menonjol, dengan narasumber | Kutipan menonjol | pull quote |
| Tautan: tautan luar atau artikel SUMENEP | Tautan | link (tautan luar mendapat `rel="noopener noreferrer"`) |
| Gambar, dengan alt, caption, dan ukuran kolom/lebar | Gambar | image |
| Galeri (hingga 40 gambar) | Galeri | gallery |
| Infografik, dengan judul dan gambar | Infografik | infographic |
| Tabel, dengan keterangan dan sumber data. Bisa ditempel dari teks berformat `\| a \| b \|` | Tabel | table |
| Video YouTube atau Vimeo, dengan judul dan caption | Video YouTube/Vimeo | video (diputar setelah diklik, memakai `youtube-nocookie`) |
| Peta, dari koordinat atau tautan peta | Peta | map |
| Garis pemisah | Garis pemisah | divider |

Media dirujuk lewat ID, bukan URL. Karena itu, caption atau kredit yang diubah belakangan langsung berlaku di semua artikel yang memakai gambar tersebut.

---

## 4. Keamanan

- **Sanitasi di server** (`src/server/articles/sanitize.ts`) bekerja dengan daftar putih. Node dan mark yang tidak dikenal dibuang, dan setiap atribut disusun ulang dari nilai yang sudah diperiksa:
  - Tautan hanya boleh `http(s)`, `mailto`, `tel`, atau alamat internal. `javascript:` dan sejenisnya dibuang.
  - Video hanya menerima ID YouTube atau Vimeo yang valid. HTML atau iframe mentah tidak pernah diterima.
  - Peta hanya menerima koordinat yang valid.
  - Ukuran dokumen dibatasi: 8000 node dan kedalaman 24.
  - Formulir yang dipalsukan pun tetap disaring. Hal ini diuji E2E dengan Server Action yang dikirim manual.
- **Unggahan gambar** (`src/server/media/service.ts`):
  - Format ditentukan dari isi berkas, bukan nama atau MIME dari browser. Yang diterima: JPEG, PNG, WebP, AVIF/HEIF, dan GIF, maksimal 15 MB. SVG dan berkas lain ditolak.
  - Gambar diputar sesuai EXIF, diperkecil hingga maksimal 2400 px, lalu disimpan sebagai WebP. **Metadata seperti kamera dan GPS dibuang.**
  - Berkas identik tidak disimpan dua kali (dedupe sha256).
  - Kunci berkas diperiksa ketat (`yyyy/mm/<hash>.webp`) sehingga tidak bisa dipakai untuk path traversal.
- **Akses:**
  - Semua halaman `/admin/artikel*`, `/pratinjau/*`, dan `/api/admin/media` melewati proxy dan pemeriksaan sesi di database.
  - Setiap Server Action juga memeriksa Origin (`assertSameOrigin`) dan sesi (`requireAdmin`). Tanpa login, pengguna diarahkan ke halaman login; API menjawab 401.
- **Penguncian optimistis.** Setiap penyimpanan mengirim `version` yang menjadi titik awalnya. Database hanya menerima penyimpanan jika versi itu masih yang terbaru, sehingga perubahan yang lebih baru tidak pernah tertimpa diam-diam.

---

## 5. Publikasi dan cache

**Kapan artikel tampil di situs.** Artikel hanya tampil jika keempat syarat ini terpenuhi:

- status `PUBLISHED`;
- `publishedAt` ≤ sekarang;
- tidak diarsipkan;
- tidak berada di tempat sampah.

Aturan ini ditulis di satu tempat (`publicWhere` di `src/server/articles/status.ts`) dan dipakai oleh halaman publik maupun pengujian.

**Cache:**

- Data artikel publik di-cache di server dengan `unstable_cache` dan tag `articles`. Batas waktunya `CMS_CACHE_SECONDS` (default 60 detik).
- Setiap terbit, pembaruan, perubahan status, penghapusan, atau perubahan caption/kredit gambar langsung membersihkan cache tersebut (`updateTag("articles")`).
- Artikel terjadwal muncul paling lambat `CMS_CACHE_SECONDS` setelah waktunya. Cache Next.js bersifat *stale-while-revalidate*: begitu batas waktunya lewat, permintaan pertama masih menerima data lama sambil cache diperbarui di latar belakang, dan permintaan berikutnya sudah menerima data baru.
- Cache data ini disimpan di disk (`.next/cache/fetch-cache`) dan **tidak hilang saat server di-restart**. Jika database diganti atau dipulihkan dari backup, hapus folder itu supaya tidak ada data lama yang tersisa. Runner E2E melakukannya di setiap run.
- `/artikel/[slug]` sekarang dirender dinamis dengan `Cache-Control: no-store`, sehingga **CDN tidak bisa menyimpan artikel lama**. Hal ini diperiksa di pengujian E2E. Cache CDN yang lebih agresif (s-maxage dan purge) dirancang di [docs/06](06-cache-seo.md) untuk fase deploy.

**Cakupan tampilan publik:**

- Hanya `/artikel/[slug]` yang membaca database CMS. Halaman ini mencari artikel CMS lebih dulu, lalu konten contoh.
- Beranda, kanal, rubrik, dan "terbaru" **tetap memakai konten contoh sampai Fase 8**. Keputusan ini disengaja: desain frontend publik dan beranda tidak diubah di fase ini.
- Artikel terkait di halaman artikel CMS diambil dari artikel terbit pada kanal/rubrik yang sama.

---

## 6. Model data

Model `Article` dari Fase 2 dipakai apa adanya, **tanpa migrasi baru**.

| Kebutuhan | Kolom |
| --- | --- |
| judul, slug, lead | `title`, `slug` (unik), `standfirst` |
| isi TipTap | `body` (JSON yang sudah disaring); turunannya `bodyText` (pencarian) dan `readingMinutes` |
| gambar utama, caption, kredit | `heroMediaId` → `media.alt`, `media.caption`, `media.credit` |
| penulis, kanal, rubrik, tag | `authorId`, `kanalId`, `rubrikId`, `tags[]` |
| status, waktu terbit | `status` (DRAFT/PUBLISHED/ARCHIVED), `publishedAt`, `archivedAt`, `deletedAt` (tempat sampah) |
| SEO | `seoTitle`, `seoDescription`, `canonicalUrl`, `ogMediaId` |
| versi dan waktu | `version`, `createdAt`, `updatedAt` |
| riwayat | `article_slug_history` (diisi trigger), `article_revision`, `article_status_change`, `article_media` (pemakaian media di isi dan galeri) |

---

## 7. Modul Busacare yang dipakai ulang

Source Busacare **tidak diubah**. Modul-modulnya disalin lalu disesuaikan di repository ini. Setiap berkas mencantumkan asalnya di komentar kepala.

### Dipakai ulang dengan penyesuaian kecil

| Busacare | SUMENEP | Penyesuaian |
| --- | --- | --- |
| `lib/tiptap-sanitasi.ts` | `src/server/articles/sanitize.ts` | Prinsip daftar putih yang sama; ditambah node galeri, infografik, kutipan menonjol, video, peta, dan tabel. |
| `lib/seo-engine/types.ts` (RichContentNode) | `src/lib/article-doc.ts` | Tipe dokumen dan helper (teks polos, waktu baca, ID media). |
| `lib/status-artikel.ts` | `src/server/articles/status.ts` | Ditambah status arsip dan tempat sampah. |
| `lib/slug-artikel.ts` | `src/lib/article-slug.ts`, `src/server/articles/slug.ts` | `terapkanSlugBaru` tidak dipakai karena riwayat slug sudah dicatat trigger database (Fase 2). |
| `lib/artikel-teks.ts` (tabel pipe) | `src/components/admin/editor/pipe-table.ts` | Perilaku sama. |
| `components/admin/editor/article-table-node.ts` | `editor/TableNode.ts` | Keterangan dan sumber tabel. |
| `components/admin/editor/article-image-node.tsx` | `editor/nodes.tsx` (ArticleImage) | Merujuk media lewat ID, bukan URL. |
| `components/admin/editor/rich-text-editor.tsx` | `editor/RichTextEditor.tsx` | Toolbar SUMENEP dan tombol blok baru. |
| `components/admin/editor/link-dialog.tsx` + pencarian tautan | `editor/LinkDialog.tsx`, `searchLinkTargetsAction` | Mencari artikel SUMENEP yang sudah terbit. |
| `lib/seo-engine` (aturan judul, lead, isi, gambar) | `src/lib/seo-engine.ts` | Aturan kata kunci tidak dipakai karena tidak ada kolom kata kunci fokus. |
| `components/admin/editor/seo-panel.tsx` | `components/admin/articles/SeoPanel.tsx` | Gaya admin SUMENEP. |
| `app/admin/(dashboard)/berita/actions.ts` | `src/server/articles/service.ts` + `artikel/actions.ts` | Aturan create, update, autosave, dan delete sama; lihat perubahan di bawah. |
| `components/admin/artikel-form.tsx` (pola autosave) | `components/admin/articles/ArticleEditor.tsx` | Autosave dengan jeda dan penjaga "perubahan belum disimpan". |
| `app/admin/(dashboard)/berita/pratinjau/[id]` | `src/app/(site)/pratinjau/[id]` | Memakai template artikel SUMENEP. |
| Halaman "Semua berita" | `artikel/page.tsx` | Filter lewat URL dan paging di database. |
| Upload route + pipeline sharp | `src/server/media/service.ts` | Hasil WebP, dedupe, dan driver penyimpanan. |

### Ditulis baru atau diubah, beserta alasannya

| Bagian | Alasan |
| --- | --- |
| `docToBlocks` (`src/server/articles/blocks.ts`) | Busacare menampilkan HTML, sedangkan SUMENEP memakai model blok `ArticleBlock[]`. Konverter ini membuat frontend artikel bisa dipakai tanpa diubah. |
| Node galeri, infografik, kutipan menonjol, video, dan peta | Busacare tidak memiliki blok-blok ini. Polanya mengikuti node gambar Busacare. |
| Media lewat ID, pemilih media, dan abstraksi penyimpanan | Caption dan kredit harus bisa diubah di satu tempat. Driver lokal bisa diganti object storage (R2) di Fase 6 tanpa mengubah editor. |
| Cache `unstable_cache` + `updateTag` | Busacare memakai mekanisme revalidasi yang berbeda. Cara ini mengikuti rancangan [docs/06](06-cache-seo.md). |
| Arsip, tempat sampah, dan revisi | Fitur ini diminta di Fase 4 dan tidak ada di Busacare. |
| Penguncian dengan `version` | Menggantikan perbandingan `updatedAt` di Busacare. Kolom `version` sudah ada di model Fase 2, dan cara ini tidak terpengaruh presisi waktu. |
| Autosave tidak menyentuh artikel terbit | **Sengaja berbeda dari Busacare.** Ketikan setengah jadi tidak boleh langsung tayang. Perubahan pada artikel terbit hanya tayang lewat tombol **Perbarui**. |

---

## 8. Variabel lingkungan

| Variabel | Fungsi |
| --- | --- |
| `CMS_PUBLIC_ARTICLES` | `on` berarti `/artikel/[slug]` mencari artikel terbit di database CMS lebih dulu. Jika kosong, situs tetap sepenuhnya memakai konten contoh. |
| `CMS_CACHE_SECONDS` | Lama cache data artikel publik di server, dalam detik (default 60). |
| `MEDIA_ROOT` | Folder gambar unggahan untuk driver lokal (default `media`). |

---

## 9. Pengujian

```bash
npm test             # unit + database (database sementara per proses)
npm run test:e2e     # build produksi + next start :3301 + Chrome headless (database dan folder media sementara)
npm run typecheck
npm run build
```

Hasil di akhir Fase 4: **185 tes lulus**, terdiri dari 48 unit, 102 database, dan 35 end-to-end. Typecheck dan build produksi juga bersih.

Cakupan khusus Fase 4:

- **Unit** (`tests/unit/articles.test.ts`): sanitasi, konversi blok, slug, status, validasi kolom, mesin SEO, tabel pipe, dan koordinat.
- **Database** (`tests/db/11-articles.test.ts`, `12-media.test.ts`):
  - membuat dan menyimpan; konflik versi; autosave ditolak untuk artikel terbit;
  - sanitasi; pemakaian media; SEO;
  - syarat terbit; visibilitas (terjadwal, arsip, tempat sampah); tarik dari publikasi;
  - redirect slug; hapus permanen; filter daftar;
  - unggahan (EXIF, WebP, dedupe, penolakan SVG), metadata media, dan validasi kunci.
- **E2E** (`tests/e2e/05-articles.test.ts`):
  - akses tanpa login;
  - menulis lewat UI (format, kutipan menonjol, video, tabel, unggah gambar utama) → autosave → pratinjau (Admin saja, noindex) → terbit di template publik dengan `no-store` → ganti slug menghasilkan 301/308;
  - membuka artikel saja tidak menyimpan apa pun; konflik dua tab; offline lalu tersimpan setelah koneksi kembali;
  - jadwal (tersembunyi lalu tampil), arsip, tempat sampah, pulihkan, hapus permanen;
  - pencarian dan filter;
  - Server Action palsu dengan `javascript:` dan `<script>` tersimpan dalam keadaan bersih;
  - editor dan daftar di layar 390 px tanpa gulir horizontal.

Screenshot ada di [docs/screenshots/cms/](screenshots/cms/).

---

## 10. Batasan dan pekerjaan lanjutan

- **Daftar publik** (beranda, kanal, rubrik, terbaru, pencarian, dan sitemap) masih memakai konten contoh. Semuanya beralih ke database CMS di Fase 8, bersamaan dengan pengaturan beranda.
- **Media Library** (halaman kelola semua gambar, folder, dan penggantian berkas) dikerjakan di Fase 6. Saat ini gambar dikelola dari editor.
- **Penyimpanan produksi.** Driver lokal cocok untuk development. Hosting dengan disk yang tidak permanen membutuhkan object storage (R2, lihat [docs/07](07-layanan-eksternal.md)), yang dikerjakan di Fase 6 dan butuh persetujuan karena memakai layanan eksternal.
- **Revisi** belum memiliki tampilan perbandingan (diff), hanya bisa dimuat kembali ke editor.
- **Penulis** dikelola lewat seed atau database. Halaman kelola profil penulis belum ada.
- **Thumbnail video** di komponen frontend `ArticleVideo` (Tahap 4, tidak diubah di fase ini) diambil dari `i.ytimg.com` sebelum tombol putar ditekan. Akibatnya, permintaan ke Google sudah terjadi sebelum pembaca memutar video, dan video yang dihapus atau privat menampilkan gambar rusak. Usulan untuk fase frontend berikutnya: simpan thumbnail sebagai media lokal dan sediakan cadangan bila gambar gagal dimuat.
- **Daftar artikel** di CMS menampilkan hasil pencarian dan filter dari database. Pencarian memakai `contains` biasa, belum full-text, dan sudah cukup untuk ribuan artikel. Indeks full-text bisa ditambahkan di Fase 8 bila diperlukan.
