// SUMENEP · Pemeriksaan Hostinger otomatis (Tahap D) — tanpa phpMyAdmin, tanpa salin-tempel.
//
//   node scripts/ops/hostinger-remote-check.mjs --env-file .env.hostinger-db.local [--trigger-test] [--backup-test]
//
// Jalur koneksi (aman, terenkripsi): SSH ke akun hosting yang sudah ada dengan
// kunci khusus SUMENEP (~/.ssh/sumenep_hostinger_ed25519), host key dipatok di
// deploy/hostinger_known_hosts, tanpa ~/.ssh/config; lalu tunnel lokal
// 127.0.0.1:<port acak> → MariaDB di server. Password database dibaca dari
// --env-file (git-ignored) dan TIDAK pernah dicetak; hash password di hasil
// SHOW GRANTS disamarkan otomatis.
//
// Sebelum koneksi apa pun, berkas akses diperiksa: user SSH dan nama
// database/user harus milik akun hosting yang sama (awalan u…_), domain harus
// subdomain SUMENEP, dan --no-ssh hanya boleh ke 127.0.0.1 (uji lokal).
//
// Yang dijalankan (isi prisma/sql/hostinger-probe-clean.sql, otomatis):
//   bagian 1–4  hanya membaca: versi, binary log, batas koneksi, hak akses,
//               charset, zona waktu, fitur yang dipakai migrasi
//   --trigger-test  bagian 5–6: tabel uji zz_sumenep_probe + trigger, lalu
//               DIHAPUS lagi (selalu, juga bila gagal). Hanya bila database
//               yang terhubung = HOSTINGER_DB_NAME dan KOSONG.
//   --backup-test   mariadb-dump database itu lewat tunnel ke folder lokal
//               sementara (membuktikan jalur backup; tidak menulis ke server).
//               Hanya bila database tidak berisi tabel selain milik SUMENEP.
//   cek server  scripts/ops/hostinger-check.sh lewat SSH: hanya MENULIS di
//               ~/sumenep-data/{media,backups} (uji tulis, penanda persistensi),
//               hanya MEMBACA folder Web App SUMENEP, alat, dan kapasitas disk
//
// Tidak menjalankan migrasi atau deployment, tidak mengubah tabel aplikasi, tidak
// menyentuh WordPress, DNS, atau Environment variables Web App.
//
// Isi --env-file: lihat deploy/hostinger-db.env.template.
//
// Uji lokal (tanpa SSH, ke MariaDB lokal): --no-ssh --db-host 127.0.0.1 --db-port 33069
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import mariadb from "mariadb";

import {
  DEFAULT_IDENTITY,
  DEFAULT_KNOWN_HOSTS,
  accessProblems,
  databaseUrl,
  isLoopback,
  loadAccess,
  openTunnel,
  redact,
  root,
  sshArgs,
  sshFailure,
} from "./hostinger-ssh.mjs";

const { values } = parseArgs({
  options: {
    "env-file": { type: "string", default: ".env.hostinger-db.local" },
    "trigger-test": { type: "boolean", default: false },
    "backup-test": { type: "boolean", default: false },
    "no-ssh": { type: "boolean", default: false },
    "db-host": { type: "string" },
    "db-port": { type: "string" },
    "known-hosts": { type: "string", default: DEFAULT_KNOWN_HOSTS },
    identity: { type: "string", default: DEFAULT_IDENTITY },
  },
});

const results = [];
const add = (status, label, detail) => results.push({ status, label, detail });
const TAG = { LULUS: "[LULUS]   ", GAGAL: "[GAGAL]   ", BELUM: "[BELUM]   ", INFO: "[INFO]    ", PERINGATAN: "[PERHATIAN]" };
const DEFAULT_DOMAIN = "sumenep.matamaduranews.com";

function loadEnv() {
  let env;
  try {
    env = loadAccess(values["env-file"]);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const problems = accessProblems(env);
  if (!values["no-ssh"] && !env.HOSTINGER_SSH) problems.push("HOSTINGER_SSH kosong di berkas akses");
  if (values["no-ssh"] && !env.dbReady) problems.push("HOSTINGER_DB_NAME/USER/PASSWORD belum lengkap di berkas akses");
  if (values["no-ssh"] && !isLoopback(values["db-host"] || "127.0.0.1")) {
    problems.push("--no-ssh hanya untuk uji lokal (--db-host 127.0.0.1); koneksi ke server selalu lewat SSH");
  }
  if (problems.length) {
    console.error(`Dihentikan sebelum koneksi apa pun:\n- ${problems.join("\n- ")}`);
    process.exit(2);
  }
  return env;
}

const sshOptions = () => ({ knownHosts: values["known-hosts"], identity: values.identity });

function printPlan(env) {
  const missing = ["HOSTINGER_DB_NAME", "HOSTINGER_DB_USER", "HOSTINGER_DB_PASSWORD"].filter((k) => !env[k]);
  console.log("Pemeriksaan Hostinger SUMENEP — yang akan dipakai:");
  console.log(`  SSH        ${values["no-ssh"] ? "(tidak dipakai: uji lokal)" : `${env.HOSTINGER_SSH} port ${env.HOSTINGER_SSH_PORT || 65002}`}`);
  if (!values["no-ssh"]) {
    console.log(`  Kunci SSH  ${values.identity}`);
    console.log(`  Host key   ${values["known-hosts"]}`);
  }
  console.log(`  Database   ${env.HOSTINGER_DB_NAME || "(kosong)"} sebagai user ${env.HOSTINGER_DB_USER || "(kosong)"}; password ${env.HOSTINGER_DB_PASSWORD ? "terisi (tidak ditampilkan)" : "kosong"}`);
  if (missing.length) console.log(`             belum lengkap (${missing.join(", ")}): pemeriksaan database dilewati`);
  if (!values["no-ssh"]) console.log(`  Server     tulis hanya di ~/sumenep-data; baca folder Web App ~/domains/${env.HOSTINGER_DOMAIN || DEFAULT_DOMAIN}`);
  console.log("");
}

// Effective privileges on one database from SHOW GRANTS (global *.* plus database
// grants, whose names may use the % and _ wildcards with \ escapes) — the same
// rules as scripts/db/grants.ts.
const ALL_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "INDEX", "TRIGGER", "REFERENCES", "CREATE VIEW", "SHOW VIEW", "LOCK TABLES", "EVENT", "CREATE ROUTINE", "ALTER ROUTINE", "EXECUTE", "CREATE TEMPORARY TABLES", "DELETE HISTORY"];
function databaseMatches(pattern, database) {
  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) regex += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (ch === "%") regex += ".*";
    else if (ch === "_") regex += ".";
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${regex}$`, "i").test(database);
}
function privilegesOn(grants, database) {
  const result = new Set();
  for (const line of grants) {
    const m = /^GRANT (.+?) ON (\*|`(?:[^`]|``)+`)\.(\*|`(?:[^`]|``)+`) TO /.exec(line);
    if (!m || m[3] !== "*") continue; // table-level grants do not cover the whole database
    const scope = m[2] === "*" ? null : m[2].slice(1, -1).replace(/``/g, "`");
    if (scope !== null && !databaseMatches(scope, database)) continue;
    for (const raw of m[1].replace(/\([^)]*\)/g, "").split(",")) {
      const p = raw.trim().toUpperCase();
      if (p === "ALL PRIVILEGES" || p === "ALL") ALL_PRIVILEGES.forEach((x) => result.add(x));
      else result.add(p);
    }
  }
  return result;
}

/** Tables the SUMENEP migrations create, plus Prisma's history table and the probe table. */
function sumenepTables() {
  const names = new Set(["_prisma_migrations", "zz_sumenep_probe"]);
  const dir = path.join(root, "prisma", "migrations");
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name, "migration.sql");
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    for (const [, name] of fs.readFileSync(file, "utf8").matchAll(/CREATE TABLE `([A-Za-z0-9_]+)`/g)) names.add(name);
  }
  return names;
}

async function databaseChecks(conn, env) {
  const [s] = await conn.query(
    `SELECT VERSION() AS versi, @@version_comment AS distribusi, @@log_bin AS binary_log,
            @@log_bin_trust_function_creators AS trigger_tanpa_super, @@max_connections AS max_connections,
            @@max_user_connections AS max_user_connections, @@wait_timeout AS wait_timeout,
            @@max_allowed_packet AS max_allowed_packet, @@global.time_zone AS zona_server,
            @@system_time_zone AS zona_sistem, @@character_set_server AS charset_server,
            @@collation_server AS collation_server, @@default_storage_engine AS engine,
            DATABASE() AS db, CURRENT_USER() AS user_aktif`,
  );
  const [major, minor] = String(s.versi).split(/[.-]/).map(Number);
  const isMaria = /mariadb/i.test(String(s.versi));
  add(isMaria && (major > 10 || (major === 10 && minor >= 6)) ? "LULUS" : "PERINGATAN", "Versi MariaDB", `${s.versi} (${s.distribusi})`);
  add("INFO", "Binary log", `log_bin=${s.binary_log}, log_bin_trust_function_creators=${s.trigger_tanpa_super}`);
  const [tx] = await conn.query(
    `SELECT @@global.transaction_isolation AS iso, @@global.binlog_format AS binlog_format,
            (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME = 'INNODB_SNAPSHOT_ISOLATION') AS snapshot_global`,
  );
  await conn.query("SET time_zone = '+00:00' /*M!110602 , innodb_snapshot_isolation = OFF */"); // = SESSION_SETUP_SQL aplikasi (hanya sesi ini)
  const [txs] = await conn.query("SELECT (SELECT VARIABLE_VALUE FROM information_schema.SESSION_VARIABLES WHERE VARIABLE_NAME = 'INNODB_SNAPSHOT_ISOLATION') AS snapshot_session");
  add(
    tx.snapshot_global === null || txs.snapshot_session === "OFF" ? "LULUS" : "GAGAL",
    "Perilaku transaksi",
    `isolation ${tx.iso}, binlog_format ${tx.binlog_format}, innodb_snapshot_isolation global ${tx.snapshot_global ?? "(tidak ada)"}, sesi aplikasi ${txs.snapshot_session ?? "(tidak ada)"}`,
  );
  add(s.db === env.HOSTINGER_DB_NAME ? "LULUS" : "GAGAL", "Database terhubung", `${s.db} sebagai ${String(s.user_aktif).replace(/@.*/, "@<host>")}`);
  const userLimit = Number(s.max_user_connections);
  add(userLimit === 0 || userLimit >= 6 ? "LULUS" : "PERINGATAN", "Batas koneksi", `max_connections=${s.max_connections}, max_user_connections=${userLimit === 0 ? "0 (tanpa batas per user)" : userLimit}; aplikasi memakai pool 5`);
  add(Number(s.wait_timeout) >= 60 ? "LULUS" : "PERINGATAN", "wait_timeout", `${s.wait_timeout} detik`);
  add(Number(s.max_allowed_packet) >= 16 * 1024 * 1024 ? "LULUS" : "PERINGATAN", "max_allowed_packet", `${Math.round(Number(s.max_allowed_packet) / 1048576)} MB`);
  add("INFO", "Zona waktu server", `global ${s.zona_server}, sistem ${s.zona_sistem} (aplikasi selalu memakai UTC per koneksi)`);
  add(String(s.charset_server).startsWith("utf8mb4") ? "LULUS" : "PERINGATAN", "Charset server", `${s.charset_server} / ${s.collation_server}, engine ${s.engine}`);

  const grants = (await conn.query("SHOW GRANTS FOR CURRENT_USER()")).map((row) => redact(Object.values(row)[0]));
  console.log("\nSHOW GRANTS (hash password disamarkan):");
  for (const g of grants) console.log(`  ${g}`);
  const privileges = privilegesOn(grants, String(s.db));
  const needed = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "INDEX", "REFERENCES"];
  const missing = needed.filter((p) => !privileges.has(p));
  add(missing.length === 0 ? "LULUS" : "GAGAL", "Hak akses untuk migrasi", missing.length ? `kurang: ${missing.join(", ")}` : `${needed.join(", ")} tersedia pada ${s.db}`);
  add("INFO", "Hak TRIGGER / SUPER", `TRIGGER ${privileges.has("TRIGGER") ? "ada" : "tidak ada"}; SUPER ${privileges.has("SUPER") ? "ada" : "tidak ada"}`);
  const limits = grants.join(" ").match(/MAX_(?:USER_CONNECTIONS|CONNECTIONS_PER_HOUR|QUERIES_PER_HOUR|UPDATES_PER_HOUR)\s+\d+/gi);
  add("INFO", "Batas sumber daya akun", limits ? limits.join(", ") : "tidak ada di GRANT");

  const [d] = await conn.query(
    "SELECT DEFAULT_CHARACTER_SET_NAME AS charset_db, DEFAULT_COLLATION_NAME AS collation_db FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()",
  );
  const tables = (await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY 1")).map((r) => String(r.name));
  const own = sumenepTables();
  const foreign = tables.filter((t) => !own.has(t));
  const wordpress = tables.filter((t) => /^wp_|_(?:options|postmeta|usermeta)$/i.test(t));
  add(d.charset_db === "utf8mb4" ? "LULUS" : "PERINGATAN", "Charset database", `${d.charset_db} / ${d.collation_db} (tabel migrasi tetap utf8mb4_unicode_ci)`);
  add(wordpress.length === 0 ? "LULUS" : "GAGAL", "Bukan database WordPress", wordpress.length ? `${wordpress.length} tabel bergaya WordPress` : "tidak ada tabel WordPress");
  if (tables.length === 0) add("LULUS", "Database masih kosong", "0 tabel");
  else if (foreign.length) add("GAGAL", "Database masih kosong", `${tables.length} tabel, ${foreign.length} bukan milik SUMENEP (mis. ${foreign.slice(0, 3).join(", ")}); uji tulis dan backup dihentikan`);
  else add("PERINGATAN", "Database masih kosong", `${tables.length} tabel SUMENEP: ${tables.join(", ")}`);

  await conn.query("SET time_zone = '+00:00'");
  const [f] = await conn.query(
    `SELECT 'Ab' REGEXP '(?-i)^[a-z]+$' AS regex_peka_huruf, JSON_TYPE('[]') AS json, @@session.time_zone AS zona_sesi,
            TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS selisih_utc_detik`,
  );
  const featuresOk = Number(f.regex_peka_huruf) === 0 && f.json === "ARRAY" && Number(f.selisih_utc_detik) === 0;
  add(featuresOk ? "LULUS" : "GAGAL", "Fitur yang dipakai migrasi", `regex peka huruf ${f.regex_peka_huruf}, JSON_TYPE ${f.json}, sesi ${f.zona_sesi}, selisih UTC ${f.selisih_utc_detik}`);
  return { tables, foreign };
}

async function triggerTest(conn, env, state) {
  const leftoverOnly = state.tables.length === 1 && state.tables[0] === "zz_sumenep_probe";
  if (state.tables.length > 0 && !leftoverOnly) {
    add("BELUM", "Izin CREATE TRIGGER", "dilewati: database tidak kosong; uji hanya dijalankan pada database SUMENEP yang kosong");
    return;
  }
  const [{ db }] = await conn.query("SELECT DATABASE() AS db");
  if (db !== env.HOSTINGER_DB_NAME) {
    add("BELUM", "Izin CREATE TRIGGER", `dilewati: database aktif ${db} bukan ${env.HOSTINGER_DB_NAME}`);
    return;
  }
  if (!/sumenep/i.test(String(db))) {
    add("BELUM", "Izin CREATE TRIGGER", `dilewati: nama database ${db} tidak menunjukkan database SUMENEP`);
    return;
  }
  try {
    if (leftoverOnly) await conn.query("DROP TABLE IF EXISTS zz_sumenep_probe"); // sisa percobaan sebelumnya
    await conn.query("CREATE TABLE zz_sumenep_probe (id INT PRIMARY KEY, catatan VARCHAR(20)) ENGINE=InnoDB");
    try {
      await conn.query("CREATE TRIGGER zz_sumenep_probe_tr BEFORE UPDATE ON zz_sumenep_probe FOR EACH ROW SET NEW.catatan = 'trigger-jalan'");
      await conn.query("INSERT INTO zz_sumenep_probe VALUES (1, 'awal')");
      await conn.query("UPDATE zz_sumenep_probe SET catatan = 'diubah' WHERE id = 1");
      const [row] = await conn.query("SELECT catatan FROM zz_sumenep_probe WHERE id = 1");
      add(row.catatan === "trigger-jalan" ? "LULUS" : "GAGAL", "Izin CREATE TRIGGER", row.catatan === "trigger-jalan" ? "DIIZINKAN; trigger berjalan (lapisan trigger penjaga bisa dipasang dari server)" : `trigger dibuat tetapi tidak berjalan (${row.catatan})`);
    } catch (e) {
      if ([1419, 1142, 1227, 1044].includes(e.errno)) add("INFO", "Izin CREATE TRIGGER", `TIDAK diizinkan (error ${e.errno}); aturan ditegakkan guard aplikasi — sesuai desain`);
      else throw e;
    }
  } finally {
    await conn.query("DROP TABLE IF EXISTS zz_sumenep_probe"); // DROP TABLE ikut menghapus triggernya
    const [c] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS t,
              (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()) AS g`,
    );
    add(Number(c.t) === 0 && Number(c.g) === 0 ? "LULUS" : "GAGAL", "Pembersihan objek uji", `tabel ${c.t}, trigger ${c.g} setelah bersih`);
  }
}

/** mariadb-dump for the backup test: $MARIADB_BIN, else the MariaDB zip in .data/ (the dev database). */
function localMariadbBin() {
  if (process.env.MARIADB_BIN) return process.env.MARIADB_BIN;
  const data = path.join(root, ".data");
  if (!fs.existsSync(data)) return "";
  const dist = fs
    .readdirSync(data)
    .filter((d) => /^mariadb-\d+\.\d+\.\d+/.test(d) && fs.existsSync(path.join(data, d, "bin")))
    .sort()
    .pop();
  return dist ? path.join(data, dist, "bin") : "";
}

function backupTest(env, host, port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-hostinger-backup-"));
  const envFile = path.join(tmp, "db.env");
  const url = databaseUrl(env, host, port);
  fs.writeFileSync(envFile, `DIRECT_URL=${url}\n`, { mode: 0o600 });
  try {
    const run = spawnSync(process.execPath, [path.join(root, "scripts/ops/backup.mjs"), "--env-file", envFile, "--out", path.join(tmp, "out"), "--label", "uji-tahap-d"], {
      encoding: "utf8",
      env: { ...process.env, MARIADB_BIN: localMariadbBin() },
    });
    const ok = run.status === 0 && fs.existsSync(path.join(tmp, "out")) && fs.readdirSync(path.join(tmp, "out")).some((f) => f.endsWith("-manifest.json"));
    add(ok ? "LULUS" : "GAGAL", "Backup database lewat tunnel", ok ? "mariadb-dump --single-transaction berhasil, manifest SHA-256 dibuat (salinan uji lokal dihapus)" : redact((run.stderr || run.stdout || "").trim().split("\n").pop()));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function serverChecks(env) {
  const domain = env.HOSTINGER_DOMAIN || DEFAULT_DOMAIN; // format sudah diperiksa accessProblems()
  const script = fs.readFileSync(path.join(root, "scripts/ops/hostinger-check.sh"), "utf8");
  const run = spawnSync("ssh", [...sshArgs(env, sshOptions()), "-T", env.HOSTINGER_SSH, `sh -s -- '${domain}'`], { input: script, encoding: "utf8", timeout: 120_000 });
  if (run.status !== 0) {
    add("BELUM", "Cek server lewat SSH", `${sshFailure(run.stderr, run.status)}${run.stdout ? ` | ${run.stdout.trim().split("\n").pop()}` : ""}`);
    return;
  }
  const out = run.stdout;
  console.log("\n── Keluaran hostinger-check.sh ──\n" + out.trim());
  const writable = /OK: user .* bisa menulis/.test(out);
  add(writable ? "LULUS" : "GAGAL", "Folder media ~/sumenep-data/media", writable ? "ada, di luar hbuilds/ dan public_html, bisa ditulis dan dibaca" : "tidak bisa ditulis");
  add(/OK: folder backup siap/.test(out) ? "LULUS" : "GAGAL", "Folder backup ~/sumenep-data/backups", /OK: folder backup siap/.test(out) ? "ada, izin 750, bisa ditulis" : "tidak siap");
  const marker = /penanda SUDAH ADA/.test(out) ? "penanda lama ditemukan" : /penanda DIBUAT/.test(out) ? "penanda dibuat; dibuktikan setelah redeploy berikutnya" : "tidak diketahui";
  add(/SUDAH ADA/.test(out) && /build aktif sekarang/.test(out) ? "INFO" : "BELUM", "Persistensi media setelah redeploy", marker);
  const tool = (name) => (out.match(new RegExp(`^${name}: (.*)$`, "m")) ?? [])[1] ?? "?";
  add(/tidak ada/.test(tool("mysqldump")) && /tidak ada/.test(tool("mariadb-dump")) ? "PERINGATAN" : "LULUS", "Alat backup di server", `mariadb-dump: ${tool("mariadb-dump")}; mysqldump: ${tool("mysqldump")}; tar: ${tool("tar")}`);
  add("INFO", "Node.js di SSH", `node: ${tool("node")}`);
  const disk = out.split("== Kapasitas disk")[1]?.split("==")[0]?.trim().split("\n").slice(-2).join(" | ") ?? "?";
  add("INFO", "Kapasitas disk", disk.replace(/\s+/g, " "));
}

async function main() {
  const env = loadEnv();
  printPlan(env);
  let tunnel = null;
  let host = values["db-host"] || "127.0.0.1";
  let port = Number(values["db-port"] || 3306);
  if (!values["no-ssh"]) {
    try {
      tunnel = await openTunnel(env, sshOptions());
      host = "127.0.0.1";
      port = tunnel.port;
      add("LULUS", "SSH + tunnel MariaDB", `${env.HOSTINGER_SSH}:${env.HOSTINGER_SSH_PORT || 65002} → 127.0.0.1:${port}`);
    } catch (e) {
      const local = /kunci SSH tidak ada|known_hosts tidak ada/.test(e.message);
      add(local ? "BELUM" : "GAGAL", "SSH + tunnel MariaDB", e.message);
    }
  }
  try {
    if (!values["no-ssh"] && !tunnel) {
      // Stop rule: no other route is tried without the owner's approval.
      add("BELUM", "Pemeriksaan database dan server", "dihentikan karena SSH/tunnel gagal; tidak ada metode lain yang dicoba");
    } else if (!env.dbReady) {
      const empty = ["HOSTINGER_DB_NAME", "HOSTINGER_DB_USER", "HOSTINGER_DB_PASSWORD"].filter((k) => !env[k]).join(", ");
      for (const label of ["Login MariaDB", "Versi, binary log, batas koneksi, charset, hak akses", "Izin CREATE TRIGGER", "Backup database lewat tunnel"]) {
        add("BELUM", label, `${empty} belum diisi di ${values["env-file"]}`);
      }
    } else if (values["no-ssh"] || tunnel) {
      const conn = await mariadb.createConnection({
        host,
        port,
        user: env.HOSTINGER_DB_USER,
        password: env.HOSTINGER_DB_PASSWORD,
        database: env.HOSTINGER_DB_NAME,
        connectTimeout: 15_000,
        bigIntAsNumber: true,
      }).catch((e) => {
        const refused = tunnel && /administratively prohibited/i.test(tunnel.stderr());
        add(
          "GAGAL",
          "Login MariaDB",
          refused ? "server menolak SSH port forwarding ke MariaDB; database belum bisa diperiksa lewat tunnel" : `${e.errno ?? ""} ${redact(e.sqlMessage ?? e.message)}`.trim(),
        );
        return null;
      });
      if (conn) {
        let state = null;
        try {
          state = await databaseChecks(conn, env);
          if (values["trigger-test"]) await triggerTest(conn, env, state);
          else add("BELUM", "Izin CREATE TRIGGER", "jalankan dengan --trigger-test");
        } finally {
          await conn.end().catch(() => {});
        }
        if (values["backup-test"]) {
          if (state && state.foreign.length === 0) backupTest(env, host, port);
          else add("BELUM", "Backup database lewat tunnel", "dilewati: database berisi tabel yang bukan milik SUMENEP");
        }
      }
    }
    if (!values["no-ssh"] && tunnel) serverChecks(env);
  } finally {
    tunnel?.close();
  }
  console.log("\n══ Ringkasan pemeriksaan Hostinger ══");
  const width = Math.max(...results.map((r) => r.label.length));
  for (const r of results) console.log(`${TAG[r.status]} ${r.label.padEnd(width)}  ${r.detail}`);
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nLulus ${count("LULUS")}, gagal ${count("GAGAL")}, belum ${count("BELUM")}, perhatian ${count("PERINGATAN")}, info ${count("INFO")}.`);
  process.exitCode = count("GAGAL") ? 1 : 0;
}

main().catch((e) => {
  console.error(`Gagal: ${redact(e.message)}`);
  process.exitCode = 1;
});
