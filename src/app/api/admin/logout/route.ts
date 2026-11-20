import { NextResponse } from "next/server";

import { logActivity } from "@/server/activity-log";
import { requireAdminApi } from "@/server/auth/api";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/cookie";
import { revokeSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db";

// Logout for API clients (the CMS pages use the logoutAction Server Action).
// POST only, same-origin only (403 otherwise), valid session only (401 otherwise).
export async function POST(request: Request) {
  const guard = await requireAdminApi(request);
  if ("response" in guard) return guard.response;
  const { session, ip, userAgent } = guard;
  await getDb().$transaction(async (tx) => {
    await revokeSession(tx, session.id, "auth.logout");
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: session.admin.id,
      action: "auth.logout",
      entityType: "admin_session",
      entityId: session.id,
      summary: "Logout (API).",
      ip,
      userAgent,
    });
  });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
  return response;
}
