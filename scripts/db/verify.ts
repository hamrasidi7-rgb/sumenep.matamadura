// Pemeriksaan database CMS (MariaDB) sesudah `npm run db:migrate`, TANPA
// mengubah apa pun: setiap koneksi berjalan dalam satu transaksi READ ONLY yang
// selalu di-ROLLBACK. Aman dijalankan ke production kapan saja.
//
//   npm run db:verify                                         memakai .env
//   npm run db:verify -- --env-file .env.production.local
//
// Yang diperiksa:
//   - versi MariaDB, charset/collation database, sesi UTC;
//   - migrasi di prisma/migrations sudah diterapkan semua, tidak ada yang gagal;
//   - tabel, 42 CHECK constraint, aturan satu Admin dan jumlah Admin;
//   - lapisan perlindungan: guard aplikasi (selalu), trigger penjaga (bila host
//     mengizinkan), user runtime terpisah dengan hak minimum (bila tersedia);
//   - data awal (kanal, rubrik, penulis redaksi, pengaturan).
//
// Exit 0 = semua lolos (peringatan boleh), 1 = ada yang gagal.
// Tidak pernah mencetak password atau connection string lengkap.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { describeTarget, requireEnv } from "../../src/server/db/client";
import { loadEnv, runCli, targetLabel } from "../lib/cli";
import { account, urlUser, withConnection, type Connection } from "../lib/mariadb";
import { CHECKS, currentGrants, hasPrivilege, isSingleUser } from "./grants";
import { expectedTriggers } from "./triggers";

type Status = "ok" | "warn" | "fail";
type Row = Record<string, unknown>;

const TAG: Record<Status, string> = { ok: "[OK]        ", warn: "[PERINGATAN]", fail: "[GAGAL]     " };

export interface ExpectedObjects {
  migrations: string[];
  tables: string[];
  checks: string[];
  foreignKeys: number;
}

/** Objek yang seharusnya ada, dibaca dari SQL migrasi (sumber kebenaran yang sama dengan `migrate deploy`). */
export function readExpectedObjects(dir = path.join(process.cwd(), "prisma", "migrations")): ExpectedObjects {
  const migrations = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const sql = migrations.map((name) => fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8")).join("\n");
  const names = (pattern: RegExp) => [...new Set([...sql.matchAll(pattern)].map((match) => match[1]))].sort();
  return {
    migrations,
    tables: names(/CREATE TABLE `([A-Za-z0-9_]+)`/g),
    checks: names(/ADD CONSTRAINT `([A-Za-z0-9_]+)` CHECK/g),
    foreignKeys: names(/ADD CONSTRAINT `([A-Za-z0-9_]+)` FOREIGN KEY/g).length,
  };
}

/** TLS for remote databases. On Hostinger the app reaches MariaDB on localhost (no TLS needed). */
export function tlsStatus(url: string): { status: Status; detail: string } {
  if (describeTarget(url).isLocal) return { status: "ok", detail: "database lokal (localhost), TLS tidak diwajibkan" };
  const ssl = (new URL(url).searchParams.get("ssl") ?? "").toLowerCase();
  if (["1", "true", "require", "required", "verify-full", "verify_identity"].includes(ssl)) return { status: "ok", detail: "ssl=true (sertifikat diverifikasi)" };
  return { status: "warn", detail: "koneksi remote tanpa ?ssl=true; aktifkan TLS bila server mendukung" };
}

const missing = (expected: string[], actual: Iterable<string>) => {
  const have = new Set([...actual].map((n) => n.toLowerCase()));
  return expected.filter((name) => !have.has(name.toLowerCase()));
};
const list = (names: string[], max = 6) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} … (+${names.length - max})`;

/** Satu koneksi, satu transaksi READ ONLY, selalu ROLLBACK. */
async function readOnly<T>(url: string, work: (conn: Connection, q: (sql: string, values?: unknown[]) => Promise<Row[]>) => Promise<T>): Promise<T> {
  return withConnection(url, async (conn) => {
    await conn.query("START TRANSACTION READ ONLY");
    try {
      return await work(conn, async (sql, values) => (await conn.query(sql, values)) as Row[]);
    } finally {
      await conn.query("ROLLBACK").catch(() => undefined);
    }
  });
}

function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(mysql|mariadb):\/\/\S+/gi, "<connection string>").slice(0, 240);
}

async function main(envFile?: string): Promise<void> {
  loadEnv(envFile);
  const directUrl = requireEnv("DIRECT_URL");
  const databaseUrl = process.env.DATABASE_URL;
  const appUser = process.env.DB_APP_USER;
  const singleUser = isSingleUser(directUrl, appUser);
  const expected = readExpectedObjects();
  const triggerNames = expectedTriggers();

  const results: Array<{ status: Status; label: string; detail: string }> = [];
  const add = (status: Status, label: string, detail: string) => results.push({ status, label, detail });

  console.log("Pemeriksaan database CMS (read-only, tidak mengubah data)");
  console.log(`  Pemilik (DIRECT_URL)   : ${targetLabel(directUrl)}`);
  console.log(`  Runtime (DATABASE_URL) : ${databaseUrl ? targetLabel(databaseUrl) : "(tidak diisi)"}`);
  console.log(`  Mode user              : ${singleUser ? "satu user (owner = runtime)" : `user runtime terpisah (${account(appUser!).user})`}\n`);

  const tlsOwner = tlsStatus(directUrl);
  add(tlsOwner.status, "TLS pemilik", tlsOwner.detail);
  let triggersActive = false;

  try {
    await readOnly(directUrl, async (_conn, q) => {
      const [server] = await q(
        `SELECT VERSION() AS version, @@session.time_zone AS tz, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offset_s,
                DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation
           FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()`,
      );
      const version = String(server.version);
      const [major, minor] = version.split(/[.-]/).map(Number);
      const isMaria = /mariadb/i.test(version);
      const modern = isMaria && (major > 10 || (major === 10 && minor >= 6));
      add(modern ? "ok" : "warn", "Versi server", `${version}${modern ? "" : " (dikembangkan & diuji di MariaDB 10.11)"}`);
      add(Number(server.offset_s) === 0 ? "ok" : "fail", "Sesi UTC", `time_zone ${server.tz}`);
      add(
        server.charset === "utf8mb4" ? "ok" : "fail",
        "Charset database",
        `${server.charset} / ${server.collation}${server.charset === "utf8mb4" ? "" : " (harus utf8mb4)"}`,
      );

      const [reg] = await q(`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_prisma_migrations'`);
      if (!Number(reg.n)) {
        add("fail", "Migrasi", "tabel _prisma_migrations belum ada; jalankan npm run db:migrate");
        return;
      }
      const rows = await q(
        `SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations`,
      );
      const applied = rows.filter((r) => Number(r.finished) && !Number(r.rolled_back)).map((r) => String(r.name));
      const failed = rows.filter((r) => !Number(r.finished) && !Number(r.rolled_back)).map((r) => String(r.name));
      const notApplied = missing(expected.migrations, applied);
      const unknown = missing(applied, expected.migrations);
      if (failed.length) add("fail", "Migrasi", `gagal/terhenti: ${list(failed)}`);
      else if (notApplied.length) add("fail", "Migrasi", `belum diterapkan: ${list(notApplied)}; jalankan npm run db:migrate`);
      else add("ok", "Migrasi", `${applied.length}/${expected.migrations.length} diterapkan, tidak ada yang gagal`);
      if (unknown.length) add("warn", "Migrasi", `ada di database tapi tidak di kode ini: ${list(unknown)}`);

      const tables = await q(`SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);
      const noTable = missing(expected.tables, tables.map((r) => String(r.name)));
      const notInno = tables.filter((r) => expected.tables.includes(String(r.name)) && r.engine !== "InnoDB").map((r) => String(r.name));
      add(
        noTable.length || notInno.length ? "fail" : "ok",
        "Tabel",
        noTable.length ? `tidak ada: ${list(noTable)}` : notInno.length ? `bukan InnoDB: ${list(notInno)}` : `${expected.tables.length}/${expected.tables.length} ada (InnoDB, utf8mb4)`,
      );

      const fks = await q(`SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`);
      add(Number(fks[0].n) === expected.foreignKeys ? "ok" : "fail", "Foreign key", `${fks[0].n}/${expected.foreignKeys} relasi`);

      const checks = await q(`SELECT CONSTRAINT_NAME AS name, CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`);
      const noCheck = missing(expected.checks, checks.map((r) => String(r.name)));
      add(noCheck.length ? "fail" : "ok", "CHECK constraint", noCheck.length ? `tidak ada: ${list(noCheck)}` : `${expected.checks.length}/${expected.checks.length} ada`);

      const single = checks.find((r) => r.name === "admin_user_single_admin");
      const [admins] = await q("SELECT COUNT(*) AS n FROM admin_user");
      const singleOk = /`?id`?\s*=\s*1/.test(String(single?.clause ?? ""));
      if (!singleOk) add("fail", "Satu Admin", "CHECK admin_user_single_admin (id = 1) tidak ada");
      else if (Number(admins.n) === 0) add("warn", "Satu Admin", "constraint aktif; belum ada Admin, jalankan npm run admin:bootstrap");
      else if (Number(admins.n) === 1) add("ok", "Satu Admin", "constraint aktif; tepat 1 Admin");
      else add("fail", "Satu Admin", `${admins.n} baris Admin (seharusnya mustahil)`);

      const triggers = await q(`SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`);
      const noTrigger = missing(triggerNames, triggers.map((r) => String(r.name)));
      triggersActive = noTrigger.length === 0;
      if (triggersActive) add("ok", "Trigger penjaga", `${triggerNames.length}/${triggerNames.length} terpasang (lapisan database aktif)`);
      else if (noTrigger.length === triggerNames.length) add("warn", "Trigger penjaga", "tidak terpasang (host tidak mengizinkan?); aturan ditegakkan guard aplikasi");
      else add("fail", "Trigger penjaga", `sebagian saja: tidak ada ${list(noTrigger)}; jalankan npm run db:triggers`);

      const sections = await q("SELECT kind, COUNT(*) AS n FROM section GROUP BY kind");
      const count = (kind: string) => Number(sections.find((r) => r.kind === kind)?.n ?? 0);
      const [redaksi] = await q("SELECT COUNT(*) AS n FROM author WHERE slug = 'redaksi'");
      const [singletons] = await q("SELECT (SELECT COUNT(*) FROM homepage_settings) AS home, (SELECT COUNT(*) FROM site_settings) AS site");
      const seeded = count("KANAL") >= 5 && count("RUBRIK") >= 5 && Number(redaksi.n) === 1;
      const singletonOk = Number(singletons.home) === 1 && Number(singletons.site) === 1;
      add(
        !singletonOk ? "fail" : seeded ? "ok" : "warn",
        "Data awal",
        `${count("KANAL")} kanal, ${count("RUBRIK")} rubrik, penulis redaksi ${Number(redaksi.n) ? "ada" : "belum ada"}, ` +
          `pengaturan ${singletonOk ? "1+1" : `${singletons.home}+${singletons.site} (seharusnya 1+1)`}` +
          (seeded ? "" : "; jalankan npm run db:seed"),
      );
    });
  } catch (error) {
    add("fail", "Koneksi pemilik", reason(error));
  }

  // ── Koneksi runtime: yang dipakai website ───────────────────────────────────
  let privilegeLayer = false;
  if (!databaseUrl) {
    add("fail", "Koneksi runtime", "DATABASE_URL tidak diisi");
  } else {
    const tlsApp = tlsStatus(databaseUrl);
    add(tlsApp.status, "TLS runtime", tlsApp.detail);
    try {
      await readOnly(databaseUrl, async (conn, q) => {
        const [me] = await q("SELECT CURRENT_USER() AS who, DATABASE() AS db, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offset_s");
        const who = String(me.who).split("@")[0];
        if (singleUser) {
          add(who === urlUser(directUrl) ? "ok" : "warn", "User runtime", `mode satu user: ${who} (hak penuh atas database ini; lihat lapisan perlindungan)`);
        } else {
          const expectedUser = account(appUser!).user;
          add(who === expectedUser ? "ok" : "fail", "User runtime", who === expectedUser ? `DATABASE_URL masuk sebagai ${who}` : `DATABASE_URL masuk sebagai ${who}, seharusnya ${expectedUser}`);
          const grants = await currentGrants(conn);
          const wrong = CHECKS.filter(([table, privilege, want]) => hasPrivilege(grants, String(me.db), table, privilege) !== want).map(
            ([table, privilege, want]) => `${table}.${privilege}=${!want}`,
          );
          privilegeLayer = wrong.length === 0;
          add(privilegeLayer ? "ok" : "fail", "Hak akses minimum", privilegeLayer ? `${CHECKS.length}/${CHECKS.length} sesuai grants.ts` : `tidak sesuai: ${list(wrong)}; jalankan npm run db:grants`);
        }
        add(Number(me.offset_s) === 0 ? "ok" : "fail", "Sesi UTC runtime", Number(me.offset_s) === 0 ? "UTC" : `selisih ${me.offset_s} detik dari UTC`);
        const [counts] = await q("SELECT (SELECT COUNT(*) FROM article) AS articles, (SELECT COUNT(*) FROM activity_log) AS log");
        add("ok", "Akses runtime", `baca artikel (${counts.articles}) dan Activity Log (${counts.log} entri) berhasil`);
      });
    } catch (error) {
      add("fail", "Koneksi runtime", reason(error));
    }
  }

  const layers = ["guard aplikasi", ...(triggersActive ? ["trigger database"] : []), ...(privilegeLayer ? ["hak akses user runtime"] : [])];
  add(
    layers.length > 1 ? "ok" : "warn",
    "Perlindungan Activity Log",
    `${layers.join(" + ")}${layers.length > 1 ? "" : " saja (pemegang password database masih bisa mengubah lewat SQL langsung)"}`,
  );

  const width = Math.max(...results.map((r) => r.label.length));
  for (const r of results) console.log(`${TAG[r.status]} ${r.label.padEnd(width)}  ${r.detail}`);
  const tally = (s: Status) => results.filter((r) => r.status === s).length;
  console.log(`\nRingkasan: ${tally("ok")} lolos, ${tally("warn")} peringatan, ${tally("fail")} gagal.`);
  if (tally("fail")) throw new Error(`${tally("fail")} pemeriksaan gagal.`);
}

const isMain = process.argv[1] && /verify\.ts$/.test(process.argv[1]);
if (isMain) {
  const { values } = parseArgs({ options: { "env-file": { type: "string" } } });
  void runCli(() => main(values["env-file"]));
}
