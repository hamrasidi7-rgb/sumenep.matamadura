// Local, isolated PostgreSQL 16 for SUMENEP development and tests.
//
//   node scripts/db/dev-db.mjs setup    create cluster (.data/postgres), roles, databases, .env + .env.test
//   node scripts/db/dev-db.mjs start | stop | status
//
// Isolation: own data directory inside the project (git-ignored), own port
// (DEV_DB_PORT, default 54329), bound to 127.0.0.1 only, scram-sha-256 auth.
// It never touches the system PostgreSQL service or any other database.
//
// Roles (least privilege):
//   sumenep_owner  owns the databases; runs Prisma migrations (DIRECT_URL)
//   sumenep_app    runtime role used by the app (DATABASE_URL): DML only, cannot
//                  alter tables or triggers, and has no UPDATE/DELETE/TRUNCATE on
//                  activity_log (see scripts/db/grants.ts)
// Both databases run their sessions in UTC.
//
// Passwords are random, written only to git-ignored files, and never printed.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const DATA = path.join(root, ".data", "postgres");
const LOG = path.join(root, ".data", "postgres.log");
const SUPERUSER_PWFILE = path.join(root, ".data", "postgres-superuser.pwd");
const PORT = Number(process.env.DEV_DB_PORT ?? 54329);
const HOST = "127.0.0.1";
const SUPERUSER = "sumenep_superuser";
const OWNER = "sumenep_owner";
const APP = "sumenep_app";
const DATABASES = { dev: "sumenep_cms_dev", test: "sumenep_cms_test" };

function pgBin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    process.env.PG_BIN && path.join(process.env.PG_BIN, exe),
    process.platform === "win32" && path.join("C:/Program Files/PostgreSQL/16/bin", exe),
    "/usr/lib/postgresql/16/bin/" + name,
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  return found ?? name; // fall back to PATH
}

const secret = () => randomBytes(24).toString("base64url");
const superPassword = () => fs.readFileSync(SUPERUSER_PWFILE, "utf8").trim();

function run(bin, args, opts = {}) {
  const stdin = opts.input === undefined ? "ignore" : "pipe";
  return execFileSync(pgBin(bin), args, { stdio: [stdin, "pipe", "pipe"], ...opts }).toString();
}

// SQL goes through stdin, so role passwords never appear in the process list.
function psql(sql, db = "postgres") {
  return run("psql", ["-h", HOST, "-p", String(PORT), "-U", SUPERUSER, "-d", db, "-v", "ON_ERROR_STOP=1", "-Atq", "-f", "-"], {
    env: { ...process.env, PGPASSWORD: superPassword() },
    input: sql,
  });
}

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

function isRunning() {
  return spawnSync(pgBin("pg_isready"), ["-h", HOST, "-p", String(PORT)], { stdio: "ignore" }).status === 0;
}

function start() {
  if (isRunning()) return console.log(`PostgreSQL already running on ${HOST}:${PORT}`);
  // stdio must be "ignore": the server would otherwise inherit our pipes and
  // execFileSync would wait for them forever. Server output goes to LOG.
  const r = spawnSync(pgBin("pg_ctl"), ["-D", DATA, "-l", LOG, "-o", `-p ${PORT} -c listen_addresses=${HOST}`, "-w", "start"], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (r.status !== 0 || !isRunning()) throw new Error(`pg_ctl start failed (exit ${r.status}) — see .data/postgres.log`);
  console.log(`PostgreSQL started on ${HOST}:${PORT}`);
}

function stop() {
  if (!isRunning()) return console.log("PostgreSQL is not running");
  run("pg_ctl", ["-D", DATA, "-m", "fast", "-w", "stop"]);
  console.log("PostgreSQL stopped");
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

function upsertEnvFile(file, values, header) {
  const current = readEnvFile(file);
  const merged = { ...current, ...values };
  const body = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(file, `${header}\n${body}\n`, { mode: 0o600 });
}

function setup() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });

  if (!fs.existsSync(path.join(DATA, "PG_VERSION"))) {
    fs.writeFileSync(SUPERUSER_PWFILE, secret(), { mode: 0o600 });
    run("initdb", ["-D", DATA, "-U", SUPERUSER, `--pwfile=${SUPERUSER_PWFILE}`, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C"]);
    console.log("Cluster created in .data/postgres (superuser password in .data/postgres-superuser.pwd)");
  } else {
    console.log("Cluster already exists — keeping it");
  }
  start();

  // Passwords: reuse what .env / .env.test already hold, otherwise create.
  const envDev = readEnvFile(path.join(root, ".env"));
  const reuse = (url) => (url ? decodeURIComponent(new URL(url).password) : null);
  const ownerPw = reuse(envDev.DIRECT_URL) ?? secret();
  const appPw = reuse(envDev.DATABASE_URL) ?? secret();

  const roleSql = (role, pw, extra) =>
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
         CREATE ROLE ${role} LOGIN ${extra} PASSWORD ${sqlString(pw)};
       ELSE
         ALTER ROLE ${role} LOGIN ${extra} PASSWORD ${sqlString(pw)};
       END IF;
     END $$;`;
  // CREATEDB only for the owner, and only in development: `prisma migrate dev`
  // needs a temporary shadow database. Production owners do not need it.
  psql(roleSql(OWNER, ownerPw, "CREATEDB NOSUPERUSER NOCREATEROLE"));
  psql(roleSql(APP, appPw, "NOCREATEDB NOSUPERUSER NOCREATEROLE"));

  for (const db of Object.values(DATABASES)) {
    const exists = psql(`SELECT 1 FROM pg_database WHERE datname = '${db}'`).trim() === "1";
    if (!exists) psql(`CREATE DATABASE ${db} OWNER ${OWNER} ENCODING 'UTF8' TEMPLATE template0`);
    psql(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC; GRANT CONNECT ON DATABASE ${db} TO ${OWNER}, ${APP};`);
    // Sessions in UTC: the Prisma pg adapter assumes it (see scripts/db/grants.ts).
    psql(`ALTER DATABASE ${db} SET "TimeZone" TO 'UTC'`);
    // Tables created later by the owner (migrations) become usable by the app role.
    psql(
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC;
       GRANT USAGE ON SCHEMA public TO ${APP};
       ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP};
       ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP};`,
      db,
    );
  }

  const url = (user, pw, db) => `postgresql://${user}:${encodeURIComponent(pw)}@${HOST}:${PORT}/${db}?schema=public`;
  upsertEnvFile(
    path.join(root, ".env"),
    {
      DATABASE_URL: url(APP, appPw, DATABASES.dev),
      DIRECT_URL: url(OWNER, ownerPw, DATABASES.dev),
      DB_APP_ROLE: APP,
    },
    "# Development database (local, isolated). Generated by scripts/db/dev-db.mjs — never commit.",
  );
  upsertEnvFile(
    path.join(root, ".env.test"),
    {
      DATABASE_URL: url(APP, appPw, DATABASES.test),
      DIRECT_URL: url(OWNER, ownerPw, DATABASES.test),
      DB_APP_ROLE: APP,
    },
    "# Test database (local, isolated, reset by the tests). Generated by scripts/db/dev-db.mjs — never commit.",
  );
  console.log(`Databases ready: ${Object.values(DATABASES).join(", ")} — URLs written to .env and .env.test`);
}

function status() {
  console.log(`cluster: ${fs.existsSync(path.join(DATA, "PG_VERSION")) ? ".data/postgres" : "not created"}`);
  console.log(`server:  ${isRunning() ? `running on ${HOST}:${PORT}` : "stopped"}`);
  if (isRunning() && fs.existsSync(SUPERUSER_PWFILE)) {
    console.log(`version: ${psql("SHOW server_version").trim()}`);
    console.log(`databases: ${psql(`SELECT string_agg(datname, ', ') FROM pg_database WHERE datname LIKE 'sumenep_%'`).trim()}`);
  }
}

const commands = { setup, start, stop, status };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error("usage: node scripts/db/dev-db.mjs setup|start|stop|status");
  process.exit(1);
}
commands[cmd]();
