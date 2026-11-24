-- USANG, jangan dipakai. Gunakan npm run hosting:check atau prisma/sql/hostinger-probe-clean.sql.
-- Bagian 6 berkas ini gagal dengan error 1419 bila trigger tidak diizinkan, sehingga tabel uji tertinggal.
-- ============================================================================
-- SUMENEP · Pemeriksaan database MariaDB Hostinger (Tahap D)
--
-- Jalankan di phpMyAdmin, PADA DATABASE SUMENEP YANG BARU DAN MASIH KOSONG
-- (BUKAN database WordPress): pilih database itu di panel kiri, buka tab "SQL",
-- tempel SATU bagian, klik "Go", lalu salin hasilnya. Tidak ada password di sini.
--
-- Bagian 1–4 hanya membaca. Bagian 5 membuat SATU tabel uji sementara
-- (zz_sumenep_probe) beserta triggernya, lalu menghapusnya lagi (bagian 6).
-- ============================================================================

-- ── 1. Versi dan pengaturan server ───────────────────────────────────────────
SELECT
  VERSION()                          AS versi,
  @@version_comment                  AS distribusi,
  @@log_bin                          AS binary_log,
  @@log_bin_trust_function_creators  AS trigger_tanpa_super,
  @@max_connections                  AS max_connections,
  @@max_user_connections             AS max_user_connections,
  @@wait_timeout                     AS wait_timeout_detik,
  @@max_allowed_packet               AS max_allowed_packet,
  @@global.time_zone                 AS zona_waktu_server,
  @@system_time_zone                 AS zona_waktu_sistem,
  @@character_set_server             AS charset_server,
  @@collation_server                 AS collation_server,
  @@default_storage_engine           AS engine,
  DATABASE()                         AS database_aktif,
  CURRENT_USER()                     AS user_aktif;

-- ── 2. Hak akses user ini ────────────────────────────────────────────────────
SHOW GRANTS FOR CURRENT_USER();

-- ── 3. Database harus utf8mb4 dan masih kosong ───────────────────────────────
SELECT DEFAULT_CHARACTER_SET_NAME AS charset_db, DEFAULT_COLLATION_NAME AS collation_db,
       (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS jumlah_tabel
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();

-- ── 4. Fitur yang dipakai migrasi SUMENEP ────────────────────────────────────
-- Harapan: regex_peka_huruf = 0, json = ARRAY, selisih_utc_detik = 0
SET time_zone = '+00:00';
SELECT 'Ab' REGEXP '(?-i)^[a-z]+$'               AS regex_peka_huruf,
       JSON_TYPE('[]')                             AS json,
       @@session.time_zone                         AS zona_sesi,
       TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS selisih_utc_detik;

-- ── 5. Uji CREATE TRIGGER (tabel sementara) ──────────────────────────────────
-- Bila muncul error #1419 ("You do not have the SUPER privilege and binary
-- logging is enabled") atau #1142, trigger TIDAK diizinkan: catat pesannya,
-- lalu langsung jalankan bagian 6.
CREATE TABLE zz_sumenep_probe (id INT PRIMARY KEY, catatan VARCHAR(20)) ENGINE=InnoDB;
CREATE TRIGGER zz_sumenep_probe_tr BEFORE UPDATE ON zz_sumenep_probe FOR EACH ROW SET NEW.catatan = 'trigger-jalan';
INSERT INTO zz_sumenep_probe VALUES (1, 'awal');
UPDATE zz_sumenep_probe SET catatan = 'diubah' WHERE id = 1;
-- Harapan bila trigger diizinkan: catatan = trigger-jalan
SELECT catatan FROM zz_sumenep_probe WHERE id = 1;

-- ── 6. Bersihkan (selalu jalankan) ───────────────────────────────────────────
DROP TRIGGER IF EXISTS zz_sumenep_probe_tr;
DROP TABLE IF EXISTS zz_sumenep_probe;
SELECT COUNT(*) AS jumlah_tabel_setelah_bersih FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
