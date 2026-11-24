import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import { createPrismaClient } from "@/server/db/client";

import { withConnection } from "../../scripts/lib/mariadb";

// Helpers for tests/db/*. They run against the throw-away database created by
// scripts/test/run-db-tests.ts — never against development or production.

function requireUrl(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = process.env[name];
  if (!value || !new URL(value).pathname.includes("_test")) {
    throw new Error(`${name} must point at a *_test database (run through npm run test:db)`);
  }
  return value;
}

export interface Connections {
  /** Owner role (DIRECT_URL): what migrations and the CLI scripts use. */
  owner: PrismaClient;
  /** Runtime role (DATABASE_URL): what the web app uses. */
  app: PrismaClient;
  close(): Promise<void>;
}

export function connect(): Connections {
  const owner = createPrismaClient(requireUrl("DIRECT_URL"), { max: 2 });
  const app = createPrismaClient(requireUrl("DATABASE_URL"), { max: 2 });
  return {
    owner,
    app,
    async close() {
      await Promise.all([owner.$disconnect(), app.$disconnect()]);
    },
  };
}

const DATA_TABLES = [
  "activity_log",
  "admin_session",
  "admin_user",
  "login_attempt",
  "article_media",
  "article_revision",
  "article_status_change",
  "article_slug_history",
  "homepage_featured",
  "homepage_rubric",
  "homepage_settings",
  "site_settings",
  "article",
  "author",
  "section",
  "media",
  "media_folder",
];

/** Which protection layers this test database has (set by scripts/test/run-db-tests.ts). */
export const LAYERS = {
  /** Guard triggers installed (the server allowed CREATE TRIGGER). */
  triggers: process.env.SUMENEP_TEST_TRIGGERS === "on",
  /** DATABASE_URL is a separate runtime user with table-level grants. */
  separateUser:
    Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL) &&
    new URL(process.env.DATABASE_URL!).username !== new URL(process.env.DIRECT_URL!).username,
};

/**
 * Empty every table between test files, on ONE raw owner connection: TRUNCATE
 * needs DROP, which only the owner has; it fires no trigger; foreign keys are
 * switched off for this session only. AUTO_INCREMENT starts again at 1.
 */
export async function resetData(_owner?: PrismaClient): Promise<void> {
  await withConnection(requireUrl("DIRECT_URL"), async (conn) => {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const table of DATA_TABLES) await conn.query(`TRUNCATE TABLE \`${table}\``);
    } finally {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    }
    await conn.query("INSERT INTO homepage_settings (id, latest_count, updated_at) VALUES (1, 4, CURRENT_TIMESTAMP(3))");
    await conn.query("INSERT INTO site_settings (id, social_links, updated_at) VALUES (1, '{}', CURRENT_TIMESTAMP(3))");
  });
}

/** One raw SQL statement as `url`'s user (owner: DIRECT_URL, runtime: DATABASE_URL). Bypasses the app guards. */
export function rawSql(who: "owner" | "app", sql: string, values: unknown[] = []): Promise<unknown> {
  return withConnection(requireUrl(who === "owner" ? "DIRECT_URL" : "DATABASE_URL"), (conn) => conn.query(sql, values));
}

/** Message, code, meta and causes of a (Prisma/driver) error, flattened to one string. */
export function errorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 5) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ["name", "code", "message", "originalCode", "originalMessage", "kind", "constraint"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number") parts.push(`${key}=${record[key]}`);
    }
    for (const key of ["meta", "cause", "driverAdapterError"]) visit(record[key], depth + 1);
    if (record.constraint && typeof record.constraint === "object") parts.push(`constraint=${JSON.stringify(record.constraint)}`);
  };
  visit(error, 0);
  return parts.join(" | ");
}

/**
 * Asserts the operation is rejected and that the error matches every pattern
 * (SQLSTATE such as /23514/, constraint or trigger message). Returns the text.
 */
export async function rejects(operation: Promise<unknown>, ...expected: RegExp[]): Promise<string> {
  let error: unknown;
  try {
    await operation;
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) assert.fail(`expected the operation to be rejected (${expected.join(", ")})`);
  const text = errorText(error);
  for (const pattern of expected) assert.match(text, pattern, `unexpected error: ${text}`);
  return text;
}

export interface ScriptResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs an operator CLI (scripts/…) with the test environment, like an operator would. */
export function runScript(script: string, args: string[], stdin = ""): ScriptResult {
  const result = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), script, ...args], {
    env: process.env,
    input: stdin,
    encoding: "utf8",
  });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * MariaDB error codes used in the assertions (the PostgreSQL SQLSTATE each one
 * replaces is in brackets). Prisma maps some to its own codes (P2002, P2003).
 */
export const DBERR = {
  /** [23505] duplicate key */
  unique: /1062|P2002|UniqueConstraintViolation/,
  /** [23514] CHECK constraint failed */
  check: /4025|CONSTRAINT .* failed/,
  /** [23503] foreign key */
  foreignKey: /1451|1452|P2003|ForeignKeyConstraintViolation/,
  /** [42501] no privilege */
  // 1419: with binary logging on, trigger DDL without SUPER is refused before the privilege check.
  privilege: /1142|1143|1227|1044|1370|1419|command denied|denied to user/,
  /** [P0001] raised by a trigger (SIGNAL) */
  signal: /1644/,
  /** rejected by the app-level guards (src/server/db/guards.ts) */
  guard: /GuardError/,
} as const;
