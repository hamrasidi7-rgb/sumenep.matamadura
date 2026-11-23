// End-to-end tests of the CMS authentication against a real production server
// (`next build --webpack` + `next start`) and a throw-away database.
//
//   npm run test:e2e [-- --skip-build] [-- --keep] [-- --port 3301]
//                    [-- --env-test <path>] [-- --screenshots <dir>] [-- --only <name>]
//
//   1. refuses unless .env.test points at a LOCAL database named *_test
//   2. creates sumenep_cms_test_e2e_<random>, migrates it, applies grants,
//      seeds kanal/rubrik and bootstraps a TEST Admin (test-only password)
//   3. builds the app (unless --skip-build) and starts it on --port
//      (default 3301; never the 3200 used for local previews)
//   4. runs tests/e2e/*.test.ts (HTTP + headless Chrome/Edge via playwright-core)
//   5. stops the server and drops the database it created (unless --keep)
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";

import { bootstrapAdmin } from "../../src/server/admin/bootstrap";
import { createPrismaClient } from "../../src/server/db/client";
import { seedInitialData } from "../../src/server/seed";
import { E2E_ADMIN, generateTestPassword } from "../../tests/e2e/admin";
import { finalizeDatabase } from "../db/grants";
import { runBin } from "../lib/bin";

const { values } = parseArgs({
  options: {
    "skip-build": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    port: { type: "string", default: "3301" },
    "env-test": { type: "string", default: ".env.test" },
    screenshots: { type: "string" },
    only: { type: "string" }, // run only test files whose name contains this text
  },
});

const NEXT_BIN = path.resolve("node_modules/next/dist/bin/next");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function stopServer(server: ChildProcess | undefined): void {
  if (!server?.pid || server.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}

async function waitForServer(url: string, server: ChildProcess, timeoutMs = 90_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`next start berhenti (exit ${server.exitCode})`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server tidak siap dalam ${timeoutMs / 1000} detik`);
}

async function main(): Promise<number> {
  const envFile = path.resolve(values["env-test"]!);
  if (!fs.existsSync(envFile)) fail(`${envFile} belum ada. Jalankan dulu: npm run db:setup`);
  const base = parseEnv(fs.readFileSync(envFile, "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const url = new URL(base[key] ?? "postgresql://missing/none");
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!local || !url.pathname.endsWith("_test")) fail(`${key} bukan database test lokal (*_test). Dibatalkan.`);
  }
  const appRole = base.DB_APP_ROLE ?? "";
  if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) fail("DB_APP_ROLE tidak valid.");
  const port = Number.parseInt(values.port!, 10);
  if (!Number.isInteger(port) || port === 3200 || port < 1024) fail("--port tidak valid (3200 dipakai pratinjau lokal).");

  const runDb = `sumenep_cms_test_e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const withDb = (url: string) => {
    const u = new URL(url);
    u.pathname = `/${runDb}`;
    return u.toString();
  };
  const databaseUrl = withDb(base.DATABASE_URL!);
  const directUrl = withDb(base.DIRECT_URL!);
  const baseUrl = `http://localhost:${port}`;
  // Fresh test-only password for this run (also read by the tests through the environment).
  process.env.E2E_ADMIN_PASSWORD = generateTestPassword("admin");

  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-e2e-media-"));
  const admin = createPrismaClient(base.DIRECT_URL!, { max: 1 });
  let created = false;
  let server: ChildProcess | undefined;
  const serverLog = path.resolve(`e2e-server-${port}.log`);
  try {
    console.log(`▶ Database uji sementara: ${runDb}`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${runDb}" ENCODING 'UTF8' TEMPLATE template0`);
    created = true;
    await admin.$executeRawUnsafe(`REVOKE ALL ON DATABASE "${runDb}" FROM PUBLIC`);
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${runDb}" TO CURRENT_USER, "${appRole}"`);

    const dbEnv = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl, DB_APP_ROLE: appRole };
    console.log("\n▶ Migrasi + hak akses");
    if (runBin("prisma", ["migrate", "deploy"], { env: dbEnv }) !== 0) throw new Error("migrate deploy gagal");
    console.log(await finalizeDatabase({ directUrl, databaseUrl, appRole }));

    const owner = createPrismaClient(directUrl, { max: 1 });
    try {
      await seedInitialData(owner);
      await bootstrapAdmin(owner, E2E_ADMIN);
    } finally {
      await owner.$disconnect();
    }
    console.log(`▶ Admin uji dibuat: ${E2E_ADMIN.email} (hanya di database sementara)`);

    if (!values["skip-build"]) {
      console.log("\n▶ next build --webpack");
      const build = spawnSync(process.execPath, [NEXT_BIN, "build", "--webpack"], {
        stdio: "inherit",
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      });
      if (build.status !== 0) throw new Error(`build gagal (exit ${build.status})`);
    }

    // unstable_cache entries (public CMS data) are kept on disk in
    // .next/cache/fetch-cache and outlive the server. Every run has a fresh
    // database, so it must start with an empty data cache too — otherwise a
    // redirect cached by the previous run is served (stale-while-revalidate).
    fs.rmSync(path.resolve(".next/cache/fetch-cache"), { recursive: true, force: true });

    console.log(`\n▶ next start -p ${port}`);
    const { DIRECT_URL: _owner, ...serverEnv } = process.env; // the web server never gets owner credentials
    const log = fs.openSync(serverLog, "w");
    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
      env: {
        ...serverEnv,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: databaseUrl,
        TRUSTED_PROXY_COUNT: "1",
        // Fase 4: CMS articles on /artikel/[slug], a short cache for the schedule test,
        // and uploads in a throw-away folder.
        CMS_PUBLIC_ARTICLES: "on",
        CMS_CACHE_SECONDS: "2",
        MEDIA_DRIVER: "local",
        SUMENEP_LOCAL_MEDIA_FOR_E2E_ONLY: "1",
        MEDIA_ROOT: mediaRoot,
      },
      stdio: ["ignore", log, log],
    });
    await waitForServer(`${baseUrl}/admin/login`, server);

    const files = fs
      .readdirSync("tests/e2e")
      .filter((f) => f.endsWith(".test.ts") && (!values.only || f.includes(values.only)))
      .sort()
      .map((f) => `tests/e2e/${f}`);
    console.log(`\n▶ Pengujian end-to-end (${files.length} file) pada ${baseUrl}`);
    const status = runBin("tsx", ["--test", "--test-concurrency=1", ...files], {
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrl,
        MEDIA_DRIVER: "local",
        SUMENEP_LOCAL_MEDIA_FOR_E2E_ONLY: "1",
        MEDIA_ROOT: mediaRoot, // tests that upload through the service write where the server reads
        E2E_SCREENSHOT_DIR: values.screenshots ? path.resolve(values.screenshots) : "",
      },
    });
    if (status !== 0) throw new Error(`pengujian end-to-end gagal (exit ${status}); log server: ${serverLog}`);
    return 0;
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    stopServer(server);
    if (created && values.keep) {
      console.log(`\nDatabase uji disimpan (--keep): ${runDb}`);
    } else if (created) {
      await admin.$executeRawUnsafe(`DROP DATABASE "${runDb}" WITH (FORCE)`);
      console.log(`\n▶ Database uji sementara dihapus: ${runDb}`);
    }
    await admin.$disconnect();
    fs.rmSync(mediaRoot, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code));
