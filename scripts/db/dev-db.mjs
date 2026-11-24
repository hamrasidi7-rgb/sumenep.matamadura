// Local, isolated MariaDB for SUMENEP development and tests (same engine family
// as Hostinger Business hosting; tested with MariaDB 10.11 LTS).
//
//   node scripts/db/dev-db.mjs setup    create server (.data/mariadb), users, databases, .env + .env.test
//   node scripts/db/dev-db.mjs start | stop | status
//
// Binaries: $MARIADB_BIN, else .data/mariadb-<version>-winx64/bin (the official
// ZIP from archive.mariadb.org, unpacked into the git-ignored .data folder),
// else PATH. Isolation: own data directory inside the project, own port
// (DEV_DB_PORT, default 33069), bound to 127.0.0.1 only. It never touches any
// other MySQL/MariaDB server or database.
//
// Deliberately production-like:
//   - server time zone +07:00 (not UTC), so code that forgets the per-connection
//     UTC setting fails the tests instead of production;
//   - binary logging ON, as on shared hosting, so trigger creation is tested
//     under the same rules (log_bin_trust_function_creators).
//
// Users (least privilege, like the PostgreSQL roles before):
//   sumenep_owner  owns the CMS databases; runs migrations (DIRECT_URL)
//   sumenep_app    runtime user (DATABASE_URL): table-level DML only, set by
//                  scripts/db/grants.ts after every migration
// Passwords are random, written only to git-ignored files, and never printed.
// The PostgreSQL version of this script (Fase 2–4) is in git history (e4e38bf).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const DATA_ROOT = path.join(root, ".data");
const DATA = path.join(DATA_ROOT, "mariadb");
const CONFIG = path.join(DATA_ROOT, "mariadb.cnf");
const ROOT_CNF = path.join(DATA_ROOT, "mariadb-root.cnf");
const LOG = path.join(DATA_ROOT, "mariadb.log");
const PORT = Number(process.env.DEV_DB_PORT ?? 33069);
const HOST = "127.0.0.1";
const OWNER = "sumenep_owner";
const APP = "sumenep_app";
const DATABASES = { dev: "sumenep_cms_dev", test: "sumenep_cms_test" };

function binDir() {
  if (process.env.MARIADB_BIN) return process.env.MARIADB_BIN;
  if (fs.existsSync(DATA_ROOT)) {
    const dist = fs
      .readdirSync(DATA_ROOT)
      .filter((d) => /^mariadb-\d+\.\d+\.\d+/.test(d) && fs.existsSync(path.join(DATA_ROOT, d, "bin")))
      .sort()
      .pop();
    if (dist) return path.join(DATA_ROOT, dist, "bin");
  }
  return null;
}

function bin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const dir = binDir();
  return dir && fs.existsSync(path.join(dir, exe)) ? path.join(dir, exe) : name; // fall back to PATH
}

const secret = () => randomBytes(24).toString("base64url");
const sqlString = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

// SQL goes through stdin and the root password through a git-ignored option
// file, so no password appears in the process list.
function sql(statements, db = "") {
  const args = [`--defaults-extra-file=${ROOT_CNF}`, "--batch", "--skip-column-names"];
  if (db) args.push(db);
  return execFileSync(bin("mariadb"), args, { input: statements, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

function isRunning() {
  const auth = fs.existsSync(ROOT_CNF) ? [`--defaults-extra-file=${ROOT_CNF}`] : ["--protocol=TCP", `-h${HOST}`, `-P${PORT}`, "-uroot"];
  return spawnSync(bin("mariadb-admin"), [...auth, "--connect-timeout=2", "ping"], { stdio: "ignore" }).status === 0;
}

function writeConfig() {
  const posix = (p) => p.replace(/\\/g, "/");
  fs.writeFileSync(
    CONFIG,
    [
      "[mariadbd]",
      `datadir=${posix(DATA)}`,
      `port=${PORT}`,
      `bind-address=${HOST}`,
      "character-set-server=utf8mb4",
      "collation-server=utf8mb4_unicode_ci",
      "default-time-zone=+07:00",
      "log-bin=sumenep-bin",
      "server-id=1",
      "max_connections=100",
      `log-error=${posix(LOG)}`,
      "",
    ].join("\n"),
  );
}

function writeRootCnf(password) {
  fs.writeFileSync(ROOT_CNF, `[client]\nuser=root\npassword=${password}\nhost=${HOST}\nport=${PORT}\nprotocol=TCP\n`, { mode: 0o600 });
}

async function waitFor(check, label, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} — see .data/mariadb.log`);
}

async function start() {
  if (isRunning()) return console.log(`MariaDB already running on ${HOST}:${PORT}`);
  writeConfig();
  // Detached, output to the log file: the server must outlive this script.
  const child = spawn(bin("mariadbd"), [`--defaults-file=${CONFIG}`], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  await waitFor(isRunning, "MariaDB did not start");
  console.log(`MariaDB started on ${HOST}:${PORT}`);
}

async function stop() {
  if (!isRunning()) return console.log("MariaDB is not running");
  execFileSync(bin("mariadb-admin"), [`--defaults-extra-file=${ROOT_CNF}`, "shutdown"], { stdio: "ignore" });
  await waitFor(() => !isRunning(), "MariaDB did not stop");
  console.log("MariaDB stopped");
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

function writeEnvFile(file, values, drop, header) {
  const current = readEnvFile(file);
  for (const key of drop) delete current[key];
  const merged = { ...current, ...values };
  const body = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(file, `${header}\n${body}\n`, { mode: 0o600 });
}

async function setup() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  if (!fs.existsSync(path.join(DATA, "mysql"))) {
    if (process.platform === "win32") {
      execFileSync(bin("mariadb-install-db"), [`--datadir=${DATA}`, `--port=${PORT}`, "--silent"], { stdio: "pipe" });
    } else {
      execFileSync(bin("mariadb-install-db"), [`--datadir=${DATA}`, "--auth-root-authentication-method=normal", "--skip-test-db"], { stdio: "pipe" });
    }
    const rootPw = secret();
    writeRootCnf("");
    await start();
    // The fresh root account has no password: set one at once (via stdin).
    sql(`ALTER USER 'root'@'localhost' IDENTIFIED BY ${sqlString(rootPw)};`);
    writeRootCnf(rootPw);
    console.log("Server created in .data/mariadb (root password in .data/mariadb-root.cnf)");
  } else {
    console.log("Server already exists — keeping it");
    await start();
  }

  // Passwords: reuse what .env already holds for MariaDB, otherwise create.
  const envPath = path.join(root, ".env");
  const envDev = readEnvFile(envPath);
  const reuse = (url) => (url?.startsWith("mysql://") ? decodeURIComponent(new URL(url).password) : null);
  const ownerPw = reuse(envDev.DIRECT_URL) ?? secret();
  const appPw = reuse(envDev.DATABASE_URL) ?? secret();

  // The owner may create the CMS databases (and Prisma's shadow database for
  // `migrate dev`) and pass DML grants on to the runtime user.
  sql(`
    CREATE USER IF NOT EXISTS '${OWNER}'@'%' IDENTIFIED BY ${sqlString(ownerPw)};
    ALTER USER '${OWNER}'@'%' IDENTIFIED BY ${sqlString(ownerPw)};
    GRANT ALL PRIVILEGES ON \`sumenep\\_cms\\_%\`.* TO '${OWNER}'@'%' WITH GRANT OPTION;
    GRANT ALL PRIVILEGES ON \`prisma\\_migrate\\_shadow\\_db\\_%\`.* TO '${OWNER}'@'%';
    CREATE USER IF NOT EXISTS '${APP}'@'%' IDENTIFIED BY ${sqlString(appPw)};
    ALTER USER '${APP}'@'%' IDENTIFIED BY ${sqlString(appPw)};
    FLUSH PRIVILEGES;
  `);
  for (const db of Object.values(DATABASES)) {
    sql(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  }

  const url = (user, pw, db) => `mysql://${user}:${encodeURIComponent(pw)}@${HOST}:${PORT}/${db}`;
  if (envDev.DIRECT_URL?.startsWith("postgresql://") && !fs.existsSync(`${envPath}.postgresql.bak`)) {
    fs.copyFileSync(envPath, `${envPath}.postgresql.bak`); // keep the old PostgreSQL settings (git-ignored)
  }
  const drop = ["DB_APP_ROLE"];
  writeEnvFile(
    envPath,
    { DATABASE_URL: url(APP, appPw, DATABASES.dev), DIRECT_URL: url(OWNER, ownerPw, DATABASES.dev), DB_APP_USER: APP },
    drop,
    "# Development database (local MariaDB, isolated). Generated by scripts/db/dev-db.mjs — never commit.",
  );
  writeEnvFile(
    path.join(root, ".env.test"),
    { DATABASE_URL: url(APP, appPw, DATABASES.test), DIRECT_URL: url(OWNER, ownerPw, DATABASES.test), DB_APP_USER: APP },
    drop,
    "# Test database (local MariaDB, isolated, reset by the tests). Generated by scripts/db/dev-db.mjs — never commit.",
  );
  console.log(`Databases ready: ${Object.values(DATABASES).join(", ")} — URLs written to .env and .env.test`);
}

function status() {
  console.log(`server data: ${fs.existsSync(path.join(DATA, "mysql")) ? ".data/mariadb" : "not created"}`);
  console.log(`binaries:    ${binDir() ?? "(PATH)"}`);
  const running = isRunning();
  console.log(`server:      ${running ? `running on ${HOST}:${PORT}` : "stopped"}`);
  if (running && fs.existsSync(ROOT_CNF)) {
    console.log(`version:     ${sql("SELECT VERSION();").trim()}`);
    console.log(`databases:   ${sql("SELECT GROUP_CONCAT(schema_name SEPARATOR ', ') FROM information_schema.schemata WHERE schema_name LIKE 'sumenep%';").trim()}`);
  }
}

// Lets non-SUPER users create triggers despite binary logging (MariaDB's
// log_bin_trust_function_creators). Off by default, like shared hosting; turn it
// on to test the database-level guard triggers too. Resets when the server restarts.
function triggersAllowed() {
  const value = process.argv[3];
  if (value !== "on" && value !== "off") throw new Error("usage: node scripts/db/dev-db.mjs triggers-allowed on|off");
  sql(`SET GLOBAL log_bin_trust_function_creators = ${value === "on" ? 1 : 0};`);
  console.log(`log_bin_trust_function_creators = ${sql("SELECT @@global.log_bin_trust_function_creators;").trim()}`);
}

const commands = { setup, start, stop, status, "triggers-allowed": triggersAllowed };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error("usage: node scripts/db/dev-db.mjs setup|start|stop|status|triggers-allowed on|off");
  process.exit(1);
}
Promise.resolve(commands[cmd]()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
