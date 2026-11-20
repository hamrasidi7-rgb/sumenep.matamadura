import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/server/db";

import { getClientIp } from "./client-ip";
import { sessionCookieName, sessionCookieOptions } from "./cookie";
import { checkSameOrigin } from "./origin";
import { findValidSession, type ValidSession } from "./sessions";

// The only way CMS code asks "who is calling?". Every admin page, Server Action
// and Route Handler goes through requireAdmin() / requireAdminApi(), which check
// the session in the DATABASE. src/proxy.ts is only the first, cheap filter.

/** Session of the current request (validated in the database, once per request). */
export const getAdminSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  // Router prefetches are not activity: they must not extend the session.
  const isPrefetch = (await headers()).get("next-router-prefetch") !== null;
  return findValidSession(getDb(), token, { extend: !isPrefetch });
});

/** For pages, layouts and Server Actions: no valid session → /admin/login. */
export async function requireAdmin(): Promise<ValidSession> {
  const session = await getAdminSession();
  if (!session) {
    // A cookie that no longer works means the session ended (expired, revoked, logged out elsewhere).
    const hadCookie = Boolean((await cookies()).get(sessionCookieName())?.value);
    redirect(hadCookie ? "/admin/login?pesan=berakhir" : "/admin/login");
  }
  return session;
}

/** IP and user agent of the current request. */
export async function requestMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  return { ip: getClientIp(h), userAgent: h.get("user-agent") };
}

export class ForbiddenOriginError extends Error {
  constructor() {
    super("Permintaan ditolak: asal permintaan tidak sah.");
    this.name = "ForbiddenOriginError";
  }
}

/** First line of every state-changing Server Action (Next.js lets requests without Origin through). */
export async function assertSameOrigin(): Promise<void> {
  if (!checkSameOrigin(await headers()).ok) throw new ForbiddenOriginError();
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  // Same attributes as when it was set (a __Host- cookie must be Secure + Path=/).
  (await cookies()).set(sessionCookieName(), "", sessionCookieOptions(0));
}
