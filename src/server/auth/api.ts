import "server-only";

import { getDb } from "@/server/db";

import { getClientIp } from "./client-ip";
import { sessionCookieName } from "./cookie";
import { checkSameOrigin } from "./origin";
import { findValidSession, type ValidSession } from "./sessions";

// Guard for Route Handlers under /api/admin. Returns either the session or a
// ready JSON error response. Mutations (anything but GET/HEAD) must also pass
// the Origin check.

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export type ApiGuard = { session: ValidSession; ip: string; userAgent: string | null } | { response: Response };

export async function requireAdminApi(request: Request): Promise<ApiGuard> {
  const mutation = request.method !== "GET" && request.method !== "HEAD";
  if (mutation && !checkSameOrigin(request.headers).ok) {
    return { response: jsonResponse({ error: "forbidden_origin" }, 403) };
  }
  const session = await findValidSession(getDb(), readCookie(request, sessionCookieName()));
  if (!session) return { response: jsonResponse({ error: "unauthorized" }, 401) };
  return { session, ip: getClientIp(request.headers), userAgent: request.headers.get("user-agent") };
}
