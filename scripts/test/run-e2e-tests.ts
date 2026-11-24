// End-to-end tests of the CMS against a real production server
// (`next build --webpack` + `next start`) and a throw-away MariaDB database.
//
//   npm run test:e2e [-- --skip-build] [-- --keep] [-- --port 3301] [-- --single-user]
//                    [-- --env-test <path>] [-- --screenshots <dir>] [-- --only <name>]
//                    [-- --skip-persistence]
//
//   1. refuses unless .env.test points at a LOCAL database named *_test
//   2. creates sumenep_cms_test_e2e_<random>, migrates it, applies grants
//      (or, with --single-user, runs the website with the owner user, as on
//      Hostinger where a database has one user), tries the guard triggers,
//      seeds kanal/rubrik and bootstraps a TEST Admin (test-only password)
//   3. builds the app (unless --skip-build) and starts it on --port
//      (default 3301; never the 3200 used for local previews), with uploads in
//      a folder OUTSIDE the app directory, as production requires
//   4. runs tests/e2e/*.test.ts (HTTP + headless Chrome/Edge via playwright-core)
//   5. runs the read-only smoke test (scripts/prod/smoke.mjs) against the server
//   6. media persistence, LOCAL SIMULATION: every uploaded file is served with
//      the same bytes after a restart, and after a redeploy (.next deleted,
//      rebuilt, restarted); nothing was written inside the app directory
//   7. stops the server and drops the database it created (unless --keep)
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";

import { bootstrapAdmin } from "../../src/server/admin/bootstrap";
import { createPrismaClient } from "../../src/server/db/client";
import { seedInitialData } from "../../src/server/seed";
import { E2E_ADMIN, generateTestPassword } from "../../tests/e2e/admin";
import { finalizeDatabase } from "../db/grants";
import { describeTriggerResult, installGuardTriggers } from "../db/triggers";
import { runBin } from "../lib/bin";
import { ident, withConnection, type Connection } from "../lib/mariadb";

const { values } = parseArgs({
  options: {
    "skip-build": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    port: { type: "string", default: "3301" },
    "env-test": { type: "string", default: ".env.test" },
    screenshots: { type: "string" },
    only: { type: "string" }, // run only test files whose name contains this text
    "single-user": { type: "boolean", default: false },
    "skip-persistence": { type: "boolean", default: false },
  },
});

const NEXT_BIN = path.resolve("node_modules/next/dist/bin/next");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function stopServer(server: ChildProcess | undefined): Promise<void> {
  if (!server?.pid || server.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 15_000))]);
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

function build(): void {
  console.log("\n▶ next build --webpack");
  const result = spawnSync(process.execPath, [NEXT_BIN, "build", "--webpack"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (result.status !== 0) throw new Error(`build gagal (exit ${result.status})`);
}

/** Every file under `dir` (relative paths with "/"). */
function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

const sha256 = (bytes: Buffer | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function main(): Promise<number> {
  const envFile = path.resolve(values["env-test"]!);
  if (!fs.existsSync(envFile)) fail(`${envFile} belum ada. Jalankan dulu: npm run db:setup`);
  const base = parseEnv(fs.readFileSync(envFile, "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const url = new URL(base[key] ?? "mysql://missing/none");
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "mysql:" || !local || !url.pathname.endsWith("_test")) fail(`${key} bukan database MariaDB test lokal (mysql://…/*_test). Dibatalkan.`);
  }
  const singleUser = values["single-user"]!;
  const appUser = singleUser ? "" : (base.DB_APP_USER ?? "");
  const port = Number.parseInt(values.port!, 10);
  if (!Number.isInteger(port) || port === 3200 || port < 1024) fail("--port tidak valid (3200 dipakai pratinjau lokal).");

  const runDb = `sumenep_cms_test_e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const withDb = (url: string) => {
    const u = new URL(url);
    u.pathname = `/${runDb}`;
    return u.toString();
  };
  const directUrl = withDb(base.DIRECT_URL!);
  // Hostinger mode: the website uses the database's only user.
  const databaseUrl = singleUser ? directUrl : withDb(base.DATABASE_URL!);
  const baseUrl = `http://localhost:${port}`;
  // Fresh test-only password for this run (also read by the tests through the environment).
  process.env.E2E_ADMIN_PASSWORD = generateTestPassword("admin");

  // Uploads go to a folder OUTSIDE the app directory, exactly as production
  // requires (src/server/media/storage.ts refuses anything inside it).
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-e2e-media-"));
  const appMediaBefore = walk(path.resolve("media"));
  const asOwner = (work: (conn: Connection) => Promise<unknown>) => withConnection(base.DIRECT_URL!, work, { database: false });
  let created = false;
  let server: ChildProcess | undefined;
  const serverLog = path.resolve(`e2e-server-${port}.log`);

  const startServer = async (label: string) => {
    console.log(`\n▶ next start -p ${port} (${label})`);
    const { DIRECT_URL: _owner, ...serverEnv } = process.env; // the web server never gets the owner's URL variable
    const log = fs.openSync(serverLog, "a");
    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
      env: {
        ...serverEnv,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        SUMENEP_AUTO_SETUP: "off", // the runner migrates and seeds itself; the start-up setup is tested separately
        DATABASE_URL: databaseUrl,
        TRUSTED_PROXY_COUNT: "1",
        // Fase 4: CMS articles on /artikel/[slug], a short cache for the schedule test,
        // and uploads in a throw-away folder outside the app.
        CMS_PUBLIC_ARTICLES: "on",
        CMS_CACHE_SECONDS: "2",
        MEDIA_DRIVER: "local",
        MEDIA_ROOT: mediaRoot,
      },
      stdio: ["ignore", log, log],
    });
    await waitForServer(`${baseUrl}/admin/login`, server);
  };

  try {
    console.log(`▶ Database uji sementara: ${runDb} (${singleUser ? "mode satu user, seperti Hostinger" : "user runtime terpisah"})`);
    await asOwner((conn) => conn.query(`CREATE DATABASE ${ident(runDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`));
    created = true;

    const dbEnv = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl, DB_APP_USER: appUser };
    console.log("\n▶ Migrasi + hak akses + trigger penjaga");
    if (runBin("prisma", ["migrate", "deploy"], { env: dbEnv }) !== 0) throw new Error("migrate deploy gagal");
    console.log(await finalizeDatabase({ directUrl, databaseUrl, appUser }));
    console.log(describeTriggerResult(await installGuardTriggers(directUrl)));

    const owner = createPrismaClient(directUrl, { max: 1 });
    try {
      await seedInitialData(owner);
      await bootstrapAdmin(owner, E2E_ADMIN);
    } finally {
      await owner.$disconnect();
    }
    console.log(`▶ Admin uji dibuat: ${E2E_ADMIN.email} (hanya di database sementara)`);

    if (!values["skip-build"]) build();
    // unstable_cache entries (public CMS data) are kept on disk in
    // .next/cache/fetch-cache and outlive the server. Every run has a fresh
    // database, so it must start with an empty data cache too — otherwise a
    // redirect cached by the previous run is served (stale-while-revalidate).
    fs.rmSync(path.resolve(".next/cache/fetch-cache"), { recursive: true, force: true });
    fs.writeFileSync(serverLog, "");
    await startServer("awal");

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
        MEDIA_ROOT: mediaRoot, // tests that upload through the service write where the server reads
        E2E_SCREENSHOT_DIR: values.screenshots ? path.resolve(values.screenshots) : "",
      },
    });
    if (status !== 0) throw new Error(`pengujian end-to-end gagal (exit ${status}); log server: ${serverLog}`);

    console.log(`\n▶ Smoke test read-only (scripts/prod/smoke.mjs) pada ${baseUrl}`);
    const smoke = spawnSync(process.execPath, ["scripts/prod/smoke.mjs", "--base", baseUrl], { stdio: "inherit" });
    if (smoke.status !== 0) throw new Error("smoke test gagal");

    if (!values["skip-persistence"]) {
      console.log("\n▶ Media: SIMULASI LOKAL restart dan redeploy (bukan bukti di Hostinger)");
      const stored = walk(mediaRoot).filter((f) => f.endsWith(".webp"));
      if (stored.length === 0) throw new Error("tidak ada berkas media dari pengujian; jalankan tanpa --only");
      const expected = new Map(stored.map((key) => [key, sha256(fs.readFileSync(path.join(mediaRoot, ...key.split("/"))))]));
      const verify = async (label: string) => {
        for (const [key, hash] of expected) {
          const response = await fetch(`${baseUrl}/media/${key}`);
          if (response.status !== 200) throw new Error(`${label}: /media/${key} → ${response.status}`);
          const served = sha256(Buffer.from(await response.arrayBuffer()));
          if (served !== hash) throw new Error(`${label}: isi /media/${key} berbeda`);
        }
        if (walk(mediaRoot).filter((f) => f.endsWith(".webp")).length !== expected.size) throw new Error(`${label}: jumlah berkas berubah`);
        console.log(`  ✓ ${label}: ${expected.size} berkas tersaji dengan isi identik (SHA-256)`);
      };
      await verify("sebelum restart");
      await stopServer(server);
      await startServer("restart");
      await verify("setelah restart");
      await stopServer(server);
      const buildIdBefore = fs.readFileSync(path.resolve(".next/BUILD_ID"), "utf8");
      fs.rmSync(path.resolve(".next"), { recursive: true, force: true }); // a new release starts without the old build
      build();
      const buildIdAfter = fs.readFileSync(path.resolve(".next/BUILD_ID"), "utf8");
      if (buildIdAfter === buildIdBefore) throw new Error("build ulang menghasilkan BUILD_ID yang sama");
      await startServer("setelah redeploy");
      await verify(`setelah redeploy (.next dihapus, build baru ${buildIdAfter.trim()})`);
      const appMediaAfter = walk(path.resolve("media"));
      const writtenInApp = appMediaAfter.filter((f) => !appMediaBefore.includes(f));
      if (writtenInApp.length) throw new Error(`berkas media tertulis di dalam folder aplikasi: ${writtenInApp.join(", ")}`);
      console.log(`  ✓ tidak ada berkas media yang ditulis di dalam folder aplikasi; MEDIA_ROOT = ${mediaRoot}`);
    }
    return 0;
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await stopServer(server);
    if (created && values.keep) {
      console.log(`\nDatabase uji disimpan (--keep): ${runDb}`);
    } else if (created) {
      await asOwner((conn) => conn.query(`DROP DATABASE IF EXISTS ${ident(runDb)}`));
      console.log(`\n▶ Database uji sementara dihapus: ${runDb}`);
    }
    fs.rmSync(mediaRoot, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code));
