import { isIP } from "node:net";

// Client IP for per-IP rate limiting.
//
// X-Forwarded-For can be forged by the client: only entries appended by our own
// proxies are trustworthy. Next.js fills X-Forwarded-For with the socket address
// only when the header is absent, so behind N trusted proxies that each append
// one entry, the client is the N-th entry from the right.
//
//   CLIENT_IP_HEADER    header set by the platform that the client cannot forge
//                       (e.g. "x-real-ip"); used when present
//   TRUSTED_PROXY_COUNT number of appending proxies in front of the app (default 1)
//
// The right values for Hostinger must be confirmed on the deployment (Fase 8).
// Whatever the IP says, the account lockout after 5 failures still applies.

interface HeaderSource {
  get(name: string): string | null;
}

export const UNKNOWN_IP = "unknown";

function normalise(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]")); // [v6]:port
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(":")); // v4:port
  if (value.toLowerCase().startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);
  return isIP(value) ? value.toLowerCase() : null;
}

export function getClientIp(headers: HeaderSource, env: Record<string, string | undefined> = process.env): string {
  const dedicated = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (dedicated) {
    const value = normalise(headers.get(dedicated)?.split(",")[0]);
    if (value) return value;
  }
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const hops = Math.max(1, Number.parseInt(env.TRUSTED_PROXY_COUNT ?? "1", 10) || 1);
  return normalise(entries[entries.length - hops]) ?? UNKNOWN_IP;
}
