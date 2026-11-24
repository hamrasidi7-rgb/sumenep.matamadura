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
import path from "node:path";

import mariadb from "mariadb";

import { adminExists, bootstrapAdmin } from "@/server/admin/bootstrap";
import { createPrismaClient, poolConfig, SESSION_SETUP_SQL } from "@/server/db/client";
import { parseDatabaseUrl, runtimeDatabaseUrl } from "@/server/db/url";
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

/** Tables the SUMENEP migrations create (from prisma/migrations), plus Prisma's own. */
function sumenepTables(cwd = process.cwd()): Set<string> {
  const names = new Set(["_prisma_migrations", "zz_sumenep_probe"]);
  const dir = path.join(cwd, "prisma", "migrations");
  if (!fs.existsSync(dir)) return names;
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
      return "login database ditolak: user atau password di DATABASE_URL salah";
    case 1044:
      return "user database tidak punya akses ke database yang ditulis di DATABASE_URL";
    case 1049:
      return "nama database di DATABASE_URL tidak ada";
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
  const cli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(cli)) return Promise.resolve({ ok: false, note: "Prisma CLI tidak ditemukan di node_modules" });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "migrate", "deploy"], {
      cwd: process.cwd(),
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

async function databaseSteps() {
  let url: string;
  try {
    url = runtimeDatabaseUrl();
    const parts = parseDatabaseUrl(url);
    hide = [parts.database, parts.user];
  } catch (e) {
    step("Konfigurasi database", "error", e instanceof Error ? e.message : String(e));
    return;
  }

  let tables: string[];
  try {
    const { host, port, user, password, database, ssl } = poolConfig(url);
    const conn = await mariadb.createConnection({ host, port, user, password, database, ssl, connectTimeout: 15_000 });
    try {
      await conn.query(SESSION_SETUP_SQL);
      const rows: Array<{ name: string }> = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
      tables = rows.map((r) => String(r.name));
    } finally {
      await conn.end().catch(() => {});
    }
  } catch (e) {
    step("Koneksi database", "error", describeDbError(e));
    return;
  }
  const own = sumenepTables();
  const foreign = tables.filter((t) => !own.has(t));
  if (foreign.length) {
    step("Koneksi database", "error", `database berisi ${foreign.length} tabel yang bukan milik SUMENEP (mungkin database WordPress); setup database dihentikan tanpa mengubah apa pun`);
    return;
  }
  step("Koneksi database", "ok", tables.length ? `terhubung; ${tables.length} tabel SUMENEP` : "terhubung; database masih kosong");

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
