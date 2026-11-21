import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page, type Request as PwRequest } from "playwright-core";

import { attemptLogin } from "@/server/auth/login";
import { createPrismaClient } from "@/server/db/client";

import { E2E_ADMIN } from "./admin";

// Shared by tests/e2e/*. Run through `npm run test:e2e`, which provides a
// production server (E2E_BASE_URL) and a throw-away database.

export const BASE = process.env.E2E_BASE_URL ?? "";
if (!BASE) throw new Error("E2E_BASE_URL missing — run through npm run test:e2e");
export const ORIGIN = new URL(BASE).origin;
export const COOKIE = "__Host-sumenep_admin";

function requireTestUrl(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = process.env[name] ?? "";
  if (!new URL(value).pathname.includes("_test")) throw new Error(`${name} must be a *_test database`);
  return value;
}

/** Owner connection to the run database, to inspect state and move the clock. */
export const owner = createPrismaClient(requireTestUrl("DIRECT_URL"), { max: 2 });
/** Runtime-role connection, used to mint sessions exactly as the login does. */
export const app = createPrismaClient(requireTestUrl("DATABASE_URL"), { max: 2 });

// Every tests/e2e file runs in its own process, but the database (and so the
// per-IP failure counters) lives for the whole run. A random prefix per process
// in the IPv6 documentation range (2001:db8::/32) keeps the files apart: an IP
// that 03-limits blocked is never handed out again by a later file.
const ipPrefix = `2001:db8:${randomInt(0x1000, 0x10000).toString(16)}:${randomInt(0x1000, 0x10000).toString(16)}`;
let ipCounter = 0;
/** A fresh documentation-range IP, so tests never share a rate-limit bucket by accident. */
export const nextIp = () => `${ipPrefix}::${(++ipCounter).toString(16)}`;

/** Logs in through the same code as the form and returns the raw cookie value. */
export async function mintSession(password: string = E2E_ADMIN.password): Promise<string> {
  const result = await attemptLogin(app, { email: E2E_ADMIN.email, password }, { ip: nextIp(), userAgent: "e2e-helper" });
  assert.ok(result.ok, `login helper failed: ${!result.ok && result.reason}`);
  return result.token;
}

export async function http(
  pathname: string,
  init: RequestInit & { session?: string; cookieHeader?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.session) headers.set("cookie", `${COOKIE}=${init.session}`);
  if (init.cookieHeader) headers.set("cookie", init.cookieHeader);
  return fetch(new URL(pathname, BASE), { ...init, headers, redirect: "manual" });
}

/** Value of the session cookie a response sets (null = not set, "" = cleared). */
export function sessionCookieSet(response: Response): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    if (cookie.startsWith(`${COOKIE}=`)) return cookie.slice(COOKIE.length + 1).split(";")[0];
  }
  return null;
}

export const activeSessions = () => owner.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } });

export async function apiMe(session: string): Promise<number> {
  return (await http("/api/admin/me", { session })).status;
}

// ─── Browser ─────────────────────────────────────────────────────────────────

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
].find((candidate) => candidate && fs.existsSync(candidate));

export async function launchBrowser(): Promise<Browser> {
  if (!CHROME) throw new Error("Chrome/Edge tidak ditemukan (set CHROME_PATH)");
  return chromium.launch({ executablePath: CHROME, headless: true });
}

export async function newContext(browser: Browser, viewport = { width: 1280, height: 860 }, ip = nextIp()): Promise<BrowserContext> {
  return browser.newContext({ viewport, extraHTTPHeaders: { "x-forwarded-for": ip } });
}

/** Fills and submits the login form and waits until the server has answered. */
export async function loginInBrowser(page: Page, password: string = E2E_ADMIN.password, email: string = E2E_ADMIN.email): Promise<void> {
  if (!page.url().includes("/admin/login")) await page.goto(`${BASE}/admin/login`);
  await page.locator("button[type=submit]:enabled").waitFor();
  await page.fill("#email", email);
  await page.fill("#password", password);
  const answered = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/login");
  await page.click("button[type=submit]");
  await answered;
}

/** The form's own error box (Next.js also has a hidden role="alert" route announcer). */
export const errorNotice = (page: Page) => page.locator("[data-notice=error]");
export const infoNotice = (page: Page) => page.locator("[data-notice=info], [data-notice=success]");

/** After a refused login: the error is shown and the form is ready again. */
export async function expectLoginError(page: Page): Promise<string> {
  await errorNotice(page).waitFor();
  await page.locator("button[type=submit]:enabled").waitFor();
  return errorNotice(page).innerText();
}

export async function browserSession(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies(BASE)).find((c) => c.name === COOKIE)?.value;
}

/** Submits a form in the page and returns the Server Action request the browser sent. */
export async function captureAction(page: Page, submit: () => Promise<void>): Promise<PwRequest> {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"])),
    submit(),
  ]);
  return request;
}

/**
 * Re-sends a recorded Server Action request with other headers/fields — what an
 * attacker's script or a cross-site form would do.
 */
export async function replayAction(
  request: PwRequest,
  options: { origin?: string | null; session?: string; ip?: string; fields?: Record<string, string>; secFetchSite?: string } = {},
): Promise<Response> {
  const recorded = request.headers();
  const headers = new Headers();
  for (const name of ["next-action", "next-router-state-tree", "accept"]) if (recorded[name]) headers.set(name, recorded[name]);
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  if (options.secFetchSite) headers.set("sec-fetch-site", options.secFetchSite);
  if (options.ip) headers.set("x-forwarded-for", options.ip);
  if (options.session) headers.set("cookie", `${COOKIE}=${options.session}`);

  const original = request.postDataBuffer() ?? Buffer.alloc(0);
  let body: BodyInit = new Uint8Array(original);
  if (options.fields) {
    const form = await new Response(new Uint8Array(original), { headers: { "content-type": recorded["content-type"] } }).formData();
    for (const [suffix, value] of Object.entries(options.fields)) {
      const key = [...form.keys()].find((k) => k === suffix || k.endsWith(`_${suffix}`));
      assert.ok(key, `field ${suffix} not found in recorded action`);
      form.set(key, value);
    }
    body = form;
  } else {
    headers.set("content-type", recorded["content-type"]);
  }
  return fetch(new URL(new URL(request.url()).pathname, BASE), { method: "POST", headers, body, redirect: "manual" });
}

export async function screenshot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SCREENSHOT_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  // From the top: a full-page capture of a scrolled page draws sticky bars mid-page.
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

export async function closeAll(): Promise<void> {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
}
