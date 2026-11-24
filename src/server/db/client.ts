import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import mariadb, { type PoolConfig } from "mariadb";

import { withGuards, type SectionKindLookup } from "./guards";

// Prisma Client on the pure-JS `mariadb` driver (engineType = "client" in
// schema.prisma): no native query engine has to match the server's OS.
//
// Two connection strings:
//   DATABASE_URL  runtime user  → the web app, getDb()
//   DIRECT_URL    owner user (migrations, CLI) → scripts/admin/*, scripts/db/*
// On Hostinger shared hosting both may be the same database user (hPanel gives
// one user per database); scripts/db/grants.ts restricts a separate runtime
// user when one exists. Every client applies the app-level guards (./guards).
//
// Format: mysql://user:password@host:3306/database[?ssl=true]

export interface ClientOptions {
  /** Max pooled connections. Keep small: shared hosting caps connections per user. */
  max?: number;
}

const TRUE = new Set(["1", "true", "require", "required", "verify-full", "verify_identity"]);

/**
 * Run by every new connection.
 *
 * - time_zone UTC: DATETIME has no time zone, and CURRENT_TIMESTAMP defaults
 *   (and the optional guard triggers) must write UTC like the app.
 * - innodb_snapshot_isolation OFF, only on MariaDB 11.6.2+ (Hostinger runs
 *   11.8.9; the executable comment is skipped by older servers). From 11.8 it is
 *   ON by default, and then a locking read or an UPDATE of a row that another
 *   transaction changed after this one's first read fails with error 1020
 *   ("Record has changed since last read") instead of waiting and using the
 *   latest version. The CMS was designed and tested for the classic behaviour
 *   (PostgreSQL READ COMMITTED in Fase 2–4, MariaDB 10.11): two saves of the
 *   same article at the same moment end in one success and one friendly
 *   conflict through the version check, never in a server error.
 */
export const SESSION_SETUP_SQL = "SET time_zone = '+00:00' /*M!110602 , innodb_snapshot_isolation = OFF */";

/** mysql:// connection string → mariadb pool settings. Never logs the password. */
export function poolConfig(url: string, options: ClientOptions = {}): PoolConfig & { database: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") {
    throw new Error(`Connection string harus diawali mysql:// (sekarang ${parsed.protocol}//).`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) throw new Error("Nama database tidak ada di connection string.");
  const ssl = (parsed.searchParams.get("ssl") ?? parsed.searchParams.get("sslmode") ?? "").toLowerCase();
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: options.max ?? 5,
    connectTimeout: 10_000,
    initSql: SESSION_SETUP_SQL,
    ...(TRUE.has(ssl) ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

// A section's kind never changes, so a kind once read is valid for the life of
// the process. Keyed by host/database/id.
const sectionKinds = new Map<string, "KANAL" | "RUBRIK">();

/**
 * Section kinds for the integrity guards, read on a short-lived connection of
 * its own — never from the Prisma pool, whose connections may all be held by
 * transactions that are waiting for this very check.
 */
function sectionKindLookup(config: PoolConfig & { database: string }): SectionKindLookup {
  const prefix = `${config.host}:${config.port}/${config.database}/`;
  return async (ids) => {
    const unknown = ids.filter((id) => !sectionKinds.has(prefix + id));
    if (unknown.length) {
      const { connectionLimit: _limit, initSql: _init, ...connectionConfig } = config;
      const conn = await mariadb.createConnection(connectionConfig);
      try {
        const rows = (await conn.query(`SELECT id, kind FROM section WHERE id IN (${unknown.map(() => "?").join(", ")})`, unknown)) as Array<{
          id: string;
          kind: "KANAL" | "RUBRIK";
        }>;
        for (const row of rows) sectionKinds.set(prefix + row.id, row.kind);
      } finally {
        await conn.end().catch(() => undefined);
      }
    }
    const found = new Map<string, "KANAL" | "RUBRIK">();
    for (const id of ids) {
      const kind = sectionKinds.get(prefix + id);
      if (kind) found.set(id, kind);
    }
    return found;
  };
}

export function createPrismaClient(url: string, options: ClientOptions = {}): PrismaClient {
  const config = poolConfig(url, options);
  const adapter = new PrismaMariaDb(config, {
    database: config.database,
    // A dropped connection (database restart, idle timeout, network) is
    // replaced on the next query; log it instead of failing silently.
    onConnectionError: (error) => console.warn(`[db] koneksi bermasalah: ${error.message}`),
  });
  return withGuards(new PrismaClient({ adapter }), sectionKindLookup(config));
}

export function requireEnv(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example and docs/05-backend-fondasi.md)`);
  return value;
}

/** host/database of a connection string, for messages. Never includes credentials. */
export function describeTarget(url: string): { host: string; database: string; isLocal: boolean } {
  const parsed = new URL(url);
  const host = parsed.hostname;
  return {
    host: parsed.port ? `${host}:${parsed.port}` : host,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    isLocal: host === "127.0.0.1" || host === "localhost" || host === "::1",
  };
}
