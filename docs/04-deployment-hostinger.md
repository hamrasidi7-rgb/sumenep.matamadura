# Deployment · Hostinger Web Apps → sumenep.matamaduranews.com

Status per 20 November 2026: kode siap di-deploy, **deployment belum dilakukan**. Langkah di hPanel memerlukan login pemilik akun Hostinger.

## 1. Yang di-deploy

| Item | Nilai |
| --- | --- |
| Repository | `hamrasidi7-rgb/sumenep.matamadura`, branch `main` |
| Isi | Tahap 1–4: homepage, kanal/rubrik, tiga template artikel, Chator AI mode pengembangan |
| Database | **Belum diperlukan.** Versi di `main` memakai konten contoh di dalam kode. CMS + PostgreSQL (Tahap 5) dikerjakan di branch terpisah dan baru digabung setelah database produksi tersedia |
| Framework | Next.js 16.4.6 (App Router), Node.js server (`next start`) |

## 2. Pengaturan Web App (hPanel → Websites → Web Apps → Import repositori Git)

| Pengaturan | Nilai |
| --- | --- |
| Repository / branch | `hamrasidi7-rgb/sumenep.matamadura` / `main`. Hubungkan GitHub lewat otorisasi resmi Hostinger, bukan dengan memasukkan password |
| Framework | Next.js |
| Versi Node.js | **22.x** (minimal 20.9, sesuai `engines`; `.nvmrc` = 22) |
| Package manager | npm (ada `package-lock.json`) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm start` (`next start` membaca port dari `$PORT` platform) |
| Output | `.next` (bawaan, bukan export statis) |

### Environment variables

Isi sebelum build pertama. Variabel `NEXT_PUBLIC_*` ditanam ke kode saat build, jadi setiap perubahan nilainya memerlukan build ulang.

| Variabel | Nilai produksi | Catatan |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://sumenep.matamaduranews.com` | URL kanonik, OG, dan tautan berbagi |
| `NEXT_PUBLIC_SITE_ENV` | `staging` | Tetap `staging` (noindex + robots.txt menolak crawler) **sampai peluncuran disetujui**. Nilai `production` mengizinkan indeksasi |

Pada versi ini tidak ada variabel rahasia. Variabel database dan CMS (`DATABASE_URI`, `PAYLOAD_SECRET`) baru dibutuhkan setelah Tahap 5 digabung.

## 3. Domain dan DNS (perlu keputusan pemilik)

Hasil pemeriksaan publik (baca saja) pada 20 November 2026:

- DNS `matamaduranews.com` dikelola Hostinger (`ns1/ns2.dns-parking.com`).
- `sumenep.matamaduranews.com` saat ini **sudah terhubung ke website lain di Hostinger**: halaman PHP 8.3 berjudul "Segera hadir", di belakang Hostinger CDN.

Urutan yang aman:

1. Uji Web App di domain sementara dari Hostinger lebih dulu (lihat §4).
2. Pastikan website lama "Segera hadir" tidak diperlukan, lalu buat backup bila ada isinya.
3. Lepaskan subdomain dari website lama di hPanel. **Langkah ini butuh persetujuan pemilik.** Jangan menghapus website atau database lain tanpa backup.
4. Hubungkan `sumenep.matamaduranews.com` ke Web App. Karena DNS ada di Hostinger, hPanel biasanya mengatur record subdomain sendiri. Bila diminta membuat record manual, catat tipe, nama, dan targetnya lalu konfirmasi dulu. **Jangan mengubah record `@` dan `www`.**
5. Aktifkan SSL di hPanel. Lalu pastikan `http://` dialihkan ke `https://` tanpa redirect loop.

## 4. Verifikasi setelah deploy

Jalankan dari komputer pengembang (Chrome terpasang):

```bash
node scripts/shoot.mjs https://<domain-sementara-atau-final>        # 4 halaman × 12 lebar + interaksi + link
node scripts/qa-articles.mjs https://<domain-sementara-atau-final>  # 3 template × 9 lebar
curl -sI https://sumenep.matamaduranews.com/robots.txt              # staging: Disallow: /
```

Hal yang diperiksa:

- tidak ada overflow;
- tidak ada gambar rusak;
- tidak ada error console;
- semua tautan internal 200;
- drawer navigasi dan panel Chator berfungsi;
- `noindex` aktif.

## 5. Kebutuhan berikutnya (Tahap 5: CMS)

- **PostgreSQL produksi.** Paket hosting/Web Apps Hostinger umumnya hanya menyediakan MySQL/MariaDB, dan PostgreSQL biasanya memerlukan VPS atau layanan terkelola. Mohon konfirmasi apa yang tersedia di paket Anda. Pilihannya:
  - (a) PostgreSQL di Hostinger VPS;
  - (b) layanan terkelola (misalnya Neon, atau project Supabase **baru** yang terpisah dari MataGen).

  Database harus khusus SUMENEP, dan `DATABASE_URI` diisi lewat environment variables hPanel.
- **Penyimpanan media.** File unggahan perlu disimpan di tempat yang tidak hilang saat redeploy, misalnya bucket S3-compatible. Ini perlu diputuskan bersama database.
- Selama keduanya belum tersedia, situs berjalan dengan konten contoh dan **CMS belum aktif di produksi**.
