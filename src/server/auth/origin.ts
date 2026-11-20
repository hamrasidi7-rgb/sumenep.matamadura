// CSRF protection for state-changing admin requests (Server Actions, Route
// Handlers, and the first check in src/proxy.ts). Pure function on headers.
//
// Rules for every non-GET request:
//   - an Origin header is required (Next.js itself lets requests without one through);
//   - its host must be this site's host (x-forwarded-host, else host) or listed in
//     ADMIN_ALLOWED_HOSTS (comma-separated, e.g. "sumenep.matamaduranews.com");
//   - Sec-Fetch-Site, when the browser sends it, must be "same-origin". This also
//     refuses requests from the parent site matamaduranews.com: it is
//     "same-site", so a SameSite=Lax cookie alone would not stop it.

export type OriginCheck = { ok: true } | { ok: false; reason: "missing-origin" | "bad-origin" | "cross-origin" | "cross-site-fetch" };

interface HeaderSource {
  get(name: string): string | null;
}

function firstValue(value: string | null): string | null {
  return value ? value.split(",")[0].trim().toLowerCase() : null;
}

export function allowedHosts(headers: HeaderSource, extra = process.env.ADMIN_ALLOWED_HOSTS): Set<string> {
  const hosts = new Set<string>();
  const forwarded = firstValue(headers.get("x-forwarded-host"));
  const host = firstValue(headers.get("host"));
  if (forwarded) hosts.add(forwarded);
  if (host) hosts.add(host);
  for (const entry of (extra ?? "").split(",")) {
    const value = entry.trim().toLowerCase();
    if (value) hosts.add(value);
  }
  return hosts;
}

export function checkSameOrigin(headers: HeaderSource, extra?: string): OriginCheck {
  const origin = headers.get("origin");
  if (!origin || origin === "null") return { ok: false, reason: "missing-origin" };
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return { ok: false, reason: "bad-origin" };
  }
  if (!allowedHosts(headers, extra).has(originHost)) return { ok: false, reason: "cross-origin" };
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return { ok: false, reason: "cross-site-fetch" };
  return { ok: true };
}
