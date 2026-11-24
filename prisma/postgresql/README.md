# Arsip: database CMS versi PostgreSQL 16 (Fase 2–4)

Schema dan migrasi di folder ini adalah versi PostgreSQL yang dibangun dan diuji
pada Fase 2–4 (commit `e4e38bf`). Disimpan **tanpa perubahan** sebagai sejarah
dan acuan; tidak dipakai lagi oleh aplikasi, Prisma CLI, atau pengujian.

Sejak 24 November 2026 database CMS memakai **MariaDB Hostinger**:
- schema aktif: `prisma/schema.prisma`
- migrasi aktif: `prisma/migrations/`
- padanan setiap aturan PostgreSQL dan alasannya: `docs/10-migrasi-mariadb.md`

Tidak pernah ada database PostgreSQL produksi, jadi tidak ada data yang perlu
dipindahkan dari versi ini.
