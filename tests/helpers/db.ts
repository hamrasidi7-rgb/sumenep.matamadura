import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import { createPrismaClient } from "@/server/db/client";

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

/**
 * Empty every table between test files. Emptying activity_log needs the owner to
 * switch its append-only trigger off for the length of this one transaction —
 * something only the table owner can do (tests/db/04 shows the app role cannot).
 */
export async function resetData(owner: PrismaClient): Promise<void> {
  await owner.$transaction([
    owner.$executeRawUnsafe(`ALTER TABLE "activity_log" DISABLE TRIGGER "activity_log_append_only"`),
    owner.$executeRawUnsafe(`TRUNCATE ${DATA_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`),
    owner.$executeRawUnsafe(`ALTER TABLE "activity_log" ENABLE TRIGGER "activity_log_append_only"`),
    owner.$executeRawUnsafe(`INSERT INTO "homepage_settings" ("id", "updated_at") VALUES (1, now())`),
    owner.$executeRawUnsafe(`INSERT INTO "site_settings" ("id", "updated_at") VALUES (1, now())`),
  ]);
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

/** SQLSTATE codes used in the assertions. */
export const SQLSTATE = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  insufficientPrivilege: "42501",
  raiseException: "P0001",
} as const;
