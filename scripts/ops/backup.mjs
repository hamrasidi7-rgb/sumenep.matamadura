// SUMENEP · Backup database MariaDB + folder media, dengan manifest SHA-256.
//
//   node scripts/ops/backup.mjs --env-file <file> --out <folder> [--media-root <folder>] [--label <teks>]
//
// - Database: mariadb-dump/mysqldump --single-transaction (salinan konsisten
//   InnoDB tanpa mengunci situs), digzip. Kredensial dari DIRECT_URL (atau
//   DATABASE_URL) di --env-file; password hanya masuk ke berkas opsi sementara
//   (izin 0600) yang dihapus lagi — tidak pernah ke argumen proses atau log.
// - Media: tar.gz isi --media-root, plus daftar setiap berkas dengan SHA-256.
// - Manifest JSON: waktu, nama database (tanpa user/password), ukuran dan
//   SHA-256 setiap berkas backup, jumlah baris per tabel, daftar berkas media.
// - Hanya MENULIS berkas baru di --out. Tidak pernah menghapus backup lama.
//
// Tanpa dependensi npm: cukup Node.js + mariadb-dump/mysqldump + mariadb/mysql +
// tar di PATH (atau di folder $MARIADB_BIN). Bisa dijalankan lewat SSH di
// Hostinger atau dari komputer operator (Remote MySQL; media tidak terjangkau).
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";
import zlib from "node:zlib";

export function fail(message, code = 1) {
  console.error(`Gagal: ${message}`);
  process.exit(code);
}

/** mariadb/mysql tool: $MARIADB_BIN/<name>, else the first of `names` on PATH. */
export function tool(...names) {
  const exe = (n) => (process.platform === "win32" ? `${n}.exe` : n);
  for (const name of names) {
    if (process.env.MARIADB_BIN && fs.existsSync(path.join(process.env.MARIADB_BIN, exe(name)))) return path.join(process.env.MARIADB_BIN, exe(name));
    const probe = spawnSync(process.platform === "win32" ? "where" : "sh", process.platform === "win32" ? [name] : ["-c", `command -v ${name}`], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim().split(/\r?\n/)[0];
  }
  fail(`alat ${names.join("/")} tidak ditemukan (isi MARIADB_BIN atau PATH)`);
}

/** Connection settings from DIRECT_URL / DATABASE_URL in an env file. */
export function connection(envFile) {
  if (!envFile || !fs.existsSync(envFile)) fail(`--env-file tidak ditemukan: ${envFile ?? "(kosong)"}`);
  const env = parseEnv(fs.readFileSync(envFile, "utf8"));
  const raw = env.DIRECT_URL || env.DATABASE_URL;
  if (!raw) fail("DIRECT_URL / DATABASE_URL tidak ada di --env-file");
  const url = new URL(raw);
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") fail("connection string harus mysql://");
  const ssl = ["1", "true", "require", "required", "verify-full", "verify_identity"].includes((url.searchParams.get("ssl") ?? "").toLowerCase());
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl,
  };
}

/** Temporary [client] option file (0600) so the password never shows in the process list. */
export function withOptionFile(conn, work) {
  const file = path.join(os.tmpdir(), `sumenep-db-${randomBytes(6).toString("hex")}.cnf`);
  const quote = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const lines = ["[client]", `host=${conn.host}`, `port=${conn.port}`, `user=${quote(conn.user)}`, `password=${quote(conn.password)}`, "protocol=TCP", "default-character-set=utf8mb4"];
  if (conn.ssl) lines.push("ssl", "ssl-verify-server-cert");
  fs.writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600 });
  const cleanup = () => fs.rmSync(file, { force: true });
  try {
    const result = work(file);
    if (result && typeof result.then === "function") return result.finally(cleanup);
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** One SQL statement through the mariadb/mysql client; rows as arrays of strings. */
export function query(cnf, database, sql) {
  const result = spawnSync(tool("mariadb", "mysql"), [`--defaults-extra-file=${cnf}`, "--batch", "--skip-column-names", database, "-e", sql], { encoding: "utf8" });
  if (result.status !== 0) fail(`query gagal: ${(result.stderr || "").trim().split("\n").pop()}`);
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));
}

export function tableCounts(cnf, database) {
  const tables = query(cnf, database, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1").map((r) => r[0]);
  if (!tables.length) return {};
  const sql = tables.map((t) => `SELECT '${t}', COUNT(*) FROM \`${t}\``).join(" UNION ALL ");
  return Object.fromEntries(query(cnf, database, sql).map(([t, n]) => [t, Number(n)]));
}

export const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

async function main() {
  const { values } = parseArgs({
    options: { "env-file": { type: "string" }, out: { type: "string" }, "media-root": { type: "string" }, label: { type: "string", default: "" } },
  });
  if (!values.out) fail("--out wajib diisi (folder backup, di luar public_html dan folder aplikasi)");
  const conn = connection(values["env-file"]);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const out = path.resolve(values.out);
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const prefix = path.join(out, `sumenep-${stamp}`);
  const manifest = {
    format: "sumenep-backup/1",
    createdAt: new Date().toISOString(),
    label: values.label,
    database: { host: conn.host, name: conn.database },
    files: {},
    tables: {},
    media: null,
  };

  await withOptionFile(conn, async (cnf) => {
    // ── Database ──
    const dumpFile = `${prefix}-db.sql.gz`;
    const dump = tool("mariadb-dump", "mysqldump");
    console.log(`▶ Backup database ${conn.database} (${conn.host}) → ${path.basename(dumpFile)}`);
    await new Promise((resolve, reject) => {
      const child = spawn(
        dump,
        [`--defaults-extra-file=${cnf}`, "--single-transaction", "--quick", "--triggers", "--hex-blob", "--no-tablespaces", "--skip-dump-date", conn.database],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      let exitCode = null;
      let written = false;
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const gzip = zlib.createGzip({ level: 9 });
      const file = fs.createWriteStream(dumpFile, { mode: 0o600 });
      child.stdout.pipe(gzip).pipe(file);
      // Done when the dump has exited AND the .gz is fully written.
      const settle = () => {
        if (exitCode === null || !written) return;
        if (exitCode === 0) return resolve();
        fs.rmSync(dumpFile, { force: true }); // never leave a half dump that looks like a backup
        reject(new Error(stderr.trim() || `dump exit ${exitCode}`));
      };
      child.on("exit", (code) => {
        exitCode = code ?? 1;
        settle();
      });
      file.on("finish", () => {
        written = true;
        settle();
      });
      child.on("error", reject);
      file.on("error", reject);
    });
    manifest.files.database = { name: path.basename(dumpFile), bytes: fs.statSync(dumpFile).size, sha256: sha256File(dumpFile) };
    manifest.tables = tableCounts(cnf, conn.database);
    console.log(`  ${Object.keys(manifest.tables).length} tabel, ${Object.values(manifest.tables).reduce((a, b) => a + b, 0)} baris, ${manifest.files.database.bytes} byte`);
  });

  // ── Media ──
  if (values["media-root"]) {
    const root = path.resolve(values["media-root"]);
    if (!fs.existsSync(root)) fail(`--media-root tidak ada: ${root}`);
    const files = walk(root);
    const archive = `${prefix}-media.tar.gz`;
    console.log(`▶ Backup media ${root} (${files.length} berkas) → ${path.basename(archive)}`);
    // Archive named relative to its folder: GNU tar reads "C:\…" as a remote host.
    const tar = spawnSync("tar", ["-czf", path.basename(archive), "-C", root, "."], { cwd: path.dirname(archive), encoding: "utf8" });
    if (tar.status !== 0) fail(`tar gagal: ${tar.stderr}`);
    fs.chmodSync(archive, 0o600);
    manifest.files.media = { name: path.basename(archive), bytes: fs.statSync(archive).size, sha256: sha256File(archive) };
    manifest.media = {
      root,
      count: files.length,
      bytes: files.reduce((sum, f) => sum + fs.statSync(path.join(root, ...f.split("/"))).size, 0),
      files: Object.fromEntries(files.map((f) => [f, sha256File(path.join(root, ...f.split("/")))])),
    };
  }

  const manifestFile = `${prefix}-manifest.json`;
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`✓ Backup selesai: ${manifestFile}`);
  for (const [kind, f] of Object.entries(manifest.files)) console.log(`  ${kind}: ${f.name}  ${f.bytes} byte  sha256 ${f.sha256}`);
}

const isMain = process.argv[1] && /backup\.mjs$/.test(process.argv[1]);
if (isMain) main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
