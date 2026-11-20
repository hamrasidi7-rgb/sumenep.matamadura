# Layanan eksternal: PostgreSQL terkelola dan penyimpanan media

Status: **laporan untuk persetujuan**. Belum ada akun, langganan, atau layanan berbayar yang dibuat atau diaktifkan.

Konteks keputusan (Opsi 1, disetujui): aplikasi tetap di Hostinger Web Apps. Database PostgreSQL dan media memakai layanan eksternal, karena Web Apps tidak menyediakan PostgreSQL maupun disk yang bertahan antar-deploy.

Harga diambil dari halaman resmi penyedia per November 2026, dalam USD, belum termasuk pajak. Harga penyedia cloud sering berubah, jadi cek ulang saat mendaftar.

## Rekomendasi singkat

| Kebutuhan | Rekomendasi | Perkiraan biaya |
| --- | --- | --- |
| Database | **Neon, paket Launch**, region AWS Asia Pacific (Singapura) | sekitar **US$10–21/bulan** |
| Media | **Cloudflare R2**, kelas Standard | **US$0/bulan** selama di bawah kuota gratis (10 GB); setelah itu US$0,015/GB/bulan |
| **Total awal** | | **sekitar US$10–21/bulan** |

## 1. Database: PostgreSQL terkelola

### Pilihan yang dibandingkan

| | **Neon, Launch** (direkomendasikan) | Supabase, Pro | DigitalOcean Managed PostgreSQL |
| --- | --- | --- | --- |
| Model biaya | Sesuai pemakaian, tanpa minimum bulanan. Compute US$0,106/CU-jam, storage US$0,35/GB-bulan | US$25/bulan, sudah termasuk kredit compute US$10 (cukup untuk 1 instance Micro) | Mulai US$15/bulan per node (1 GiB RAM) |
| Perkiraan SUMENEP | **US$10–21/bulan** (lihat hitungan di bawah) | sekitar **US$25/bulan** | sekitar **US$15/bulan** |
| Kapasitas penyimpanan | Dibayar sesuai pemakaian. Data CMS teks diperkirakan < 1–2 GB di tahun pertama | 8 GB disk termasuk | Sesuai ukuran node (paket dasar) |
| Backup | **Instant restore (PITR) ke titik mana pun dalam jendela riwayat**: Launch sampai 7 hari, riwayat US$0,20/GB-bulan | Backup harian, retensi 7 hari. PITR adalah add-on mulai sekitar US$100/bulan | Backup harian otomatis (detail PITR perlu dikonfirmasi) |
| Region dekat Indonesia | AWS Singapura (`aws-ap-southeast-1`) | Singapura | Singapura (SGP1) |
| Keamanan koneksi | TLS wajib; role terpisah; IP allowlist hanya di paket Scale | TLS; pooler | TLS; *trusted sources* (IP allowlist) |
| Catatan | Compute tidur setelah 5 menit tanpa koneksi. Kueri pertama sesudahnya sedikit lebih lambat | Banyak fitur (auth, storage) yang tidak kita pakai | Harga tetap; server tidak pernah tidur |

**Mengapa Neon:**
- Postgres standar, cocok dengan driver `pg` dan Prisma yang dipakai di Fase 2;
- biaya mengikuti pemakaian nyata situs editorial dengan trafik moderat;
- PITR 7 hari sudah termasuk di Launch (Supabase menjualnya sebagai add-on mahal);
- region Singapura.

**Kapan memilih yang lain:**
- **Supabase Pro:** bila ingin tagihan tetap US$25.
- **DigitalOcean:** bila ingin server yang tidak pernah tidur, dengan harga tetap.

### Hitungan perkiraan Neon Launch

| Komponen | Asumsi | Biaya/bulan |
| --- | --- | --- |
| Compute | 0,25 CU. Aktif 12–24 jam/hari = 91–183 CU-jam × US$0,106 | US$9,7–19,4 |
| Storage | 0,5–2 GB × US$0,35 | US$0,2–0,7 |
| Riwayat restore (7 hari) | 0,5–1 GB × US$0,20 | US$0,1–0,2 |
| **Total** | | **sekitar US$10–21** |

Angka atas berarti database aktif sepanjang waktu. Karena halaman publik membaca dari data cache Next.js (lihat [06-cache-seo.md](06-cache-seo.md)), query ke database jauh lebih sedikit daripada jumlah pengunjung.

### Kebijakan backup yang diusulkan

1. Jendela riwayat Neon di-set ke **7 hari** (bawaannya 1 hari). Ini memungkinkan pemulihan ke menit tertentu, misalnya sebelum artikel terhapus.
2. Backup logis mingguan (`pg_dump`) ke penyimpanan terpisah (bucket R2 privat atau komputer redaksi). Skripnya dibuat di Fase 9.
3. Uji pemulihan sekali sebelum peluncuran. Pulihkan ke branch Neon terpisah, jangan menimpa produksi.

### Keamanan koneksi

- Koneksi wajib TLS (`sslmode=verify-full` di connection string).
- Dua role seperti di Fase 2:
  - **runtime** (`DATABASE_URL`) dipasang di Hostinger, hanya DML, tanpa hak mengubah Activity Log;
  - **pemilik** (`DIRECT_URL`) hanya dipakai dari komputer operator untuk migrasi dan CLI Admin, **tidak dipasang di server web**.
- Password acak panjang, dibuat di konsol Neon, tidak pernah dikirim lewat chat.
- Setelah migrasi, `npm run db:grants` memastikan hak akses dan zona waktu UTC.

### Integrasi dengan Hostinger

1. Pemilik membuat akun dan proyek Neon (region Singapura), lalu membuat database `sumenep` dan role runtime. Pemilik juga menyetujui metode pembayaran; saya tidak memasukkan data pembayaran.
2. Dari komputer operator: `npm run db:migrate -- --env-file .env.production.local --yes`, lalu `npm run db:seed` dan `npm run admin:bootstrap`. Hapus file env produksi setelah selesai.
3. Di hPanel → Web App → Environment variables: tambahkan `DATABASE_URL` (role runtime). Dokumentasi Hostinger: perubahan env memerlukan deploy ulang.
4. Hostinger mendukung koneksi Node.js ke database eksternal (panduannya memakai contoh Supabase). Koneksi keluar ke port 5432 akan diuji saat integrasi (Fase 8, dengan persetujuan deploy).
5. Region: Singapura dipilih karena paling dekat dengan pembaca. Lokasi server Web App Hostinger perlu dicek di hPanel. Bila server berada jauh dari Asia, region database disesuaikan sebelum proyek dibuat; region Neon tidak bisa dipindah setelahnya.

## 2. Media: Cloudflare R2

| Item | Keterangan |
| --- | --- |
| Paket | R2 Standard, bayar sesuai pemakaian. Kuota gratis per bulan: 10 GB-bulan storage, 1 juta operasi Kelas A (tulis/list), 10 juta operasi Kelas B (baca) |
| Biaya di atas kuota | Storage US$0,015/GB-bulan; Kelas A US$4,50/juta; Kelas B US$0,36/juta; **egress gratis** |
| Perkiraan SUMENEP | 2.000 foto × (asli sekitar 1 MB + 3 varian WebP sekitar 300 KB) ≈ 2,6 GB → **US$0/bulan**. Contoh 100 GB ≈ US$1,35/bulan |
| Kapasitas | Tidak dibatasi. Biaya per GB |
| Backup | R2 dirancang sangat tahan data, tetapi **tidak ada backup otomatis untuk file yang dihapus**. Usulan: penghapusan di Media Library bertahap (tandai dulu, hapus permanen belakangan) dan sinkronisasi berkala ke penyimpanan lain (Fase 9) |
| Keamanan | Bucket **privat**. API token S3 hanya untuk satu bucket (Object Read & Write), disimpan sebagai env di Hostinger. Upload dilakukan server (Server Action/Route Handler + Zod), bukan langsung dari browser |
| Penyajian ke pembaca | Lewat rute aplikasi sendiri, misalnya `/media/<key>`, dengan `Cache-Control: public, max-age=31536000, immutable` (key berisi hash) sehingga disimpan CDN Hostinger. **Tidak perlu perubahan DNS.** Domain kustom R2 mengharuskan DNS dikelola di Cloudflare, dan subdomain `r2.dev` tidak dimaksudkan untuk produksi |
| Integrasi Hostinger | Env: `S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`. Dependensi baru `@aws-sdk/client-s3` di Fase 6 |
| Aktivasi | Akun Cloudflare milik pemilik. Cloudflare kemungkinan meminta metode pembayaran untuk mengaktifkan R2 meski pemakaian masih di dalam kuota gratis (cek saat aktivasi) |

Alternatif yang setara (S3-compatible): Backblaze B2 atau DigitalOcean Spaces. R2 direkomendasikan karena egress gratis dan kuota gratisnya cukup untuk tahun pertama.

## 3. Yang saya perlukan untuk melanjutkan

1. Persetujuan penyedia dan paket: Neon Launch (atau Supabase Pro / DigitalOcean) dan Cloudflare R2.
2. Konfirmasi lokasi server Web App Hostinger (hPanel), untuk memilih region database.
3. Akun dan pembayaran dibuat oleh pemilik. Kredensial diisikan sendiri ke panel Hostinger atau file env lokal, **tidak dikirim lewat chat**.
4. Persetujuan terpisah untuk setiap deployment yang mengaktifkan database atau media di produksi.

## Sumber

- Neon: [Pricing](https://neon.com/pricing) · [Plans](https://neon.com/docs/introduction/plans) · [Restore window](https://neon.com/docs/introduction/restore-window) · [Regions](https://neon.com/docs/introduction/regions) · [Connect securely](https://neon.com/docs/connect/connect-securely)
- Supabase: [Pricing](https://supabase.com/pricing) · [Compute and Disk](https://supabase.com/docs/guides/platform/compute-add-ons)
- DigitalOcean: [PostgreSQL pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)
- Cloudflare: [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- Hostinger: [Environment variables (Node.js)](https://docs.hostinger.com/node.js/environment-variables) · [Connecting a Supabase database to a Hostinger Node.js application](https://www.hostinger.com/support/connecting-a-supabase-database-to-a-hostinger-node-js-application/)
