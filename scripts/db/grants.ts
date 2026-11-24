// Least-privilege grants for a separate runtime user (DB_APP_USER), applied by
// the owner (DIRECT_URL) and then verified from the runtime connection
// (DATABASE_URL). Idempotent; run after every migration (npm run db:migrate
// does it for you). User names differ per environment, which is why this is a
// script and not part of the migrations.
//
// The runtime user gets SELECT/INSERT/UPDATE/DELETE on each CMS table, except:
//   activity_log        INSERT + SELECT only (append-only)
//   admin_user          SELECT + UPDATE only (cannot create or delete the Admin)
//   homepage_settings,
//   site_settings       SELECT + UPDATE only (singletons cannot be added or removed)
//   _prisma_migrations  nothing
// and nothing else: no ALTER, DROP (so no TRUNCATE), CREATE, INDEX or TRIGGER.
//
// Single-user mode: Hostinger's hPanel gives one database user per database,
// with all privileges on it. When DB_APP_USER is empty or the same user as
// DIRECT_URL, nothing is granted; the app-level guards (src/server/db/guards.ts)
// and, when the host allows them, the guard triggers enforce the rules.
// `npm run db:verify` reports which mode is in use.
//
//   npm run db:grants [-- --env-file <path>] [-- --yes]
import { parseArgs } from "node:util";

import { requireEnv } from "../../src/server/db/client";
import { confirmTarget, loadEnv, Refusal, runCli } from "../lib/cli";
import { account, ident, urlUser, withConnection, type Connection } from "../lib/mariadb";

export const CHECKS: Array<[table: string, privilege: string, expected: boolean]> = [
  ["activity_log", "INSERT", true],
  ["activity_log", "SELECT", true],
  ["activity_log", "UPDATE", false],
  ["activity_log", "DELETE", false],
  ["activity_log", "DROP", false],
  ["admin_user", "SELECT", true],
  ["admin_user", "UPDATE", true],
  ["admin_user", "INSERT", false],
  ["admin_user", "DELETE", false],
  ["homepage_settings", "INSERT", false],
  ["site_settings", "DELETE", false],
  ["article", "UPDATE", true],
  ["article", "ALTER", false],
  ["article", "TRIGGER", false],
  ["_prisma_migrations", "SELECT", false],
];

const EXCEPTIONS: Record<string, string> = {
  activity_log: "SELECT, INSERT",
  admin_user: "SELECT, UPDATE",
  homepage_settings: "SELECT, UPDATE",
  site_settings: "SELECT, UPDATE",
};

/** GRANT statements for every CMS table of `database`. */
export function grantStatements(appAccount: string, database: string, tables: string[]): string[] {
  return tables
    .filter((table) => table !== "_prisma_migrations")
    .map((table) => `GRANT ${EXCEPTIONS[table] ?? "SELECT, INSERT, UPDATE, DELETE"} ON ${ident(database)}.${ident(table)} TO ${appAccount}`);
}

export function isSingleUser(directUrl: string, appUser: string | undefined): boolean {
  return !appUser || account(appUser).user === urlUser(directUrl);
}

// ─── Effective privileges from SHOW GRANTS (of the current user) ─────────────

const ALL = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "INDEX", "TRIGGER", "REFERENCES", "CREATE VIEW", "SHOW VIEW"];

interface Grant {
  privileges: Set<string>;
  database: string | null; // null = *.*
  table: string | null; // null = db.*
}

function unquote(name: string): string {
  return name.replace(/^`|`$/g, "").replace(/``/g, "`");
}

/** "GRANT SELECT, INSERT ON `db`.`t` TO …" → privileges and scope. */
export function parseGrant(line: string): Grant | null {
  const match = /^GRANT (.+?) ON (?:(?:TABLE|PROCEDURE|FUNCTION) )?(\*|`(?:[^`]|``)+`)\.(\*|`(?:[^`]|``)+`) TO /.exec(line);
  if (!match) return null;
  const raw = match[1].replace(/\([^)]*\)/g, ""); // column lists
  const privileges = new Set(
    raw
      .split(",")
      .map((p) => p.trim().toUpperCase())
      .flatMap((p) => (p === "ALL PRIVILEGES" || p === "ALL" ? ALL : [p])),
  );
  return {
    privileges,
    database: match[2] === "*" ? null : unquote(match[2]),
    table: match[3] === "*" ? null : unquote(match[3]),
  };
}

/** MySQL database-name patterns in grants: % and _ are wildcards, \ escapes. */
function databaseMatches(pattern: string, database: string): boolean {
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

export async function currentGrants(conn: Connection): Promise<Grant[]> {
  const rows = (await conn.query("SHOW GRANTS")) as Array<Record<string, string>>;
  return rows.map((row) => parseGrant(Object.values(row)[0])).filter((g): g is Grant => g !== null);
}

export function hasPrivilege(grants: Grant[], database: string, table: string, privilege: string): boolean {
  return grants.some(
    (g) =>
      g.privileges.has(privilege) &&
      (g.database === null || (databaseMatches(g.database, database) && (g.table === null || g.table.toLowerCase() === table.toLowerCase()))),
  );
}

// ─── Apply + verify ──────────────────────────────────────────────────────────

async function tablesOf(conn: Connection): Promise<string[]> {
  const rows = (await conn.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1",
  )) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

export async function applyGrants(directUrl: string, appUser: string): Promise<void> {
  const app = account(appUser);
  await withConnection(directUrl, async (conn) => {
    const [db] = (await conn.query("SELECT DATABASE() AS name")) as Array<{ name: string }>;
    const tables = await tablesOf(conn);
    // Start from nothing on this database: drop every earlier table/db-level grant.
    const existing = (await conn.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLE_PRIVILEGES WHERE TABLE_SCHEMA = DATABASE() AND GRANTEE = ? GROUP BY TABLE_NAME",
      [`'${app.user}'@'${app.host}'`],
    )) as Array<{ name: string }>;
    for (const { name } of existing) await conn.query(`REVOKE ALL PRIVILEGES ON ${ident(db.name)}.${ident(name)} FROM ${app.sql}`);
    for (const sql of grantStatements(app.sql, db.name, tables)) await conn.query(sql);
  });
}

export async function verifyGrants(databaseUrl: string): Promise<string[]> {
  return withConnection(databaseUrl, async (conn) => {
    const [db] = (await conn.query("SELECT DATABASE() AS name")) as Array<{ name: string }>;
    const grants = await currentGrants(conn);
    const failures: string[] = [];
    for (const [table, privilege, expected] of CHECKS) {
      const actual = hasPrivilege(grants, db.name, table, privilege);
      if (actual !== expected) failures.push(`${table}.${privilege} = ${actual}, seharusnya ${expected}`);
    }
    return failures;
  });
}

/** Session time zone of a new app connection (the client sets UTC per connection). */
export async function sessionTimeZone(url: string): Promise<{ zone: string; offsetSeconds: number }> {
  return withConnection(url, async (conn) => {
    const [row] = (await conn.query("SELECT @@session.time_zone AS zone, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offset_s")) as Array<{ zone: string; offset_s: number }>;
    return { zone: row.zone, offsetSeconds: Number(row.offset_s) };
  });
}

/** Grants (when a separate runtime user exists) + UTC check. Run after every migration. */
export async function finalizeDatabase(options: { directUrl: string; databaseUrl?: string; appUser?: string }): Promise<string> {
  const messages: string[] = [];
  if (isSingleUser(options.directUrl, options.appUser)) {
    messages.push("Mode satu user database: hak akses tidak dipisah (guard aplikasi + trigger bila diizinkan host).");
  } else {
    if (!options.databaseUrl) throw new Refusal("DATABASE_URL diperlukan untuk memeriksa hak akses user runtime.");
    if (urlUser(options.databaseUrl) !== account(options.appUser!).user) {
      throw new Refusal("DATABASE_URL harus memakai DB_APP_USER (user runtime), bukan user lain.");
    }
    await applyGrants(options.directUrl, options.appUser!);
    const failures = await verifyGrants(options.databaseUrl);
    if (failures.length) throw new Error(`Hak akses tidak sesuai:\n  ${failures.join("\n  ")}`);
    messages.push(`Hak akses ${account(options.appUser!).user} sesuai (${CHECKS.length} pemeriksaan).`);
  }
  const tz = await sessionTimeZone(options.databaseUrl ?? options.directUrl);
  if (tz.offsetSeconds !== 0) throw new Error(`Sesi database tidak UTC (time_zone ${tz.zone}).`);
  messages.push("Sesi database berjalan dalam UTC.");
  return messages.join(" ");
}

const isMain = process.argv[1] && /grants\.ts$/.test(process.argv[1]);
if (isMain) {
  const { values } = parseArgs({
    options: { "env-file": { type: "string" }, yes: { type: "boolean", default: false } },
  });
  void runCli(async () => {
    loadEnv(values["env-file"]);
    const directUrl = requireEnv("DIRECT_URL");
    await confirmTarget(directUrl, "mengatur hak akses", values.yes);
    console.log(await finalizeDatabase({ directUrl, databaseUrl: process.env.DATABASE_URL, appUser: process.env.DB_APP_USER }));
  });
}
