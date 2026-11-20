// Session cookie settings. Shared by src/proxy.ts and the server code, so it
// imports nothing from Node or Next.
//
// Production: __Host-sumenep_admin — the __Host- prefix makes the browser
// refuse the cookie unless it is Secure, has Path=/ and no Domain, so another
// subdomain of matamaduranews.com can never set or overwrite it.
// Development (http://localhost or a LAN address): a plain name without Secure.

import { SESSION_TTL_MS } from "./config";

const PRODUCTION_NAME = "__Host-sumenep_admin";
const DEVELOPMENT_NAME = "sumenep_admin_dev";

/** 32 random bytes, base64url → exactly 43 characters. Anything else is not a session token. */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const isProduction = () => process.env.NODE_ENV === "production";

export function sessionCookieName(): string {
  return isProduction() ? PRODUCTION_NAME : DEVELOPMENT_NAME;
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/** maxAge follows the 8-hour idle limit; the database stays the authority. */
export function sessionCookieOptions(maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)): SessionCookieOptions {
  return { httpOnly: true, secure: isProduction(), sameSite: "lax", path: "/", maxAge: maxAgeSeconds };
}
