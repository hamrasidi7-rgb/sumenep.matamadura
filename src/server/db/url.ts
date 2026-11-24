import os from "node:os";

// DATABASE_URL as people really type it into a hosting panel: the password is
// often not URL-encoded (it may contain @ # / ? : %), the host is often
// "localhost" while Hostinger documents 127.0.0.1 for Node.js apps, and quotes
// get pasted along. This reads it tolerantly and returns one canonical,
// correctly encoded mysql:// URL. Error messages never contain the value.

export interface DatabaseParts {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
}

const FORMAT = "format: mysql://user:password@host:3306/nama_database";
const TRUE = new Set(["1", "true", "require", "required", "verify-full", "verify_identity"]);

/** Decode %XX only when present and valid: a raw password stays as typed. */
function decodeLoose(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseDatabaseUrl(raw: string): DatabaseParts {
  let value = raw.trim();
  if (/^(['"]).*\1$/s.test(value)) value = value.slice(1, -1).trim();
  const scheme = /^(?:mysql|mariadb):\/\//i.exec(value);
  if (!scheme) throw new Error(`DATABASE_URL harus diawali mysql:// (${FORMAT})`);
  const rest = value.slice(scheme[0].length);
  // The host part never contains "@", the password may: split at the LAST "@".
  const at = rest.lastIndexOf("@");
  if (at < 0) throw new Error(`DATABASE_URL tidak memuat user dan password (${FORMAT})`);
  const userinfo = rest.slice(0, at);
  const colon = userinfo.indexOf(":");
  const location = /^(\[[^\]]+\]|[^/:?#\s]+)(?::(\d{1,5}))?(?:\/([^?#\s]*))?(?:\?([^#\s]*))?$/.exec(rest.slice(at + 1));
  if (!location) throw new Error(`Bagian host/database di DATABASE_URL tidak bisa dibaca (${FORMAT})`);
  const params = new URLSearchParams(location[4] ?? "");
  return {
    user: decodeLoose(colon < 0 ? userinfo : userinfo.slice(0, colon)),
    password: decodeLoose(colon < 0 ? "" : userinfo.slice(colon + 1)),
    host: location[1],
    port: location[2] ? Number(location[2]) : 3306,
    database: decodeLoose(location[3] ?? ""),
    ssl: TRUE.has((params.get("ssl") ?? params.get("sslmode") ?? "").toLowerCase()),
  };
}

/** Running in a Hostinger web hosting account (home /home/u123456789)? */
export const onHostinger = (home = os.homedir()) => /^\/home\/u\d+(?:\/|$)/.test(home);

/**
 * The host to connect to. "localhost" becomes 127.0.0.1 (the mariadb driver always
 * uses TCP; Hostinger's docs say 127.0.0.1 for Node.js). On Hostinger the server's
 * own name (srvNNN.hstgr.io) is the same machine, where the database only accepts
 * local connections, so it becomes 127.0.0.1 too.
 */
export function effectiveHost(host: string, hostinger = onHostinger()): string {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "::1" || h === "[::1]") return "127.0.0.1";
  if (hostinger && h.endsWith(".hstgr.io")) return "127.0.0.1";
  return host;
}

export function canonicalDatabaseUrl(parts: DatabaseParts, hostinger = onHostinger()): string {
  const host = effectiveHost(parts.host, hostinger);
  const ssl = parts.ssl && host !== "127.0.0.1";
  const auth = `${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}`;
  return `mysql://${auth}@${host}:${parts.port}/${encodeURIComponent(parts.database)}${ssl ? "?ssl=true" : ""}`;
}

const first = (env: Record<string, string | undefined>, names: string[]) => names.map((n) => env[n]).find((v) => v !== undefined && v.trim() !== "");

/** The separate-variable style of Hostinger's Node.js guides (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME), when DATABASE_URL is absent. */
export function databasePartsFromEnv(env: Record<string, string | undefined>): DatabaseParts | null {
  const user = first(env, ["DB_USER", "DB_USERNAME", "DATABASE_USER", "DATABASE_USERNAME", "MYSQL_USER"])?.trim();
  const password = first(env, ["DB_PASSWORD", "DB_PASS", "DATABASE_PASSWORD", "MYSQL_PASSWORD"]);
  const database = first(env, ["DB_NAME", "DB_DATABASE", "DATABASE_NAME", "MYSQL_DATABASE"])?.trim();
  if (!user || !password || !database) return null;
  const [host, portInHost] = (first(env, ["DB_HOST", "DATABASE_HOST", "MYSQL_HOST"])?.trim() || "localhost").split(":");
  const port = Number(first(env, ["DB_PORT", "DATABASE_PORT", "MYSQL_PORT"])?.trim() || portInHost || 3306);
  return { user, password, host, port: Number.isInteger(port) && port > 0 ? port : 3306, database, ssl: false };
}

/** DATABASE_URL of the web app (or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME), canonicalised; value-free errors. */
export function runtimeDatabaseUrl(env: Record<string, string | undefined> = process.env, hostinger = onHostinger()): string {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) {
    const parts = databasePartsFromEnv(env);
    if (parts) return canonicalDatabaseUrl(parts, hostinger);
    throw new Error("DATABASE_URL belum diisi (atau DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).");
  }
  const parts = parseDatabaseUrl(raw);
  if (!parts.user) throw new Error(`DATABASE_URL tidak memuat nama user (${FORMAT})`);
  if (!parts.database) throw new Error(`DATABASE_URL tidak memuat nama database (${FORMAT})`);
  return canonicalDatabaseUrl(parts, hostinger);
}
