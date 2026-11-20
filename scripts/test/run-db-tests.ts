// Database test suite. Every run gets its own throw-away database:
//
//   1. refuses unless .env.test points at a LOCAL database named *_test
//   2. creates a fresh database  sumenep_cms_test_run_<random>  (nothing else is touched)
//   3. applies the migrations to it (prisma migrate deploy — non-destructive)
//   4. applies the runtime-role grants
//   5. checks schema.prisma and the migrated database are identical (no drift)
//   6. runs tests/db/*.test.ts one file at a time
//   7. drops the database it created in step 2 (keep it with --keep)
//
//   npm run test:db [-- --keep]
//
// No existing database is ever reset or dropped by this script.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";

import { createPrismaClient } from "../../src/server/db/client";
import { runBin } from "../lib/bin";

const { values } = parseArgs({ options: { keep: { type: "boolean", default: false } } });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<number> {
  const envFile = path.resolve(".env.test");
  if (!fs.existsSync(envFile)) fail(".env.test belum ada. Jalankan dulu: npm run db:setup");
  const base = parseEnv(fs.readFileSync(envFile, "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const url = new URL(base[key] ?? "postgresql://missing/none");
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!local || !url.pathname.endsWith("_test")) fail(`${key} di .env.test bukan database test lokal (*_test). Dibatalkan.`);
  }
  const appRole = base.DB_APP_ROLE ?? "";
  if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) fail("DB_APP_ROLE di .env.test tidak valid.");

  const runDb = `sumenep_cms_test_run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const withDb = (url: string) => {
    const u = new URL(url);
    u.pathname = `/${runDb}`;
    return u.toString();
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...base,
    DATABASE_URL: withDb(base.DATABASE_URL!),
    DIRECT_URL: withDb(base.DIRECT_URL!),
    NODE_ENV: "test",
  };
  const step = (label: string, name: "prisma" | "tsx", args: string[]) => {
    console.log(`\n▶ ${label}`);
    const status = runBin(name, args, { env });
    if (status !== 0) throw new Error(`${label} gagal (exit ${status})`);
  };

  // The owner connects to the base test database only to create/drop the run database.
  const admin = createPrismaClient(base.DIRECT_URL!, { max: 1 });
  let created = false;
  try {
    console.log(`▶ Database uji sementara: ${runDb}`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${runDb}" ENCODING 'UTF8' TEMPLATE template0`);
    created = true;
    await admin.$executeRawUnsafe(`REVOKE ALL ON DATABASE "${runDb}" FROM PUBLIC`);
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${runDb}" TO CURRENT_USER, "${appRole}"`);

    step("Migrasi (prisma migrate deploy)", "prisma", ["migrate", "deploy"]);
    step("Hak akses role aplikasi", "tsx", ["scripts/db/grants.ts", "--yes"]);
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
    step(`Pengujian database (${files.length} file)`, "tsx", ["--test", "--test-concurrency=1", ...files]);
    return 0;
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (created && values.keep) {
      console.log(`\nDatabase uji disimpan (--keep): ${runDb}`);
    } else if (created) {
      // Only the database this run created; FORCE closes leftover connections.
      await admin.$executeRawUnsafe(`DROP DATABASE "${runDb}" WITH (FORCE)`);
      console.log(`\n▶ Database uji sementara dihapus: ${runDb}`);
    }
    await admin.$disconnect();
  }
}

main().then((code) => process.exit(code));
