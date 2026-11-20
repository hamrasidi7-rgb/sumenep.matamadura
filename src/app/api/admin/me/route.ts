import { jsonResponse, requireAdminApi } from "@/server/auth/api";

// The logged-in Admin and the session expiry. 401 without a valid session.
export async function GET(request: Request) {
  const guard = await requireAdminApi(request);
  if ("response" in guard) return guard.response;
  const { admin, expiresAt } = guard.session;
  return jsonResponse({ admin: { email: admin.email, name: admin.name, role: "ADMIN" }, session: { expiresAt } });
}
