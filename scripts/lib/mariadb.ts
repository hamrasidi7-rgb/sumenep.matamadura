// Single raw MariaDB connections for the operator CLIs and test runners
// (grants, triggers, verification, throw-away test databases). The web app
// uses Prisma (src/server/db/client.ts); this is for what Prisma cannot do
// (CREATE/DROP DATABASE, GRANT, CREATE TRIGGER, SHOW GRANTS, metadata).
import mariadb from "mariadb";

import { poolConfig, SESSION_SETUP_SQL } from "../../src/server/db/client";

export type Connection = mariadb.Connection;

/** Opens one connection (UTC session), runs `work`, always closes it. */
export async function withConnection<T>(url: string, work: (conn: Connection) => Promise<T>, options: { database?: boolean } = {}): Promise<T> {
  const { connectionLimit: _limit, initSql: _init, ...config } = poolConfig(url, { max: 1 });
  const conn = await mariadb.createConnection({
    ...config,
    // Connect without a default database, e.g. to create or drop one.
    ...(options.database === false ? { database: undefined } : {}),
    // Plain JS values for metadata queries (no BigInt surprises).
    bigIntAsNumber: true,
    insertIdAsNumber: true,
    decimalAsNumber: true,
  });
  try {
    await conn.query(SESSION_SETUP_SQL); // UTC, and the same transaction behaviour as the app
    return await work(conn);
  } finally {
    await conn.end().catch(() => undefined);
  }
}

/** Backtick-quoted identifier. Only simple names are accepted. */
export function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Nama tidak valid: ${name}`);
  return `\`${name}\``;
}

/** 'user'@'host' — DB_APP_USER may be "name" (host %) or "name@host". */
export function account(spec: string): { user: string; host: string; sql: string } {
  const [user, host = "%"] = spec.split("@");
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(user) || !/^[A-Za-z0-9_.%:-]{1,255}$/.test(host)) throw new Error(`DB_APP_USER tidak valid: ${spec}`);
  return { user, host, sql: `'${user}'@'${host}'` };
}

/** User name in a mysql:// connection string. */
export function urlUser(url: string): string {
  return decodeURIComponent(new URL(url).username);
}
