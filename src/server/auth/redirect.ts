// Where to go after login. Only paths inside the CMS are accepted, so the login
// form cannot be abused as an open redirect (e.g. ?next=//evil.example).

const ADMIN_PATH = /^\/admin(?:\/[A-Za-z0-9/_-]*)?(?:\?[A-Za-z0-9=&%_.-]*)?$/;

export function safeNextPath(value: unknown, fallback = "/admin"): string {
  if (typeof value !== "string" || value.length > 300) return fallback;
  if (!ADMIN_PATH.test(value) || value.includes("//") || value.startsWith("/admin/login")) return fallback;
  return value;
}
