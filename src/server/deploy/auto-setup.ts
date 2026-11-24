// SUMENEP · Persiapan otomatis saat server production start (dipanggil dari
// src/instrumentation.ts). Menggantikan langkah operator lewat SSH: server
// sendiri yang menyiapkan database SUMENEP dan folder media.
//
//   1. DATABASE_URL dibaca toleran (src/server/db/url.ts), lalu terhubung ke
//      database itu saja.
//   2. Pengaman: bila database berisi tabel yang bukan milik SUMENEP (mis.
//      database WordPress), semua langkah database dihentikan tanpa mengubah apa pun.
//   3. prisma migrate deploy: hanya menerapkan migrasi yang belum ada; tidak
//      pernah mereset atau menghapus data.
//   4. Data awal (kanal/rubrik, profil Redaksi, pengaturan): satu kali saja.
//   5. Akun Admin dari ADMIN_EMAIL + ADMIN_PASSWORD (opsional ADMIN_NAME), hanya
//      bila belum ada Admin. Admin yang sudah ada tidak pernah diubah.
//   6. Folder media dibuat bila belum ada, lalu diuji tulis.
//
// Tidak pernah menghentikan server: hasil tiap langkah dicatat di log
// ("[sumenep-setup]") dan di /api/status tanpa nilai rahasia.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import mariadb from "mariadb";

import { adminExists, bootstrapAdmin } from "@/server/admin/bootstrap";
import { createPrismaClient, poolConfig, SESSION_SETUP_SQL } from "@/server/db/client";
import { canonicalDatabaseUrl, configuredDatabaseParts, type DatabaseParts, isLocalHost, runtimeDatabaseUrl } from "@/server/db/url";
import { resolveStorageSelection } from "@/server/media/storage";
import { seedInitialData } from "@/server/seed";
import { adminBootstrapSchema, firstIssue } from "@/server/validation/admin";

import { setupStatus, type StepState } from "./status";

const log = (message: string) => console.log(`[sumenep-setup] ${message}`);

let hide: string[] = []; // database name/user: never shown on the public status page

function clean(text: string): string {
  let out = String(text).replace(/mysql:\/\/[^\s@]*@/gi, "mysql://<kredensial>@");
  for (const value of hide) if (value) out = out.split(value).join("<…>");
  return out.slice(0, 300);
}

function step(name: string, state: StepState, note: string) {
  const entry = { name, state, note: clean(note) };
  setupStatus().steps.push(entry);
  log(`${name}: ${state} — ${entry.note}`);
}

/** Search cwd and up to 3 parent directories for a relative path. */
function findInAncestors(relPath: string, cwd = process.cwd()): string | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, relPath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findPrismaCli(cwd = process.cwd()): string | null {
  return (
    findInAncestors(path.join("node_modules", "prisma", "build", "index.js"), cwd) ??
    findInAncestors(path.join("node_modules", ".bin", "prisma"), cwd)
  );
}

/** Tables the SUMENEP migrations create (from prisma/migrations), plus Prisma's own. */
function sumenepTables(cwd = process.cwd()): Set<string> {
  const names = new Set(["_prisma_migrations", "zz_sumenep_probe"]);
  const dir = findInAncestors(path.join("prisma", "migrations"), cwd);
  if (!dir) return names;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name, "migration.sql");
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    for (const [, name] of fs.readFileSync(file, "utf8").matchAll(/CREATE TABLE `([A-Za-z0-9_]+)`/g)) names.add(name);
  }
  return names;
}

function describeDbError(error: unknown): string {
  const e = error as { errno?: number; code?: string };
  switch (e.errno) {
    case 1045:
      return "login database ditolak: user atau password database salah";
    case 1044:
      return "user database tidak punya akses ke database itu";
    case 1049:
      return "nama database tidak ada";
    case 1130:
      return "server database menolak koneksi dari aplikasi ini";
    case 1040:
    case 1203:
    case 1226:
      return "batas koneksi database tercapai";
  }
  return `server database tidak bisa dihubungi (${e.code ?? e.errno ?? "tidak diketahui"})`;
}

function migrateDeploy(url: string): Promise<{ ok: boolean; note: string }> {
  const cli = findPrismaCli();
  if (!cli) return Promise.resolve({ ok: false, note: "Prisma CLI tidak ditemukan di node_modules" });
  const schema = findInAncestors(path.join("prisma", "schema.prisma"));
  const runCwd = schema ? path.dirname(path.dirname(schema)) : process.cwd();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "migrate", "deploy"], {
      cwd: runCwd,
      env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 180_000);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, note: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (code !== 0) return resolve({ ok: false, note: `prisma migrate deploy gagal: ${lines.slice(-3).join(" | ")}` });
      const applied = lines.filter((l) => /^Applying migration/i.test(l)).length;
      resolve({ ok: true, note: applied ? `${applied} migrasi diterapkan` : "tidak ada migrasi baru" });
    });
  });
}

// Where MariaDB's local socket usually lives. Some hosting accounts only accept
// 'user'@'localhost', which matches a socket connection but not TCP from 127.0.0.1.
const SOCKETS = ["/var/lib/mysql/mysql.sock", "/run/mysqld/mysqld.sock", "/var/run/mysqld/mysqld.sock", "/tmp/mysql.sock"];

async function listTables(url: string): Promise<string[]> {
  const { host, port, user, password, database, ssl, socketPath } = poolConfig(url);
  const conn = await mariadb.createConnection({ host, port, user, password, database, ssl, socketPath, connectTimeout: 15_000 });
  try {
    await conn.query(SESSION_SETUP_SQL);
    const rows: Array<{ name: string }> = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
    return rows.map((r) => String(r.name));
  } finally {
    await conn.end().catch(() => {});
  }
}

/** Value-free hints for a refused login: what the server saw, and common typing mistakes. */
function loginHints(error: unknown, parts: DatabaseParts, socketsTried: number): string {
  const hints: string[] = [];
  const e = error as { sqlMessage?: string; message?: string };
  const seen = /'[^']*'@'([^']*)'.*using password: (YES|NO)/i.exec(e.sqlMessage ?? e.message ?? "");
  if (seen) hints.push(`server melihat koneksi dari ${seen[1]}, password ${seen[2].toUpperCase() === "YES" ? "dikirim" : "TIDAK dikirim"}`);
  const pw = parts.password;
  if (pw !== pw.trim()) hints.push("password diawali atau diakhiri spasi");
  if (/^[•●*·∙⋅]+$/.test(pw)) hints.push("password berisi tanda samaran (●●● atau ***), bukan password asli");
  else if (/[^\x20-\x7E]/.test(pw)) hints.push("password memuat karakter di luar huruf/angka/simbol biasa (mungkin ikut tersalin)");
  if (process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD) hints.push("password database sama dengan ADMIN_PASSWORD (mungkin tertukar)");
  if (pw === parts.user || pw === parts.database) hints.push("password sama dengan nama user/database");
  if (parts.user !== parts.user.trim()) hints.push("nama user diawali atau diakhiri spasi");
  if (/[A-Z]/.test(parts.user)) hints.push("nama user memuat huruf besar (user database Hostinger huruf kecil)");
  if (parts.user === parts.database) hints.push("nama user sama persis dengan nama database: cocokkan dengan kolom MySQL user di hPanel");
  try {
    const account = os.userInfo().username;
    if (/^u\d+$/.test(account)) {
      if (!parts.user.startsWith(`${account}_`)) hints.push("nama user database tidak diawali nama akun hosting");
      if (!parts.database.startsWith(`${account}_`)) hints.push("nama database tidak diawali nama akun hosting");
    }
  } catch {
    // no account name available: skip the prefix hints
  }
  if (!isLocalHost(parts.host) && !parts.socket) {
    hints.push("host database diisi nama server; untuk aplikasi Node.js di akun yang sama dokumentasi Hostinger memakai 127.0.0.1 (DB_HOST dikosongkan)");
  } else {
    hints.push(socketsTried ? `jalur socket lokal juga dicoba (${socketsTried}) dan ditolak` : "tidak ada socket lokal untuk dicoba");
  }
  return ` (${hints.join("; ")})`;
}

async function databaseSteps() {
  let url: string;
  let parts: DatabaseParts;
  try {
    url = runtimeDatabaseUrl();
    parts = configuredDatabaseParts()!;
    hide = [parts.database, parts.user];
  } catch (e) {
    step("Konfigurasi database", "error", e instanceof Error ? e.message : String(e));
    return;
  }

  let tables: string[] | null = null;
  let route = "";
  try {
    tables = await listTables(url);
  } catch (firstError) {
    const refused = [1045, 1130].includes((firstError as { errno?: number }).errno ?? 0);
    const local = !parts.socket && isLocalHost(parts.host);
    const sockets = refused && local ? SOCKETS.filter((s) => fs.existsSync(s)) : [];
    for (const socket of sockets) {
      const candidate = canonicalDatabaseUrl({ ...parts, socket });
      try {
        tables = await listTables(candidate);
        url = candidate;
        route = "lewat socket lokal; ";
        // The web app's own client (src/server/db/index.ts) follows the same route from now on.
        process.env.DB_SOCKET = socket;
        const cached = globalThis as unknown as { sumenepDb?: { $disconnect(): Promise<void> } };
        await cached.sumenepDb?.$disconnect().catch(() => {});
        cached.sumenepDb = undefined;
        break;
      } catch {
        // try the next socket
      }
    }
    if (!tables) {
      step("Koneksi database", "error", describeDbError(firstError) + (refused ? loginHints(firstError, parts, sockets.length) : ""));
      return;
    }
  }
  const own = sumenepTables();
  const foreign = tables.filter((t) => !own.has(t));
  if (foreign.length) {
    step("Koneksi database", "error", `database berisi ${foreign.length} tabel yang bukan milik SUMENEP (mungkin database WordPress); setup database dihentikan tanpa mengubah apa pun`);
    return;
  }
  step("Koneksi database", "ok", `terhubung; ${route}${tables.length ? `${tables.length} tabel SUMENEP` : "database masih kosong"}`);

  const migrate = await migrateDeploy(url);
  step("Migrasi", migrate.ok ? "ok" : "error", migrate.note);
  if (!migrate.ok) return;

  const db = createPrismaClient(url, { max: 2 });
  try {
    if ((await db.activityLog.count({ where: { action: "system.seed" } })) > 0) {
      step("Data awal", "skipped", "sudah pernah dibuat");
    } else {
      const r = await seedInitialData(db);
      step("Data awal", "ok", `${r.sectionsCreated} kanal/rubrik, ${r.authorsCreated} profil penulis`);
    }

    if (await adminExists(db)) {
      step("Akun Admin", "skipped", "sudah ada; tidak diubah");
    } else if (!process.env.ADMIN_EMAIL?.trim() || !process.env.ADMIN_PASSWORD) {
      step("Akun Admin", "error", "belum ada Admin, dan ADMIN_EMAIL/ADMIN_PASSWORD belum diisi");
    } else {
      const input = adminBootstrapSchema.safeParse({
        email: process.env.ADMIN_EMAIL,
        name: process.env.ADMIN_NAME?.trim() || "Admin SUMENEP",
        password: process.env.ADMIN_PASSWORD,
      });
      if (!input.success) {
        step("Akun Admin", "error", `ADMIN_EMAIL/ADMIN_PASSWORD ditolak: ${firstIssue(input.error)}`);
      } else {
        await bootstrapAdmin(db, input.data);
        step("Akun Admin", "ok", "dibuat dari ADMIN_EMAIL/ADMIN_PASSWORD; hapus ADMIN_PASSWORD dari hPanel setelah login pertama");
      }
    }
  } catch (e) {
    step("Data awal/Admin", "error", describeDbError(e) + (e instanceof Error && !(e as { errno?: number }).errno ? `: ${e.message}` : ""));
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

function mediaStep() {
  const selection = resolveStorageSelection(process.env);
  if (selection.driver !== "local") {
    step("Folder media", "skipped", "MEDIA_DRIVER=s3");
    return;
  }
  fs.mkdirSync(selection.root, { recursive: true, mode: 0o750 });
  const probe = path.join(selection.root, `.uji-tulis-${process.pid}`);
  fs.writeFileSync(probe, "ok");
  fs.rmSync(probe);
  step("Folder media", "ok", "siap dan bisa ditulis, di luar folder aplikasi");
}

/** Runs once per server process; never throws. */
export async function runAutoSetup(): Promise<void> {
  const status = setupStatus();
  if (status.state !== "not-run") return;
  status.state = "running";
  status.startedAt = new Date().toISOString();
  log("mulai");
  try {
    await databaseSteps();
  } catch (e) {
    step("Database", "error", `kesalahan tak terduga: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    mediaStep();
  } catch (e) {
    step("Folder media", "error", e instanceof Error ? e.message : String(e));
  }
  status.state = status.steps.some((s) => s.state === "error") ? "error" : "ok";
  status.finishedAt = new Date().toISOString();
  log(`selesai: ${status.state}`);
}
