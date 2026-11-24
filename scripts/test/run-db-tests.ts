// Database test suite (MariaDB). Every run gets its own throw-away database:
//
//   1. refuses unless .env.test points at a LOCAL database named *_test
//   2. creates a fresh database  sumenep_cms_test_run_<random>  (nothing else is touched)
//   3. applies the migrations to it (prisma migrate deploy — non-destructive)
//   4. applies the runtime-user grants and tries to install the guard triggers
//      (tests know from SUMENEP_TEST_TRIGGERS whether the trigger layer is there)
//   5. checks schema.prisma and the migrated database are identical (no drift)
//   6. runs tests/db/*.test.ts one file at a time
//   7. drops the database it created in step 2 (keep it with --keep)
//
//   npm run test:db [-- --keep] [-- --single-user]
//
// --single-user: the runtime connection uses the owner user, as on Hostinger
// where hPanel gives a database exactly one user (no separate runtime user).
//
// Trigger layer: the local server runs with binary logging like shared hosting,
// so by default the owner cannot create triggers (MariaDB 1419) and the suite
// runs in "app guards only" mode. To run it with triggers too:
//   node scripts/db/dev-db.mjs triggers-allowed on && npm run test:db && node scripts/db/dev-db.mjs triggers-allowed off
//
// No existing database is ever reset or dropped by this script.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";

import { finalizeDatabase } from "../db/grants";
import { describeTriggerResult, installGuardTriggers } from "../db/triggers";
import { runBin } from "../lib/bin";
import { ident, withConnection, type Connection } from "../lib/mariadb";

const { values } = parseArgs({
  options: { keep: { type: "boolean", default: false }, "single-user": { type: "boolean", default: false } },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Refuses anything but local MariaDB test databases (*_test). */
export function checkTestEnv(base: Record<string, string | undefined>): void {
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const url = new URL(base[key] ?? "mysql://missing/none");
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "mysql:" || !local || !url.pathname.endsWith("_test")) {
      fail(`${key} di .env.test bukan database MariaDB test lokal (mysql://…/*_test). Dibatalkan.`);
    }
  }
}

async function main(): Promise<number> {
  const envFile = path.resolve(".env.test");
  if (!fs.existsSync(envFile)) fail(".env.test belum ada. Jalankan dulu: npm run db:setup");
  const base = parseEnv(fs.readFileSync(envFile, "utf8"));
  checkTestEnv(base);

  const runDb = `sumenep_cms_test_run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const withDb = (url: string) => {
    const u = new URL(url);
    u.pathname = `/${runDb}`;
    return u.toString();
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...base,
    DATABASE_URL: withDb(values["single-user"] ? base.DIRECT_URL! : base.DATABASE_URL!),
    DB_APP_USER: values["single-user"] ? "" : base.DB_APP_USER,
    DIRECT_URL: withDb(base.DIRECT_URL!),
    NODE_ENV: "test",
  };
  const step = (label: string, name: "prisma" | "tsx", args: string[], extra: Record<string, string> = {}) => {
    console.log(`\n▶ ${label}`);
    const status = runBin(name, args, { env: { ...env, ...extra } });
    if (status !== 0) throw new Error(`${label} gagal (exit ${status})`);
  };

  // The owner connects without a default database only to create/drop the run database.
  const asOwner = (work: (conn: Connection) => Promise<unknown>) => withConnection(base.DIRECT_URL!, work, { database: false });
  let created = false;
  try {
    console.log(`▶ Database uji sementara: ${runDb} (${values["single-user"] ? "mode satu user, seperti Hostinger" : "user runtime terpisah"})`);
    await asOwner((conn) => conn.query(`CREATE DATABASE ${ident(runDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`));
    created = true;

    step("Migrasi (prisma migrate deploy)", "prisma", ["migrate", "deploy"]);
    console.log(`\n▶ Hak akses user runtime\n${await finalizeDatabase({ directUrl: env.DIRECT_URL!, databaseUrl: env.DATABASE_URL, appUser: env.DB_APP_USER })}`);
    const triggers = await installGuardTriggers(env.DIRECT_URL!);
    console.log(`\n▶ Trigger penjaga\n${describeTriggerResult(triggers)}`);
    step("schema.prisma = database hasil migrasi (tanpa drift)", "prisma", [
      "migrate",
      "diff",
      "--from-url",
      env.DIRECT_URL!,
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--exit-code",
    ]);
    const files = fs
      .readdirSync("tests/db")
      .filter((f) => f.endsWith(".test.ts"))
      .sort()
      .map((f) => `tests/db/${f}`);
    step(`Pengujian database (${files.length} file, trigger ${triggers.installed ? "ON" : "OFF"})`, "tsx", ["--test", "--test-concurrency=1", ...files], {
      SUMENEP_TEST_TRIGGERS: triggers.installed ? "on" : "off",
    });
    return 0;
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (created && values.keep) {
      console.log(`\nDatabase uji disimpan (--keep): ${runDb}`);
    } else if (created) {
      await asOwner((conn) => conn.query(`DROP DATABASE IF EXISTS ${ident(runDb)}`));
      console.log(`\n▶ Database uji sementara dihapus: ${runDb}`);
    }
  }
}

const isMain = process.argv[1] && /run-db-tests\.ts$/.test(process.argv[1]);
if (isMain) main().then((code) => process.exit(code));
