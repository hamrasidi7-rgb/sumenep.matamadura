// Backup → restore round trip on the local MariaDB (Tahap D), with real CMS data:
//
//   npm run test:backup
//
//   1. creates sumenep_cms_test_bk_src_<random>: migrations, seed, Admin (test
//      password), articles (draft + published, so slug/status history and
//      revisions exist), two uploaded photos in a temporary MEDIA_ROOT
//   2. backs it up with scripts/ops/backup.mjs (db + media + manifest)
//   3. restores into a NEW empty database and a NEW media folder with
//      scripts/ops/restore.mjs
//   4. proves the copy is identical: CHECKSUM TABLE of every table, the same
//      CHECK constraints and foreign keys, every media file's SHA-256, and the
//      Admin password still verifies against the restored hash
//   5. proves restore never overwrites: a non-empty database, a non-empty media
//      folder and a damaged backup file are all refused
//   6. drops both databases and removes the temporary folders
//
// Only local *_test databases are touched (same guard as test:db).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

import { runBin } from "../lib/bin";
import { ident, withConnection } from "../lib/mariadb";

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function mariadbBin(): string | undefined {
  if (process.env.MARIADB_BIN) return process.env.MARIADB_BIN;
  const data = path.resolve(".data");
  const dist = fs.existsSync(data) ? fs.readdirSync(data).filter((d) => /^mariadb-\d/.test(d) && fs.existsSync(path.join(data, d, "bin"))).sort().pop() : undefined;
  return dist ? path.join(data, dist, "bin") : undefined;
}

function node(args: string[], env: NodeJS.ProcessEnv): { status: number; out: string } {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  const out = `${result.stdout}${result.stderr}`;
  process.stdout.write(out.replace(/^/gm, "    "));
  return { status: result.status ?? 1, out };
}

async function main(): Promise<void> {
  const base = parseEnv(fs.readFileSync(path.resolve(".env.test"), "utf8"));
  const owner = new URL(base.DIRECT_URL ?? "mysql://missing/none");
  if (owner.protocol !== "mysql:" || !["127.0.0.1", "localhost"].includes(owner.hostname) || !owner.pathname.endsWith("_test")) {
    fail("DIRECT_URL di .env.test bukan database MariaDB test lokal. Dibatalkan.");
  }
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const src = `sumenep_cms_test_bk_src_${suffix}`;
  const dst = `sumenep_cms_test_bk_dst_${suffix}`;
  const urlFor = (db: string) => {
    const u = new URL(base.DIRECT_URL!);
    u.pathname = `/${db}`;
    return u.toString();
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-backup-test-"));
  const mediaRoot = path.join(tmp, "media-asli");
  const restoredMedia = path.join(tmp, "media-pulih");
  const out = path.join(tmp, "backups");
  const envFile = (db: string) => {
    const file = path.join(tmp, `${db}.env`);
    fs.writeFileSync(file, `DIRECT_URL=${urlFor(db)}\n`, { mode: 0o600 });
    return file;
  };
  const env = { ...process.env, MARIADB_BIN: mariadbBin() ?? "" };
  const asOwner = (sql: string) => withConnection(base.DIRECT_URL!, (conn) => conn.query(sql), { database: false });
  const created: string[] = [];

  try {
    for (const db of [src, dst]) {
      await asOwner(`CREATE DATABASE ${ident(db)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      created.push(db);
    }
    console.log(`▶ Database sumber ${src}: migrasi + data CMS nyata`);
    if (runBin("prisma", ["migrate", "deploy"], { env: { ...process.env, DIRECT_URL: urlFor(src) } }) !== 0) fail("migrate deploy gagal");

    process.env.MEDIA_ROOT = mediaRoot;
    process.env.MEDIA_DRIVER = "local";
    const { createPrismaClient } = await import("../../src/server/db/client");
    const { seedInitialData } = await import("../../src/server/seed");
    const { bootstrapAdmin } = await import("../../src/server/admin/bootstrap");
    const { createArticle, publishArticle, saveArticle } = await import("../../src/server/articles/service");
    const { uploadImage } = await import("../../src/server/media/service");
    const { verifyPassword } = await import("../../src/server/auth/password");
    const sharp = (await import("sharp")).default;
    const password = `uji ${Math.random().toString(36).slice(2)} cadangan pulih`;

    const db = createPrismaClient(urlFor(src), { max: 2 });
    try {
      await seedInitialData(db);
      await bootstrapAdmin(db, { email: "admin@sumenep.test", name: "Admin Uji", password });
      const actor = { adminId: 1, ip: "203.0.113.1", userAgent: "uji-backup" };
      const photo = (r: number) => sharp({ create: { width: 900, height: 600, channels: 3, background: { r, g: 90, b: 140 } } }).jpeg().toBuffer();
      const hero = await uploadImage(db, { name: "laut.jpg", bytes: await photo(20) }, { alt: "Laut" }, actor);
      await uploadImage(db, { name: "garam.jpg", bytes: await photo(200) }, { alt: "Garam" }, actor);
      const [author, kanal] = await Promise.all([
        db.author.findUniqueOrThrow({ where: { slug: "redaksi" } }),
        db.section.findUniqueOrThrow({ where: { kind_slug: { kind: "KANAL", slug: "ekonomi" } } }),
      ]);
      const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi artikel uji cadangan." }] }] };
      const input = { title: "Garam Kalianget", standfirst: "Lead.", authorId: author.id, kanalId: kanal.id, heroMediaId: hero.media.id, body, tags: ["garam", "kalianget"] };
      const a = await createArticle(db, input, actor);
      if (!a.ok) fail(a.error);
      const pub = await publishArticle(db, a.id, a.version, input, null, actor);
      if (!pub.ok) fail(pub.error);
      const renamed = await saveArticle(db, a.id, pub.version, { ...input, slug: "garam-kalianget-2026" }, actor, "manual");
      if (!renamed.ok) fail(renamed.error);
      const draft = await createArticle(db, { ...input, title: "Draf Uji", tags: [] }, actor);
      if (!draft.ok) fail(draft.error);
    } finally {
      await db.$disconnect();
    }

    console.log("\n▶ Backup (scripts/ops/backup.mjs)");
    const backup = node(["scripts/ops/backup.mjs", "--env-file", envFile(src), "--out", out, "--media-root", mediaRoot, "--label", "uji"], env);
    if (backup.status !== 0) fail("backup gagal");
    const manifestFile = fs.readdirSync(out).find((f) => f.endsWith("-manifest.json"));
    if (!manifestFile) fail("manifest tidak dibuat");
    const manifestPath = path.join(out, manifestFile);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const manifestText = JSON.stringify(manifest);
    if (manifestText.includes(owner.password) || manifestText.includes(decodeURIComponent(owner.password))) fail("password database bocor ke manifest");

    console.log("\n▶ Restore ke database BARU dan folder media BARU (scripts/ops/restore.mjs)");
    if (node(["scripts/ops/restore.mjs", "--manifest", manifestPath, "--env-file", envFile(dst), "--db", "--media-target", restoredMedia], env).status !== 0) fail("restore gagal");

    console.log("\n▶ Bukti salinan identik");
    const tables = Object.keys(manifest.tables) as string[];
    const checksum = (database: string) =>
      withConnection(urlFor(database), async (conn) => {
        const rows = (await conn.query(`CHECKSUM TABLE ${tables.map(ident).join(", ")}`)) as Array<{ Table: string; Checksum: number }>;
        return Object.fromEntries(rows.map((r) => [r.Table.split(".").pop(), String(r.Checksum)]));
      });
    const [a, b] = await Promise.all([checksum(src), checksum(dst)]);
    const different = tables.filter((t) => a[t] !== b[t]);
    if (different.length) fail(`CHECKSUM berbeda: ${different.join(", ")}`);
    console.log(`  ✓ CHECKSUM TABLE identik untuk ${tables.length} tabel (${Object.values(manifest.tables as Record<string, number>).reduce((x, y) => x + y, 0)} baris)`);
    const structure = (database: string) =>
      withConnection(urlFor(database), async (conn) => {
        const [row] = (await conn.query(
          `SELECT (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()) AS checks,
                  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()) AS fks`,
        )) as Array<{ checks: number; fks: number }>;
        return `${row.checks}/${row.fks}`;
      });
    const [sa, sb] = await Promise.all([structure(src), structure(dst)]);
    if (sa !== sb) fail(`struktur berbeda: CHECK/FK ${sa} vs ${sb}`);
    console.log(`  ✓ CHECK constraint / foreign key sama: ${sb}`);
    const restoredDb = createPrismaClient(urlFor(dst), { max: 1 });
    try {
      const admin = await restoredDb.adminUser.findUniqueOrThrow({ where: { id: 1 } });
      if (!(await verifyPassword(password, admin.passwordHash))) fail("password Admin tidak cocok di database pulihan");
      const history = await restoredDb.articleSlugHistory.count();
      const statuses = await restoredDb.articleStatusChange.count();
      console.log(`  ✓ Admin pulih dan password-nya tetap berlaku; riwayat slug ${history}, riwayat status ${statuses}`);
    } finally {
      await restoredDb.$disconnect();
    }
    console.log(`  ✓ ${manifest.media.count} berkas media pulih dengan SHA-256 sama (diperiksa restore.mjs)`);

    console.log("\n▶ Restore tidak pernah menimpa");
    if (node(["scripts/ops/restore.mjs", "--manifest", manifestPath, "--env-file", envFile(dst), "--db"], env).status !== 2) fail("database tidak kosong seharusnya ditolak");
    if (node(["scripts/ops/restore.mjs", "--manifest", manifestPath, "--media-target", restoredMedia], env).status !== 2) fail("folder media tidak kosong seharusnya ditolak");
    const damaged = path.join(out, "rusak-manifest.json");
    fs.writeFileSync(damaged, JSON.stringify({ ...manifest, files: { ...manifest.files, media: { ...manifest.files.media, sha256: "0".repeat(64) } } }));
    if (node(["scripts/ops/restore.mjs", "--manifest", damaged, "--media-target", path.join(tmp, "media-lain")], env).status === 0) fail("arsip rusak seharusnya ditolak");
    console.log("  ✓ database berisi, folder berisi, dan berkas rusak semuanya ditolak");
    console.log("\n✓ Uji backup–restore lulus");
  } finally {
    for (const db of created) await asOwner(`DROP DATABASE IF EXISTS ${ident(db)}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`▶ Database uji dan folder sementara dihapus (${created.join(", ")})`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
