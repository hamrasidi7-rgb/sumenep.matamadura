// Least-privilege grants for the runtime role (DB_APP_ROLE) and UTC sessions,
// applied by the owner (DIRECT_URL) and then verified. Idempotent; run after
// every migration (npm run db:migrate does it for you). Role names differ per
// environment, which is why this is a script and not part of the migrations.
//
// The runtime role gets SELECT/INSERT/UPDATE/DELETE on the CMS tables, except:
//   activity_log        INSERT + SELECT only (append-only, also enforced by trigger)
//   admin_user          SELECT + UPDATE only (cannot create or delete the Admin)
//   homepage_settings,
//   site_settings       SELECT + UPDATE only (singletons cannot be added or removed)
//   _prisma_migrations  nothing
// It never owns a table, so it cannot ALTER tables or disable triggers.
//
//   npm run db:grants [-- --env-file <path>] [-- --yes]
import { parseArgs } from "node:util";

import type { PrismaClient } from "@prisma/client";

import { createPrismaClient, requireEnv, splitSchema } from "../../src/server/db/client";
import { confirmTarget, loadEnv, Refusal, runCli } from "../lib/cli";

const IDENT =/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const quote = (name: string) => {
  if (!IDENT.test(name)) throw new Refusal(`Nama tidak valid: ${name}`);
  return `"${name}"`;
};

export function grantStatements(appRole: string, schemaName: string): string[] {
  const app = quote(appRole);
  const schema = quote(schemaName);
  return [
    `REVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC`,
    `GRANT USAGE ON SCHEMA ${schema} TO ${app}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${app}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${app}`,
    // Tables created later by the owner start with the same DML grants.
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${app}`,
    // Exceptions.
    `REVOKE ALL ON TABLE ${schema}."_prisma_migrations" FROM ${app}`,
    `REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ${schema}."activity_log" FROM ${app}`,
    `REVOKE INSERT, DELETE, TRUNCATE ON TABLE ${schema}."admin_user" FROM ${app}`,
    `REVOKE INSERT, DELETE, TRUNCATE ON TABLE ${schema}."homepage_settings", ${schema}."site_settings" FROM ${app}`,
    `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA ${schema} FROM ${app}`,
  ];
}

export const CHECKS: Array<[table: string, privilege: string, expected: boolean]> = [
  ["activity_log", "INSERT", true],
  ["activity_log", "SELECT", true],
  ["activity_log", "UPDATE", false],
  ["activity_log", "DELETE", false],
  ["activity_log", "TRUNCATE", false],
  ["admin_user", "SELECT", true],
  ["admin_user", "UPDATE", true],
  ["admin_user", "INSERT", false],
  ["admin_user", "DELETE", false],
  ["homepage_settings", "INSERT", false],
  ["site_settings", "DELETE", false],
  ["article", "UPDATE", true],
  ["_prisma_migrations", "SELECT", false],
];

export async function applyGrants(db: PrismaClient, appRole: string, schemaName: string): Promise<void> {
  const [who] = await db.$queryRaw<Array<{ user: string }>>`SELECT current_user::text AS "user"`;
  if (who.user === appRole) throw new Refusal("DB_APP_ROLE tidak boleh sama dengan role pemilik (DIRECT_URL).");
  const [role] = await db.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${appRole}) AS "exists"`;
  if (!role.exists) throw new Refusal(`Role ${appRole} tidak ada di database ini.`);

  await db.$transaction(async (tx) => {
    for (const sql of grantStatements(appRole, schemaName)) await tx.$executeRawUnsafe(sql);
  });

  const failures: string[] = [];
  for (const [table, privilege, expected] of CHECKS) {
    const [row] = await db.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT has_table_privilege($1, $2, $3) AS ok`,
      appRole,
      `${quote(schemaName)}.${quote(table)}`,
      privilege,
    );
    if (row.ok !== expected) failures.push(`${table}.${privilege} = ${row.ok}, seharusnya ${expected}`);
  }
  if (failures.length) throw new Error(`Hak akses tidak sesuai:\n  ${failures.join("\n  ")}`);
}

// Sessions must run in UTC. The pg driver adapter sends timestamps as UTC
// without an offset and reads timestamptz as if the offset were +00:00, so a
// session in e.g. Asia/Jakarta would shift every date by 7 hours — and SQL
// such as `published_at <= now()` (scheduled articles) would be wrong.
const UTC_NAMES = new Set(["UTC", "Etc/UTC", "UCT", "Etc/UCT", "GMT", "Etc/GMT", "Universal", "Etc/Universal", "Zulu"]);

/** ALTER DATABASE … SET TimeZone = 'UTC' (needs ownership of the database). */
async function setDatabaseTimeZone(db: PrismaClient): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(
      `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET "TimeZone" TO %L', current_database(), 'UTC'); END $$`,
    );
    return true;
  } catch {
    return false;
  }
}

/** TimeZone of a brand-new session for this connection string. */
async function sessionTimeZone(url: string): Promise<string> {
  const client = createPrismaClient(url, { max: 1 });
  try {
    const [row] = await client.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
    return row.tz;
  } finally {
    await client.$disconnect();
  }
}

/** Grants + UTC sessions, verified. Run after every migration. */
export async function finalizeDatabase(options: { directUrl: string; databaseUrl?: string; appRole: string }): Promise<string> {
  const schemaName = splitSchema(options.directUrl).schema ?? "public";
  const db = createPrismaClient(options.directUrl, { max: 1 });
  let altered = false;
  try {
    await applyGrants(db, options.appRole, schemaName);
    altered = await setDatabaseTimeZone(db);
  } finally {
    await db.$disconnect();
  }
  const sessions: Array<[string, string | undefined]> = [
    ["pemilik (DIRECT_URL)", options.directUrl],
    ["aplikasi (DATABASE_URL)", options.databaseUrl],
  ];
  for (const [label, url] of sessions) {
    if (!url) continue;
    const tz = await sessionTimeZone(url);
    if (!UTC_NAMES.has(tz)) {
      throw new Error(
        `TimeZone sesi ${label} = ${tz}, seharusnya UTC${altered ? "" : " (ALTER DATABASE tidak diizinkan untuk role ini)"}. ` +
          `Jalankan sebagai admin database: ALTER ROLE <role> SET "TimeZone" TO 'UTC';`,
      );
    }
  }
  return `Hak akses ${options.appRole} pada skema ${schemaName} sesuai (${CHECKS.length} pemeriksaan); sesi database berjalan dalam UTC.`;
}

const isMain = process.argv[1] && /grants\.ts$/.test(process.argv[1]);
if (isMain) {
  const { values } = parseArgs({
    options: { "env-file": { type: "string" }, yes: { type: "boolean", default: false } },
  });
  void runCli(async () => {
    loadEnv(values["env-file"]);
    const directUrl = requireEnv("DIRECT_URL");
    const appRole = process.env.DB_APP_ROLE;
    if (!appRole) throw new Refusal("DB_APP_ROLE belum diisi (nama role runtime aplikasi).");
    await confirmTarget(directUrl, "mengatur hak akses", values.yes);
    console.log(await finalizeDatabase({ directUrl, databaseUrl: process.env.DATABASE_URL, appRole }));
  });
}
