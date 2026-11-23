import { NextResponse, type NextRequest } from "next/server";

import { SESSION_TOKEN_PATTERN, sessionCookieName, sessionCookieOptions } from "@/server/auth/cookie";
import { checkSameOrigin } from "@/server/auth/origin";

// First line of defence for the CMS (/admin, /api/admin, /pratinjau). It is deliberately
// cheap and never trusted alone: every page, Server Action and Route Handler
// checks the session in the database again (src/server/auth/next.ts, api.ts).
//
//   1. state-changing requests must come from this site (Origin, Sec-Fetch-Site)
//   2. no well-formed session cookie → login page (pages) or 401 (API)
//   3. admin responses: strict CSP with a per-request nonce, noindex, no-store,
//      no framing
//   4. the cookie's lifetime slides with activity (the database decides validity)
//
// The public site is outside the matcher and is not touched.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // Article previews show the same click-to-play embeds as the public site.
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function deny(isApi: boolean, status: 401 | 403, error: string): NextResponse {
  const response = isApi
    ? NextResponse.json({ error }, { status })
    : new NextResponse(status === 403 ? "Permintaan ditolak." : "Perlu login.", { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const isLogin = pathname === "/admin/login";
  const safe = SAFE_METHODS.has(request.method);

  if (!safe && !checkSameOrigin(request.headers).ok) return deny(isApi, 403, "forbidden_origin");

  const cookieName = sessionCookieName();
  const token = request.cookies.get(cookieName)?.value;
  const hasSessionCookie = typeof token === "string" && SESSION_TOKEN_PATTERN.test(token);

  if (!hasSessionCookie && !isLogin) {
    if (isApi || !safe) return deny(isApi, 401, "unauthorized");
    const login = new URL("/admin/login", request.url);
    if (pathname !== "/admin") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp); // Next.js reads the nonce from here

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Only on page/API reads: a POST may be a logout that clears the cookie, and
  // a refresh in the same response must not bring it back.
  if (hasSessionCookie && safe) response.cookies.set(cookieName, token, sessionCookieOptions());
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/pratinjau/:path*"],
};
