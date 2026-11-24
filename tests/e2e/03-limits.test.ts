import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import type { Browser, Request as PwRequest } from "playwright-core";

import { resetAdminPassword } from "@/server/admin/recover";
import { AUTH } from "@/server/auth/config";
import { hashSessionToken } from "@/server/auth/tokens";

import { E2E_ADMIN } from "./admin";
import {
  BASE,
  browserSession,
  captureAction,
  closeAll,
  COOKIE,
  expectLoginError,
  infoNotice,
  launchBrowser,
  loginInBrowser,
  mintSession,
  newContext,
  nextIp,
  owner,
  replayAction,
  sessionCookieSet,
} from "./helpers";

let browser: Browser;
let loginRequest: PwRequest;

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password); // known state: password, no lock, no sessions
  browser = await launchBrowser();
  // Record one real login submission; the rate-limit test replays it with
  // other fields and client IPs, as a scripted attacker would.
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", "perekam@contoh.id");
  await page.fill("#password", "rekaman permintaan login");
  loginRequest = await captureAction(page, () => page.click("button[type=submit]"));
  await expectLoginError(page);
  await context.close();
});
after(async () => {
  await browser?.close();
  await closeAll();
});


/** Moves the clock back for this run's sessions (and the last password change, which must not be newer). */
async function ageSessions(createdHoursAgo: number, expiresInHours: number) {
  await owner.$executeRaw`UPDATE admin_user SET password_changed_at = NOW(3) - INTERVAL 12 HOUR WHERE id = 1`;
  await owner.$executeRawUnsafe(
    `UPDATE admin_session SET created_at = NOW(3) - INTERVAL ${Number(createdHoursAgo)} HOUR, last_seen_at = NOW(3) - INTERVAL ${Number(createdHoursAgo)} HOUR,
       expires_at = NOW(3) + INTERVAL ${Number(expiresInHours)} HOUR WHERE revoked_at IS NULL`,
  );
}

const unlock = () => owner.adminUser.update({ where: { id: 1 }, data: { failedLoginCount: 0, lockedUntil: null } });

describe("brute-force protection", () => {
  test("5 wrong passwords lock the account; the right password is refused with the same message; it works again after the lock", async () => {
    await unlock();
    const context = await newContext(browser);
    const page = await context.newPage();
    for (let i = 0; i < AUTH.lockoutThreshold; i++) {
      await page.goto(`${BASE}/admin/login`);
      await loginInBrowser(page, `tebakan nomor ${i} yang salah`);
      await expectLoginError(page);
    }
    const locked = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(locked.failedLoginCount, AUTH.lockoutThreshold);
    assert.ok(locked.lockedUntil && locked.lockedUntil > new Date(), "account locked");

    await page.goto(`${BASE}/admin/login`);
    await loginInBrowser(page);
    assert.match(await expectLoginError(page), /Login gagal\./, "same message as a wrong password");
    assert.equal(await browserSession(context), undefined);

    // the 15 minutes pass (moved in the database instead of waiting)
    await owner.adminUser.update({ where: { id: 1 }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await page.goto(`${BASE}/admin/login`);
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    assert.equal((await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } })).failedLoginCount, 0);
    await context.close();
  });

  test("per-IP limit through HTTP: after 10 failures the IP is refused even with the right password; another IP is not", async () => {
    await unlock();
    const attacker = nextIp();
    for (let i = 0; i < AUTH.ipMaxFailures; i++) {
      const response = await replayAction(loginRequest, { ip: attacker, fields: { email: `tamu${i}@contoh.id`, password: "salah salah salah" } });
      assert.equal(response.status, 200);
      assert.equal(sessionCookieSet(response), null);
      await response.arrayBuffer();
    }
    const blocked = await replayAction(loginRequest, { ip: attacker, fields: { email: E2E_ADMIN.email, password: E2E_ADMIN.password } });
    assert.equal(sessionCookieSet(blocked), null, "right password, blocked IP: no session");
    assert.match(await blocked.text(), /Login gagal\./);
    assert.equal(await owner.loginAttempt.count({ where: { ip: attacker, reason: "rate_limited" } }), 1);

    const elsewhere = await replayAction(loginRequest, { ip: nextIp(), fields: { email: E2E_ADMIN.email, password: E2E_ADMIN.password } });
    assert.ok(sessionCookieSet(elsewhere), "another IP logs in");
    await elsewhere.arrayBuffer();
    assert.equal((await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } })).lockedUntil, null, "the account itself was never locked");
  });
});

describe("session lifetime", () => {
  test("an expired session sends the browser to the login page ('sesi berakhir')", async () => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    await ageSessions(9, -1); // last activity 9 hours ago → expired an hour ago
    await page.goto(`${BASE}/admin`);
    await page.waitForURL(/\/admin\/login\?pesan=berakhir/);
    assert.match(await infoNotice(page).innerText(), /Sesi Anda berakhir/);
    await page.reload();
    assert.match(page.url(), /\/admin\/login/, "stays on the form: no redirect loop");
    await context.close();
  });

  test("activity extends the session by another 8 hours", async () => {
    const token = await mintSession();
    await ageSessions(7, 1); // last activity 7 hours ago → 1 hour left
    const before = await owner.adminSession.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(token) } });
    assert.ok(before.lastSeenAt.getTime() < Date.now() - 6 * 3600_000, "set up: last activity 7 hours ago");
    const response = await fetch(`${BASE}/admin`, { headers: { cookie: `${COOKIE}=${token}` }, redirect: "manual" });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    const afterwards = await owner.adminSession.findUniqueOrThrow({ where: { id: before.id } });
    assert.ok(afterwards.lastSeenAt.getTime() > Date.now() - 60_000, "last activity is now");
    assert.ok(afterwards.expiresAt.getTime() > Date.now() + 7.9 * 3600_000, "expires 8 hours from now");
  });
});
