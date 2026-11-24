// SUMENEP · Jalankan SATU perintah operator terhadap database Hostinger lewat tunnel SSH.
//
//   node scripts/ops/hostinger-tunnel.mjs [--env-file .env.hostinger-db.local] -- <perintah …>
//   contoh (Tahap E, setelah disetujui):
//     node scripts/ops/hostinger-tunnel.mjs -- npm run db:verify
//     node scripts/ops/hostinger-tunnel.mjs -- npm run db:migrate -- --yes
//
// Membuka tunnel 127.0.0.1:<acak> → MariaDB di server (kunci SSH, host key
// dipatok), lalu menjalankan perintah dengan DIRECT_URL dan DATABASE_URL menunjuk
// ke tunnel itu (mode satu user: DB_APP_USER kosong). Server melihat koneksi
// dari localhost, jadi trigger yang dipasang ber-definer @localhost.
// Password hanya diteruskan lewat environment proses anak; tidak pernah dicetak.
// Menolak perintah yang mereset atau menghapus database.
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

import { accessProblems, databaseUrl, isLoopback, loadAccess, openTunnel, redact } from "./hostinger-ssh.mjs";

const separator = process.argv.indexOf("--");
const own = separator < 0 ? process.argv.slice(2) : process.argv.slice(2, separator);
const command = separator < 0 ? [] : process.argv.slice(separator + 1);
const { values } = parseArgs({
  args: own,
  options: {
    "env-file": { type: "string", default: ".env.hostinger-db.local" },
    "no-ssh": { type: "boolean", default: false }, // uji lokal: --db-host/--db-port langsung
    "db-host": { type: "string", default: "127.0.0.1" },
    "db-port": { type: "string", default: "3306" },
  },
});

if (command.length === 0) {
  console.error("Pakai: node scripts/ops/hostinger-tunnel.mjs -- <perintah …>");
  process.exit(2);
}
const text = command.join(" ");
if (/\b(migrate\s+reset|db\s+push|--force-reset|--accept-data-loss|drop\s+database)\b/i.test(text)) {
  console.error("Ditolak: perintah yang mereset atau menghapus database tidak dijalankan lewat tunnel ini.");
  process.exit(2);
}

const env = loadAccess(values["env-file"]);
const problems = accessProblems(env, { needDatabase: true });
if (!env.HOSTINGER_DB_PASSWORD) problems.push("HOSTINGER_DB_PASSWORD kosong");
if (!values["no-ssh"] && !env.HOSTINGER_SSH) problems.push("HOSTINGER_SSH kosong");
if (values["no-ssh"] && !isLoopback(values["db-host"])) problems.push("--no-ssh hanya untuk uji lokal (--db-host 127.0.0.1); koneksi ke server selalu lewat SSH");
if (problems.length) {
  console.error(`Dihentikan sebelum koneksi apa pun:\n- ${problems.join("\n- ")}`);
  process.exit(2);
}

let tunnel = null;
let host = values["db-host"];
let port = Number(values["db-port"]);
try {
  if (!values["no-ssh"]) {
    tunnel = await openTunnel(env);
    host = "127.0.0.1";
    port = tunnel.port;
  }
  console.log(`▶ ${env.HOSTINGER_DB_NAME} lewat ${values["no-ssh"] ? "koneksi langsung (uji lokal)" : `tunnel SSH 127.0.0.1:${port}`} — menjalankan: ${text}`);
  const url = databaseUrl(env, host, port);
  const code = await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url, DB_APP_USER: "" },
    });
    child.on("exit", (c) => resolve(c ?? 1));
    child.on("error", (e) => {
      console.error(redact(e.message));
      resolve(1);
    });
  });
  process.exitCode = code;
} catch (e) {
  console.error(`Gagal: ${redact(e.message)}`);
  process.exitCode = 1;
} finally {
  tunnel?.close();
}
