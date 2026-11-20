// Create the one and only Admin account. Refuses (exit 2) if it already exists.
//
//   npm run admin:bootstrap -- --email admin@contoh.id --name "Nama Admin"
//       → password asked twice, hidden
//   options:
//     --generate          create a strong random password and show it ONCE
//     --password-stdin    read the password from standard input (automation)
//     --env-file <path>   connection settings (default .env); uses DIRECT_URL
//     --yes               skip the confirmation for a remote database
//
// Exit codes: 0 created · 1 error · 2 refused (Admin exists, cancelled) · 3 invalid input
import { parseArgs } from "node:util";

import type { PrismaClient } from "@prisma/client";

import { adminExists, bootstrapAdmin } from "../../src/server/admin/bootstrap";
import { generatePassword } from "../../src/server/auth/password";
import { createPrismaClient, requireEnv } from "../../src/server/db/client";
import { adminPasswordSchema } from "../../src/server/validation/admin";
import { askHidden, confirmTarget, loadEnv, readStdin, Refusal, runCli } from "../lib/cli";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    generate: { type: "boolean", default: false },
    "password-stdin": { type: "boolean", default: false },
    "env-file": { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

let db: PrismaClient | undefined;

async function readPassword(): Promise<{ password: string; generated: boolean }> {
  if (values.generate) return { password: generatePassword(), generated: true };
  if (values["password-stdin"]) return { password: await readStdin(), generated: false };
  const first = await askHidden("Password baru (min. 15 karakter, tidak ditampilkan): ");
  adminPasswordSchema.parse(first); // complain before asking a second time
  const second = await askHidden("Ulangi password: ");
  if (first !== second) throw new Refusal("Password tidak sama. Tidak ada yang dibuat.");
  return { password: first, generated: false };
}

void runCli(
  async () => {
    if (values.generate && values["password-stdin"]) throw new Refusal("Pilih salah satu: --generate atau --password-stdin.");
    if (!values.email || !values.name) {
      throw new Refusal('Wajib: --email dan --name. Contoh: npm run admin:bootstrap -- --email admin@contoh.id --name "Nama Admin"');
    }
    loadEnv(values["env-file"]);
    const url = requireEnv("DIRECT_URL");
    await confirmTarget(url, "membuat Admin", values.yes);
    db = createPrismaClient(url, { max: 1 });

    // Check before asking for a password nobody will use.
    if (await adminExists(db)) {
      throw new Refusal("Admin sudah ada. SUMENEP hanya memiliki satu akun Admin; gunakan admin:recover untuk memulihkan akses.");
    }

    const { password, generated } = await readPassword();
    const admin = await bootstrapAdmin(db, { email: values.email, name: values.name, password });

    console.log(`Admin dibuat: ${admin.email} (${admin.name}).`);
    if (generated) {
      console.log("");
      console.log("Password Admin — ditampilkan SATU KALI, simpan sekarang di password manager:");
      console.log(`  ${password}`);
      console.log("Jangan kirim password ini lewat chat atau email.");
    }
  },
  async () => {
    await db?.$disconnect();
  },
);
