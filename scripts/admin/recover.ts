// Recover access to the single Admin account (there is no e-mail reset).
// Needs the owner connection (DIRECT_URL), i.e. database access.
//
//   npm run admin:recover -- status                    account state, no secrets
//   npm run admin:recover -- reset-password            new password (hidden prompt),
//                                                      unlock, revoke every session
//        [--generate | --password-stdin]
//   npm run admin:recover -- revoke-sessions           sign out on every device
//   npm run admin:recover -- unlock                    lift the 5-failure lockout
//   npm run admin:recover -- set-email --email <baru>  change the login e-mail
//
//   common: --env-file <path> (default .env) · --yes (no confirmation)
// Exit codes: 0 done · 1 error · 2 refused/cancelled · 3 invalid input
import { parseArgs } from "node:util";

import type { PrismaClient } from "@prisma/client";

import {
  changeAdminEmail,
  getAdminStatus,
  resetAdminPassword,
  revokeAllAdminSessions,
  unlockAdmin,
} from "../../src/server/admin/recover";
import { generatePassword } from "../../src/server/auth/password";
import { createPrismaClient, requireEnv } from "../../src/server/db/client";
import { adminPasswordSchema } from "../../src/server/validation/admin";
import { ask, askHidden, confirmTarget, loadEnv, readStdin, Refusal, runCli } from "../lib/cli";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    generate: { type: "boolean", default: false },
    "password-stdin": { type: "boolean", default: false },
    "env-file": { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

const COMMANDS = ["status", "reset-password", "revoke-sessions", "unlock", "set-email"] as const;
type Command = (typeof COMMANDS)[number];

let db: PrismaClient | undefined;

const fmt = (date: Date | null) => (date ? date.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "-");

/** Changes need --yes, or a typed "ya" in an interactive terminal. */
async function confirmChange(description: string): Promise<void> {
  if (values.yes) return;
  if (!process.stdin.isTTY) throw new Refusal(`Tambahkan --yes untuk: ${description}.`);
  const answer = await ask(`${description}. Ketik "ya" untuk melanjutkan: `);
  if (answer.toLowerCase() !== "ya") throw new Refusal("Dibatalkan.");
}

async function readNewPassword(): Promise<{ password: string; generated: boolean }> {
  if (values.generate) return { password: generatePassword(), generated: true };
  if (values["password-stdin"]) return { password: await readStdin(), generated: false };
  const first = await askHidden("Password baru (min. 15 karakter, tidak ditampilkan): ");
  adminPasswordSchema.parse(first);
  const second = await askHidden("Ulangi password baru: ");
  if (first !== second) throw new Refusal("Password tidak sama. Tidak ada yang diubah.");
  return { password: first, generated: false };
}

void runCli(
  async () => {
    const command = positionals[0] as Command | undefined;
    if (!command || !COMMANDS.includes(command)) {
      throw new Refusal(`Perintah: ${COMMANDS.join(" | ")}. Contoh: npm run admin:recover -- status`);
    }
    if (values.generate && values["password-stdin"]) throw new Refusal("Pilih salah satu: --generate atau --password-stdin.");
    loadEnv(values["env-file"]);
    const url = requireEnv("DIRECT_URL");
    await confirmTarget(url, `admin:recover ${command}`, values.yes || command === "status");
    db = createPrismaClient(url, { max: 1 });

    switch (command) {
      case "status": {
        const s = await getAdminStatus(db);
        const locked = s.lockedUntil && s.lockedUntil > new Date();
        console.log(`Email login        : ${s.email}`);
        console.log(`Nama               : ${s.name}`);
        console.log(`Dibuat             : ${fmt(s.createdAt)}`);
        console.log(`Password diganti   : ${fmt(s.passwordChangedAt)}`);
        console.log(`Login terakhir     : ${fmt(s.lastLoginAt)}`);
        console.log(`Gagal login beruntun: ${s.failedLoginCount}`);
        console.log(`Terkunci           : ${locked ? `ya, sampai ${fmt(s.lockedUntil)}` : "tidak"}`);
        console.log(`Sesi aktif         : ${s.activeSessions}`);
        return;
      }
      case "reset-password": {
        await getAdminStatus(db); // fails early when there is no Admin
        const { password, generated } = await readNewPassword();
        adminPasswordSchema.parse(password);
        await confirmChange("Reset password Admin, buka penguncian, dan cabut SEMUA sesi");
        const { sessionsRevoked } = await resetAdminPassword(db, password);
        console.log(`Password direset. Penguncian dibuka. Sesi dicabut: ${sessionsRevoked}.`);
        if (generated) {
          console.log("");
          console.log("Password baru — ditampilkan SATU KALI, simpan sekarang di password manager:");
          console.log(`  ${password}`);
          console.log("Jangan kirim password ini lewat chat atau email.");
        }
        return;
      }
      case "revoke-sessions": {
        await getAdminStatus(db);
        await confirmChange("Cabut SEMUA sesi Admin (keluar dari semua perangkat)");
        const { sessionsRevoked } = await revokeAllAdminSessions(db);
        console.log(`Sesi dicabut: ${sessionsRevoked}.`);
        return;
      }
      case "unlock": {
        await getAdminStatus(db);
        await confirmChange("Buka penguncian login Admin");
        await unlockAdmin(db);
        console.log("Penguncian dibuka; hitungan gagal login kembali 0.");
        return;
      }
      case "set-email": {
        if (!values.email) throw new Refusal("Wajib: --email <email-baru>.");
        await getAdminStatus(db);
        await confirmChange(`Ganti email login Admin menjadi ${values.email.trim().toLowerCase()}`);
        const { email } = await changeAdminEmail(db, values.email);
        console.log(`Email login sekarang: ${email}.`);
        return;
      }
    }
  },
  async () => {
    await db?.$disconnect();
  },
);
