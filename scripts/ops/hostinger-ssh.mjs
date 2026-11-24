// Shared SSH helpers for the Hostinger operator scripts (hostinger-remote-check,
// hostinger-tunnel). Key-only SSH with a key used for nothing else, pinned host
// keys (deploy/hostinger_known_hosts), no ~/.ssh/config or system config, and a
// local tunnel 127.0.0.1:<random> to MariaDB on the server. Credentials come from
// .env.hostinger-db.local and are never printed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_KNOWN_HOSTS = path.join(root, "deploy", "hostinger_known_hosts");
// Dedicated key for this hosting account only, so it can be removed from hPanel
// after Tahap E without affecting GitHub or other servers.
export const DEFAULT_IDENTITY = path.join(os.homedir(), ".ssh", "sumenep_hostinger_ed25519");

/** .env.hostinger-db.local → settings; `dbReady` says whether the database login is complete. */
export function loadAccess(envFile) {
  const file = path.resolve(envFile);
  if (!fs.existsSync(file)) throw new Error(`Berkas ${file} tidak ada. Buat dari deploy/hostinger-db.env.template.`);
  const env = parseEnv(fs.readFileSync(file, "utf8"));
  env.dbReady = Boolean(env.HOSTINGER_DB_NAME && env.HOSTINGER_DB_USER && env.HOSTINGER_DB_PASSWORD);
  return env;
}

export const isLoopback = (host) => ["127.0.0.1", "::1", "localhost"].includes(String(host).toLowerCase());

const HOST = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+";

/**
 * Checks the access file before anything connects. Refuses values that could carry
 * ssh options or shell syntax, a domain other than the SUMENEP subdomain, and a
 * database name/user outside the hosting account that SSH logs in to (Hostinger
 * prefixes both with the account name: u123456789_…). Returns the problems found.
 */
export function accessProblems(env, { needDatabase = false } = {}) {
  const problems = [];
  const ssh = new RegExp(`^([a-z0-9_]+)@(${HOST})$`, "i").exec(env.HOSTINGER_SSH ?? "");
  if (env.HOSTINGER_SSH && !ssh) problems.push("HOSTINGER_SSH harus berbentuk user@host, mis. u123456789@srvNNN.hstgr.io");
  if (env.HOSTINGER_SSH_PORT && !/^\d{1,5}$/.test(env.HOSTINGER_SSH_PORT)) problems.push("HOSTINGER_SSH_PORT harus angka");
  if (env.HOSTINGER_DOMAIN && !new RegExp(`^sumenep\\.${HOST}$`, "i").test(env.HOSTINGER_DOMAIN)) {
    problems.push("HOSTINGER_DOMAIN harus subdomain SUMENEP (sumenep.<domain>); domain lain ditolak");
  }
  const target = env.HOSTINGER_DB_HOST_FROM_SERVER;
  if (target && !isLoopback(target) && !new RegExp(`^(?:${HOST}|\\d{1,3}(?:\\.\\d{1,3}){3})$`, "i").test(target)) {
    problems.push("HOSTINGER_DB_HOST_FROM_SERVER tidak valid");
  }
  for (const key of ["HOSTINGER_DB_NAME", "HOSTINGER_DB_USER"]) {
    const value = env[key];
    if (!value) {
      if (needDatabase) problems.push(`${key} kosong: salin persis dari hPanel → Databases → Management`);
      continue;
    }
    if (!/^[A-Za-z0-9_]{1,80}$/.test(value)) problems.push(`${key} hanya boleh berisi huruf, angka, dan _`);
    else if (ssh && !value.startsWith(`${ssh[1]}_`)) problems.push(`${key} (${value}) bukan milik akun hosting ${ssh[1]}: harus diawali ${ssh[1]}_`);
  }
  return problems;
}

export function sshArgs(env, { knownHosts = DEFAULT_KNOWN_HOSTS, identity = DEFAULT_IDENTITY } = {}) {
  return [
    "-F", "none", // ignore ~/.ssh/config and system config: only the options below apply
    "-p", env.HOSTINGER_SSH_PORT || "65002",
    "-o", "BatchMode=yes",
    "-o", "PasswordAuthentication=no",
    "-o", "KbdInteractiveAuthentication=no",
    "-o", "PubkeyAuthentication=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${knownHosts}`,
    "-o", `GlobalKnownHostsFile=${knownHosts}`,
    "-o", "UpdateHostKeys=no",
    "-o", "ForwardAgent=no",
    "-o", "ForwardX11=no",
    "-o", "ConnectTimeout=15",
    "-o", "ServerAliveInterval=15",
    "-i", identity,
  ];
}

/** One readable line for an ssh failure (the last raw line is kept in brackets). */
export function sshFailure(stderr, code) {
  const text = String(stderr ?? "");
  const last = text.trim().split("\n").pop()?.trim() || `exit ${code}`;
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed|host key is known/i.test(text)) {
    return `HOST KEY TIDAK COCOK dengan deploy/hostinger_known_hosts: dihentikan, jangan diulang; cocokkan lagi dengan sidik jari di hPanel (${last})`;
  }
  if (/Permission denied/i.test(text)) return `login SSH ditolak: kunci belum terdaftar di hPanel atau SSH belum aktif (${last})`;
  if (/administratively prohibited/i.test(text)) return `server menolak SSH port forwarding (${last})`;
  return last;
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });

/**
 * What a local TCP connection to `port` sees within `ms`: "greeting" (a database server
 * spoke first, as MariaDB does), "closed" (accepted, then closed without data: the SSH
 * server refused the forward or could not reach the target), "silent" (accepted, no
 * data), or "refused" (nothing listening yet).
 */
export function probeServer(port, ms = 10_000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(ms, () => finish("silent"));
    socket.once("data", () => finish("greeting"));
    socket.once("error", (e) => finish(e.code === "ECONNREFUSED" ? "refused" : "closed"));
    socket.once("close", () => finish("closed"));
  });
}

/**
 * Local port forwarded over SSH to MariaDB on the server. Ready only once MariaDB's
 * greeting has come back through it; a refused or dead forward throws (no login is
 * attempted through it). Call close() when done.
 */
export async function openTunnel(env, options = {}) {
  if (!env.HOSTINGER_SSH) throw new Error("HOSTINGER_SSH kosong");
  const knownHosts = options.knownHosts ?? DEFAULT_KNOWN_HOSTS;
  const identity = options.identity ?? DEFAULT_IDENTITY;
  if (!fs.existsSync(knownHosts)) throw new Error(`known_hosts tidak ada: ${knownHosts}`);
  // Checked here so a missing key never turns into a failed login attempt on the server.
  if (!fs.existsSync(identity)) throw new Error(`kunci SSH tidak ada: ${identity} (tidak ada percobaan login)`);
  const port = await freePort();
  const target = `${env.HOSTINGER_DB_HOST_FROM_SERVER || "127.0.0.1"}:3306`;
  const child = spawn("ssh", [...sshArgs(env, { knownHosts, identity }), "-N", "-T", "-o", "ExitOnForwardFailure=yes", "-L", `127.0.0.1:${port}:${target}`, env.HOSTINGER_SSH], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const until = Date.now() + 25_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(sshFailure(stderr, child.exitCode));
    const seen = await probeServer(port);
    if (seen === "greeting") return { port, close: () => child.kill(), stderr: () => stderr };
    if (seen === "closed" || seen === "silent") {
      await new Promise((r) => setTimeout(r, 800)); // give ssh time to say why the channel failed
      child.kill();
      throw new Error(`tunnel tidak sampai ke MariaDB (${seen === "silent" ? "tidak ada jawaban" : "koneksi diputus"}): ${sshFailure(stderr, "-")}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill();
  throw new Error("tunnel SSH tidak siap dalam 25 detik");
}

/** mysql:// URL for the given host/port with the account from the access file. */
export function databaseUrl(env, host, port) {
  return `mysql://${encodeURIComponent(env.HOSTINGER_DB_USER)}:${encodeURIComponent(env.HOSTINGER_DB_PASSWORD)}@${host}:${port}/${encodeURIComponent(env.HOSTINGER_DB_NAME)}`;
}

/** Removes password hashes from SHOW GRANTS text and connection strings from messages. */
export const redact = (text) =>
  String(text)
    .replace(/(IDENTIFIED BY PASSWORD\s+')[^']*(')/gi, "$1***$2")
    .replace(/(\bUSING\s+')[^']*(')/gi, "$1***$2")
    .replace(/mysql:\/\/[^\s@]*@/gi, "mysql://<kredensial>@");
