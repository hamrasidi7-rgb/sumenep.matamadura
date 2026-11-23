// Pemeriksaan database CMS sesudah `npm run db:migrate` (Fase 2–4), TANPA
// mengubah apa pun: setiap koneksi berjalan dalam satu transaksi READ ONLY yang
// selalu di-ROLLBACK. Aman dijalankan ke production kapan saja.
//
//   npm run db:verify                                         memakai .env
//   npm run db:verify -- --env-file .env.production.local
//
// Yang diperiksa:
//   - migrasi di prisma/migrations sudah diterapkan semua, tidak ada yang gagal;
//   - tabel, CHECK constraint, dan trigger (aktif) yang dibuat migrasi;
//   - aturan satu Admin (CHECK id = 1) dan jumlah Admin;
//   - trigger append-only Activity Log;
//   - role runtime (DB_APP_ROLE): bukan superuser, bukan anggota neon_superuser /
//     pg_write_all_data, tidak memiliki tabel, dan hak per tabel sesuai grants.ts;
//   - DATABASE_URL benar-benar memakai role runtime; sesi UTC; TLS; data awal.
//
// Exit 0 = semua lolos (peringatan boleh), 1 = ada yang gagal.
// Tidak pernah mencetak password atau connection string lengkap.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import pg from "pg";

import { describeTarget, requireEnv, splitSchema } from "../../src/server/db/client";
import { loadEnv, Refusal, runCli, targetLabel } from "../lib/cli";
import { CHECKS } from "./grants";

type Status = "ok" | "warn" | "fail";
type Row = Record<string, unknown>;
type Query = (text: string, values?: unknown[]) => Promise<Row[]>;

const TAG: Record<Status, string> = { ok: "[OK]        ", warn: "[PERINGATAN]", fail: "[GAGAL]     " };
const UTC_NAMES = new Set(["UTC", "Etc/UTC", "UCT", "Etc/UCT", "GMT", "Etc/GMT", "Universal", "Etc/Universal", "Zulu"]);
// Role bawaan yang memberi hak jauh melebihi kebutuhan aplikasi. Role yang dibuat
// lewat Neon Console/CLI/API otomatis anggota neon_superuser (termasuk
// pg_write_all_data dan BYPASSRLS), jadi role runtime wajib dibuat dengan SQL.
const BROAD_ROLES = ["neon_superuser", "pg_write_all_data", "pg_read_all_data", "rds_superuser", "cloudsqlsuperuser"];

export interface ExpectedObjects {
  migrations: string[];
  tables: string[];
  checks: string[];
  triggers: string[];
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
    tables: names(/CREATE TABLE "([A-Za-z0-9_]+)"/g),
    checks: names(/ADD CONSTRAINT "([A-Za-z0-9_]+)" CHECK/g),
    triggers: names(/CREATE TRIGGER "([A-Za-z0-9_]+)"/g),
  };
}

/** sslmode dari connection string. Database remote wajib TLS terverifikasi. */
export function tlsStatus(url: string): { status: Status; detail: string } {
  if (describeTarget(url).isLocal) return { status: "ok", detail: "database lokal, TLS tidak diwajibkan" };
  const mode = new URL(url).searchParams.get("sslmode");
  if (mode === "verify-full") return { status: "ok", detail: "sslmode=verify-full" };
  if (mode === "require" || mode === "verify-ca") {
    return { status: "warn", detail: `sslmode=${mode}; gunakan sslmode=verify-full` };
  }
  return { status: "fail", detail: `sslmode=${mode ?? "(tidak ada)"}; database remote wajib sslmode=verify-full` };
}

const missing = (expected: string[], actual: Iterable<string>) => {
  const have = new Set(actual);
  return expected.filter((name) => !have.has(name));
};
const list = (names: string[], max = 6) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} … (+${names.length - max})`;

/** Satu koneksi, satu transaksi READ ONLY, selalu ROLLBACK. Aman juga lewat pooler (transaction mode). */
async function readOnly<T>(url: string, work: (query: Query) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: splitSchema(url).connectionString, connectionTimeoutMillis: 20_000 });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    try {
      return await work(async (text, values) => (await client.query(text, values as unknown[] | undefined)).rows as Row[]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Pesan error yang aman ditampilkan (pg tidak menyertakan password; potong untuk berjaga-jaga). */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(ql)?:\/\/\S+/gi, "<connection string>").slice(0, 240);
}

async function main(envFile?: string): Promise<void> {
  loadEnv(envFile);
  const directUrl = requireEnv("DIRECT_URL");
  const databaseUrl = process.env.DATABASE_URL;
  const appRole = process.env.DB_APP_ROLE;
  if (!appRole) throw new Refusal("DB_APP_ROLE belum diisi (nama role runtime aplikasi).");
  const schema = splitSchema(directUrl).schema ?? "public";
  const expected = readExpectedObjects();

  const results: Array<{ status: Status; label: string; detail: string }> = [];
  const add = (status: Status, label: string, detail: string) => results.push({ status, label, detail });

  console.log("Pemeriksaan database CMS (read-only, tidak mengubah data)");
  console.log(`  Pemilik (DIRECT_URL)   : ${targetLabel(directUrl)}`);
  console.log(`  Runtime (DATABASE_URL) : ${databaseUrl ? targetLabel(databaseUrl) : "(tidak diisi)"}`);
  console.log(`  Role runtime           : ${appRole}, skema ${schema}\n`);

  const tlsOwner = tlsStatus(directUrl);
  add(tlsOwner.status, "TLS pemilik", tlsOwner.detail);

  // ── Koneksi pemilik: struktur, aturan integritas, role runtime ──────────────
  try {
    await readOnly(directUrl, async (q) => {
      const [server] = await q(
        `SELECT current_setting('server_version_num')::int AS num, current_setting('server_version') AS version,
                current_user::text AS who, current_setting('TimeZone') AS tz`,
      );
      add(Number(server.num) >= 160000 ? "ok" : "warn", "Versi PostgreSQL", `${server.version}${Number(server.num) >= 160000 ? "" : " (dikembangkan & diuji di 16)"}`);
      add(UTC_NAMES.has(String(server.tz)) ? "ok" : "fail", "TimeZone pemilik", String(server.tz));
      if (server.who === appRole) add("fail", "Role pemilik", "DIRECT_URL memakai role runtime; harus role pemilik database");

      const [reg] = await q(`SELECT to_regclass(format('%I.%I', $1::text, '_prisma_migrations')) IS NOT NULL AS exists`, [schema]);
      if (!reg.exists) {
        add("fail", "Migrasi", "tabel _prisma_migrations belum ada; jalankan npm run db:migrate");
        return;
      }

      const rows = await q(
        `SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
           FROM ${pg.escapeIdentifier(schema)}."_prisma_migrations"`,
      );
      const applied = rows.filter((r) => r.finished && !r.rolled_back).map((r) => String(r.name));
      const failed = rows.filter((r) => !r.finished && !r.rolled_back).map((r) => String(r.name));
      const notApplied = missing(expected.migrations, applied);
      const unknown = missing(applied, expected.migrations);
      if (failed.length) add("fail", "Migrasi", `gagal/terhenti: ${list(failed)}`);
      else if (notApplied.length) add("fail", "Migrasi", `belum diterapkan: ${list(notApplied)}; jalankan npm run db:migrate`);
      else add("ok", "Migrasi", `${applied.length}/${expected.migrations.length} diterapkan, tidak ada yang gagal`);
      if (unknown.length) add("warn", "Migrasi", `ada di database tapi tidak di kode ini: ${list(unknown)}`);

      const tables = await q(`SELECT tablename::text AS name FROM pg_tables WHERE schemaname = $1`, [schema]);
      const noTable = missing(expected.tables, tables.map((r) => String(r.name)));
      add(noTable.length ? "fail" : "ok", "Tabel", noTable.length ? `tidak ada: ${list(noTable)}` : `${expected.tables.length}/${expected.tables.length} ada`);

      const checks = await q(
        `SELECT c.conname::text AS name, c.convalidated AS valid
           FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = $1 AND c.contype = 'c'`,
        [schema],
      );
      const noCheck = missing(expected.checks, checks.filter((r) => r.valid).map((r) => String(r.name)));
      add(noCheck.length ? "fail" : "ok", "CHECK constraint", noCheck.length ? `tidak ada/tidak valid: ${list(noCheck)}` : `${expected.checks.length}/${expected.checks.length} ada dan tervalidasi`);

      const triggers = await q(
        `SELECT t.tgname::text AS name, t.tgenabled AS enabled, pg_get_triggerdef(t.oid) AS def
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND NOT t.tgisinternal`,
        [schema],
      );
      // 'O' = aktif (origin), 'A' = selalu; 'D' = nonaktif, 'R' = hanya mode replika.
      const active = triggers.filter((r) => r.enabled === "O" || r.enabled === "A");
      const noTrigger = missing(expected.triggers, active.map((r) => String(r.name)));
      add(noTrigger.length ? "fail" : "ok", "Trigger", noTrigger.length ? `tidak ada/nonaktif: ${list(noTrigger)}` : `${expected.triggers.length}/${expected.triggers.length} ada dan aktif`);

      const appendOnly = active.find((r) => r.name === "activity_log_append_only");
      const def = String(appendOnly?.def ?? "");
      const blocksAll = /\sON\s+(\S+\.)?"?activity_log"?\s/.test(def) && ["UPDATE", "DELETE", "TRUNCATE"].every((op) => def.includes(op));
      add(blocksAll ? "ok" : "fail", "Activity Log append-only", blocksAll ? "trigger menolak UPDATE, DELETE, TRUNCATE" : "trigger activity_log_append_only tidak ada, nonaktif, atau tidak lengkap");

      const [single] = await q(
        `SELECT pg_get_constraintdef(c.oid) AS def
           FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = $1 AND c.conname = 'admin_user_single_admin' AND c.convalidated`,
        [schema],
      );
      const [admins] = await q(`SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(schema)}."admin_user"`);
      const singleOk = /\(\s*\(?\s*id\s*=\s*1\s*\)?\s*\)/.test(String(single?.def ?? ""));
      if (!singleOk) add("fail", "Satu Admin", "CHECK admin_user_single_admin (id = 1) tidak ada");
      else if (Number(admins.n) === 0) add("warn", "Satu Admin", "constraint aktif; belum ada Admin, jalankan npm run admin:bootstrap");
      else if (Number(admins.n) === 1) add("ok", "Satu Admin", "constraint aktif; tepat 1 Admin");
      else add("fail", "Satu Admin", `${admins.n} baris Admin (seharusnya mustahil)`);

      const sections = await q(`SELECT kind::text AS kind, count(*)::int AS n FROM ${pg.escapeIdentifier(schema)}."section" GROUP BY kind`);
      const count = (kind: string) => Number(sections.find((r) => r.kind === kind)?.n ?? 0);
      const [redaksi] = await q(`SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(schema)}."author" WHERE slug = 'redaksi'`);
      const [singletons] = await q(
        `SELECT (SELECT count(*) FROM ${pg.escapeIdentifier(schema)}."homepage_settings")::int AS home,
                (SELECT count(*) FROM ${pg.escapeIdentifier(schema)}."site_settings")::int AS site`,
      );
      const seeded = count("KANAL") >= 5 && count("RUBRIK") >= 5 && Number(redaksi.n) === 1;
      const singletonOk = Number(singletons.home) === 1 && Number(singletons.site) === 1;
      add(
        !singletonOk ? "fail" : seeded ? "ok" : "warn",
        "Data awal",
        `${count("KANAL")} kanal, ${count("RUBRIK")} rubrik, penulis redaksi ${Number(redaksi.n) ? "ada" : "belum ada"}, ` +
          `pengaturan ${singletonOk ? "1+1" : `${singletons.home}+${singletons.site} (seharusnya 1+1)`}` +
          (seeded ? "" : "; jalankan npm run db:seed"),
      );

      // Role runtime: atribut, keanggotaan role luas, kepemilikan, hak per tabel.
      const [role] = await q(
        `SELECT rolcanlogin AS login, rolsuper AS super, rolcreaterole AS createrole, rolcreatedb AS createdb,
                rolbypassrls AS bypassrls, rolreplication AS replication
           FROM pg_roles WHERE rolname = $1`,
        [appRole],
      );
      if (!role) {
        add("fail", "Role runtime", `role ${appRole} tidak ada di database ini`);
        return;
      }
      const attrs = ["super", "createrole", "createdb", "bypassrls", "replication"].filter((key) => role[key]);
      const broad = (
        await q(
          `SELECT r.rolname::text AS name FROM pg_roles r
            WHERE r.rolname = ANY($2::text[]) AND pg_has_role($1, r.oid, 'MEMBER')`,
          [appRole, BROAD_ROLES],
        )
      ).map((r) => String(r.name));
      const [owned] = await q(
        `SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = $2 AND tableowner = $1)::int AS tables,
                (SELECT pg_get_userbyid(datdba) = $1 FROM pg_database WHERE datname = current_database()) AS owns_db`,
        [appRole, schema],
      );
      const problems = [
        ...(role.login ? [] : ["tidak bisa login"]),
        ...attrs.map((a) => a.toUpperCase()),
        ...broad.map((b) => `anggota ${b}`),
        ...(Number(owned.tables) ? [`memiliki ${owned.tables} tabel`] : []),
        ...(owned.owns_db ? ["pemilik database"] : []),
      ];
      add(
        problems.length ? "fail" : "ok",
        "Role runtime",
        problems.length
          ? `${problems.join(", ")}. Buat role runtime dengan SQL (bukan Neon Console), lihat docs/INFRASTRUCTURE.md`
          : "login, tanpa atribut superuser/CREATEROLE/BYPASSRLS, bukan anggota role luas, tidak memiliki tabel",
      );

      const wrong: string[] = [];
      for (const [table, privilege, want] of CHECKS) {
        const [row] = await q(`SELECT has_table_privilege($1, format('%I.%I', $2::text, $3::text), $4) AS ok`, [appRole, schema, table, privilege]);
        if (row.ok !== want) wrong.push(`${table}.${privilege}=${row.ok}`);
      }
      add(wrong.length ? "fail" : "ok", "Hak akses minimum", wrong.length ? `tidak sesuai: ${list(wrong)}; jalankan npm run db:grants` : `${CHECKS.length}/${CHECKS.length} sesuai grants.ts`);
    });
  } catch (error) {
    add("fail", "Koneksi pemilik", reason(error));
  }

  // ── Koneksi runtime: yang dipakai website ───────────────────────────────────
  if (!databaseUrl) {
    add("fail", "Koneksi runtime", "DATABASE_URL tidak diisi");
  } else {
    const tlsApp = tlsStatus(databaseUrl);
    add(tlsApp.status, "TLS runtime", tlsApp.detail);
    const host = describeTarget(databaseUrl).host;
    if (/\.neon\.tech(:\d+)?$/.test(host) && !host.includes("-pooler")) {
      add("warn", "Pooler runtime", "DATABASE_URL Neon sebaiknya memakai endpoint -pooler");
    }
    try {
      await readOnly(databaseUrl, async (q) => {
        const [me] = await q(`SELECT current_user::text AS who, current_setting('TimeZone') AS tz`);
        add(me.who === appRole ? "ok" : "fail", "Role runtime dipakai", me.who === appRole ? `DATABASE_URL masuk sebagai ${appRole}` : `DATABASE_URL masuk sebagai ${me.who}, seharusnya ${appRole}`);
        add(UTC_NAMES.has(String(me.tz)) ? "ok" : "fail", "TimeZone runtime", String(me.tz));
        const [counts] = await q(
          `SELECT (SELECT count(*) FROM ${pg.escapeIdentifier(schema)}."article")::int AS articles,
                  (SELECT count(*) FROM ${pg.escapeIdentifier(schema)}."activity_log")::int AS log`,
        );
        add("ok", "Akses runtime", `baca artikel (${counts.articles}) dan Activity Log (${counts.log} entri) berhasil`);
      });
    } catch (error) {
      add("fail", "Koneksi runtime", reason(error));
    }
  }

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
