// SUMENEP · Pemulihan dari backup scripts/ops/backup.mjs — TIDAK PERNAH menimpa.
//
//   node scripts/ops/restore.mjs --manifest <file> --env-file <file> --db
//   node scripts/ops/restore.mjs --manifest <file> --media-target <folder-baru>
//
// - Database: dipulihkan HANYA ke database yang masih kosong (buat database
//   baru di hPanel, isi DIRECT_URL-nya di --env-file). Database berisi tabel
//   ditolak (exit 2). Sesudahnya jumlah baris per tabel dibandingkan dengan
//   manifest. Lalu arahkan DATABASE_URL ke database baru itu bila sudah benar.
// - Media: diekstrak HANYA ke folder yang belum ada atau kosong; setiap berkas
//   dicocokkan SHA-256-nya dengan manifest. Lalu arahkan MEDIA_ROOT ke sana.
// - SHA-256 berkas backup diperiksa lebih dulu; berkas rusak ditolak.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import zlib from "node:zlib";

import { connection, fail, query, sha256File, tableCounts, tool, walk, withOptionFile } from "./backup.mjs";

function refuse(message) {
  console.error(`Ditolak: ${message}`);
  process.exit(2);
}

async function restoreDatabase(manifest, dir, envFile) {
  const conn = connection(envFile);
  const dump = path.join(dir, manifest.files.database.name);
  if (sha256File(dump) !== manifest.files.database.sha256) fail("SHA-256 berkas database tidak cocok dengan manifest (rusak/berubah)");
  await withOptionFile(conn, async (cnf) => {
    const existing = query(cnf, conn.database, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")[0][0];
    if (Number(existing) > 0) refuse(`database ${conn.database} tidak kosong (${existing} tabel). Pulihkan ke database baru yang kosong.`);
    console.log(`▶ Memulihkan ${manifest.files.database.name} → database kosong ${conn.database} (${conn.host})`);
    await new Promise((resolve, reject) => {
      const child = spawn(tool("mariadb", "mysql"), [`--defaults-extra-file=${cnf}`, conn.database], { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `mariadb exit ${code}`))));
      fs.createReadStream(dump).pipe(zlib.createGunzip()).pipe(child.stdin);
    });
    const counts = tableCounts(cnf, conn.database);
    const mismatch = Object.entries(manifest.tables).filter(([t, n]) => counts[t] !== n);
    if (mismatch.length) fail(`jumlah baris berbeda: ${mismatch.map(([t, n]) => `${t} ${counts[t]}≠${n}`).join(", ")}`);
    console.log(`✓ Database pulih: ${Object.keys(counts).length} tabel, jumlah baris sama dengan manifest.`);
  });
}

function restoreMedia(manifest, dir, target) {
  if (!manifest.files.media) fail("manifest ini tidak berisi backup media");
  const archive = path.join(dir, manifest.files.media.name);
  if (sha256File(archive) !== manifest.files.media.sha256) fail("SHA-256 arsip media tidak cocok dengan manifest (rusak/berubah)");
  const root = path.resolve(target);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) refuse(`folder ${root} tidak kosong. Pulihkan ke folder baru.`);
  fs.mkdirSync(root, { recursive: true, mode: 0o750 });
  console.log(`▶ Memulihkan ${manifest.files.media.name} → ${root}`);
  const tar = spawnSync("tar", ["-xzf", path.basename(archive), "-C", root], { cwd: path.dirname(archive), encoding: "utf8" });
  if (tar.status !== 0) fail(`tar gagal: ${tar.stderr}`);
  const files = walk(root);
  const bad = Object.entries(manifest.media.files).filter(([f, hash]) => !files.includes(f) || sha256File(path.join(root, ...f.split("/"))) !== hash);
  if (bad.length || files.length !== manifest.media.count) fail(`berkas media tidak cocok: ${bad.slice(0, 5).map(([f]) => f).join(", ")} (${files.length}/${manifest.media.count})`);
  console.log(`✓ Media pulih: ${files.length} berkas, SHA-256 semuanya cocok.`);
}

async function main() {
  const { values } = parseArgs({
    options: { manifest: { type: "string" }, "env-file": { type: "string" }, db: { type: "boolean", default: false }, "media-target": { type: "string" } },
  });
  if (!values.manifest || !fs.existsSync(values.manifest)) fail("--manifest wajib (berkas *-manifest.json)");
  if (!values.db && !values["media-target"]) fail("pilih --db dan/atau --media-target <folder-baru>");
  const manifest = JSON.parse(fs.readFileSync(values.manifest, "utf8"));
  if (manifest.format !== "sumenep-backup/1") fail("format manifest tidak dikenal");
  const dir = path.dirname(path.resolve(values.manifest));
  if (values.db) await restoreDatabase(manifest, dir, values["env-file"]);
  if (values["media-target"]) restoreMedia(manifest, dir, values["media-target"]);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
