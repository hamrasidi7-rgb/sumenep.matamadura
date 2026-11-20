import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import type { Browser, Request as PwRequest } from "playwright-core";

import { resetAdminPassword } from "@/server/admin/recover";

import { E2E_ADMIN } from "./admin";
import {
  activeSessions,
  apiMe,
  BASE,
  captureAction,
  closeAll,
  http,
  launchBrowser,
  loginInBrowser,
  mintSession,
  newContext,
  nextIp,
  ORIGIN,
  owner,
  replayAction,
  sessionCookieSet,
} from "./helpers";

// Cross-origin requests. Real browser submissions are recorded once and then
// replayed with a foreign Origin, no Origin, or the parent site's Origin.

let browser: Browser;
let loginRequest: PwRequest;
let logoutRequest: PwRequest;

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password); // known state: password, no lock, no sessions
  browser = await launchBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", E2E_ADMIN.email);
  await page.fill("#password", E2E_ADMIN.password);
  loginRequest = await captureAction(page, () => page.click("button[type=submit]"));
  await page.waitForURL(`${BASE}/admin`);
  logoutRequest = await captureAction(page, () => page.getByRole("button", { name: "Keluar" }).first().click());
  await page.waitForURL(/\/admin\/login/);
  await context.close();
});
after(async () => {
  await browser?.close();
  await closeAll();
});

const FOREIGN = [
  ["another site", "https://evil.example"],
  ["the parent site (same-site)", "https://matamaduranews.com"],
  ["no Origin header", null],
] as const;

describe("Server Actions refuse cross-origin requests", () => {
  test("a recorded login replayed from elsewhere creates no session", async () => {
    const before = await activeSessions();
    for (const [label, origin] of FOREIGN) {
      const response = await replayAction(loginRequest, { origin, ip: nextIp() });
      assert.equal(response.status, 403, label);
      assert.equal(sessionCookieSet(response), null, label);
      await response.arrayBuffer();
    }
    const sameSiteFetch = await replayAction(loginRequest, { origin: ORIGIN, secFetchSite: "same-site", ip: nextIp() });
    assert.equal(sameSiteFetch.status, 403, "Sec-Fetch-Site: same-site");
    await sameSiteFetch.arrayBuffer();
    assert.equal(await activeSessions(), before);

    // control: the identical request from the site itself works
    const genuine = await replayAction(loginRequest, { ip: nextIp() });
    assert.ok(sessionCookieSet(genuine), "same-origin replay logs in");
    await genuine.arrayBuffer();
  });

  test("a logout forced from another site does not end the session", async () => {
    const session = await mintSession();
    for (const [label, origin] of FOREIGN) {
      const response = await replayAction(logoutRequest, { origin, session });
      assert.equal(response.status, 403, label);
      await response.arrayBuffer();
      assert.equal(await apiMe(session), 200, `${label}: still logged in`);
    }
    const genuine = await replayAction(logoutRequest, { session });
    assert.ok(genuine.status < 400);
    await genuine.arrayBuffer();
    assert.equal(await apiMe(session), 401, "same-origin logout works");
  });
});

describe("API mutations refuse cross-origin requests", () => {
  test("POST /api/admin/logout: 403 from elsewhere, 200 from the site", async () => {
    const session = await mintSession();
    for (const [label, origin] of FOREIGN) {
      const headers: Record<string, string> = origin ? { origin } : {};
      const response = await http("/api/admin/logout", { method: "POST", session, headers });
      assert.equal(response.status, 403, label);
      assert.deepEqual(await response.json(), { error: "forbidden_origin" });
    }
    assert.equal(await apiMe(session), 200);
    const ok = await http("/api/admin/logout", { method: "POST", session, headers: { origin: ORIGIN } });
    assert.equal(ok.status, 200);
    assert.equal(sessionCookieSet(ok), "", "cookie cleared");
    assert.equal(await apiMe(session), 401);
  });

  test("GET cannot be used to log out", async () => {
    const session = await mintSession();
    assert.equal((await http("/api/admin/logout", { session })).status, 405);
    assert.equal(await apiMe(session), 200);
  });
});

describe("browser behaviour", () => {
  test("a page on another origin cannot read the CMS API (no CORS)", async () => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    const otherOrigin = BASE.replace("localhost", "127.0.0.1");
    await page.goto(`${otherOrigin}/`);
    const result = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        return `read:${response.status}`;
      } catch {
        return "blocked";
      }
    }, `${BASE}/api/admin/me`);
    assert.equal(result, "blocked");
    await context.close();
  });
});
