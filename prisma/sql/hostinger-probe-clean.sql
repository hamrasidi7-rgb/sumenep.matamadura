-- SUMENEP - pemeriksaan database MariaDB Hostinger untuk Tahap D, versi bersih.
-- Jalankan di phpMyAdmin HANYA pada database SUMENEP yang baru dan masih kosong.
-- Jangan jalankan pada database WordPress.
-- Cara: pilih database SUMENEP di panel kiri, buka tab SQL, tempel satu kelompok, klik Go.
-- Kelompok pertama berisi bagian 1 sampai 4 dan hanya membaca data server.
-- Kelompok kedua berisi bagian 5 dan membuat satu tabel uji sementara bernama zz_sumenep_probe.
-- Kelompok ketiga berisi bagian 6 dan menghapus tabel uji itu. Selalu jalankan setelah bagian 5.
-- Berkas ini tidak berisi password dan tidak menyentuh tabel aplikasi.

-- [MULAI SALIN BAGIAN 1 SAMPAI 4]

-- Bagian 1: versi server, binary log, izin trigger tanpa SUPER, batas koneksi, zona waktu, charset.
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

-- Bagian 2: hak akses user database ini.
-- Perhatian: hasil bagian 2 dapat memuat hash password setelah kata IDENTIFIED BY PASSWORD.
-- Hapus atau samarkan hash itu sebelum hasilnya dibagikan ke siapa pun.
SHOW GRANTS FOR CURRENT_USER();

-- Bagian 3: charset database harus utf8mb4 dan jumlah_tabel harus 0.
SELECT DEFAULT_CHARACTER_SET_NAME AS charset_db, DEFAULT_COLLATION_NAME AS collation_db,
       (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS jumlah_tabel
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();

-- Bagian 4: fitur yang dipakai migrasi SUMENEP.
-- Harapan: regex_peka_huruf bernilai 0, json bernilai ARRAY, selisih_utc_detik bernilai 0.
-- Perintah SET dan SELECT di bawah ini harus dijalankan dalam satu kali klik Go.
SET time_zone = '+00:00';
SELECT 'Ab' REGEXP '(?-i)^[a-z]+$'               AS regex_peka_huruf,
       JSON_TYPE('[]')                             AS json,
       @@session.time_zone                         AS zona_sesi,
       TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS selisih_utc_detik;

-- [MULAI SALIN BAGIAN 5]

-- Bagian 5: uji izin membuat trigger, memakai tabel uji sementara.
-- Bila CREATE TRIGGER ditolak dengan error 1419 atau 1142, trigger tidak diizinkan.
-- Catat pesan errornya, lalu langsung jalankan bagian 6.
-- Bila CREATE TABLE ditolak dengan error 1050 karena tabel sudah ada, jalankan bagian 6 dulu, lalu ulangi bagian 5.
-- Harapan bila trigger diizinkan: hasil terakhir menampilkan catatan bernilai trigger-jalan.
CREATE TABLE zz_sumenep_probe (id INT PRIMARY KEY, catatan VARCHAR(20)) ENGINE=InnoDB;
CREATE TRIGGER zz_sumenep_probe_tr BEFORE UPDATE ON zz_sumenep_probe FOR EACH ROW SET NEW.catatan = 'trigger-jalan';
INSERT INTO zz_sumenep_probe VALUES (1, 'awal');
UPDATE zz_sumenep_probe SET catatan = 'diubah' WHERE id = 1;
SELECT catatan FROM zz_sumenep_probe WHERE id = 1;

-- [MULAI SALIN BAGIAN 6]

-- Bagian 6: bersihkan objek uji. Selalu jalankan setelah bagian 5, berhasil maupun gagal.
-- DROP TABLE ikut menghapus trigger milik tabel uji, jadi tidak ada DROP TRIGGER terpisah.
-- DROP TRIGGER terpisah ditolak MariaDB dengan error 1419 bila trigger tidak diizinkan,
-- dan phpMyAdmin lalu berhenti sehingga tabel uji tidak terhapus.
-- Harapan: jumlah_tabel_setelah_bersih dan jumlah_trigger_setelah_bersih bernilai 0.
DROP TABLE IF EXISTS zz_sumenep_probe;
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS jumlah_tabel_setelah_bersih,
  (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()) AS jumlah_trigger_setelah_bersih;
