import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import type { Browser } from "playwright-core";

import { resetAdminPassword } from "@/server/admin/recover";

import { E2E_ADMIN, generateTestPassword } from "./admin";
import {
  activeSessions,
  apiMe,
  BASE,
  browserSession,
  closeAll,
  COOKIE,
  errorNotice,
  expectLoginError,
  infoNotice,
  launchBrowser,
  loginInBrowser,
  newContext,
  owner,
  screenshot,
} from "./helpers";

// Real browser (headless Chrome/Edge) against the production build.

let browser: Browser;
before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password); // known state: password, no lock, no sessions
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await closeAll();
});

const UNIFORM = /Login gagal\. Periksa email dan password Anda\./;

describe("login form", () => {
  test("wrong password: one generic message, no cookie, stays on the login page", async () => {
    const context = await newContext(browser, { width: 390, height: 844 });
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/login`);
    await screenshot(page, "login-390");
    await loginInBrowser(page, "password yang salah sekali");
    assert.match(await expectLoginError(page), UNIFORM);
    assert.match(page.url(), /\/admin\/login/);
    assert.equal(await browserSession(context), undefined);
    assert.equal(await page.inputValue("#email"), E2E_ADMIN.email, "email kept");
    assert.equal(await page.inputValue("#password"), "", "password cleared");
    await screenshot(page, "login-galat-390");

    // an unknown email gets exactly the same message
    await page.goto(`${BASE}/admin/login`);
    await loginInBrowser(page, E2E_ADMIN.password, "bukan.admin@sumenep.test");
    assert.equal(await expectLoginError(page), await errorNotice(page).innerText());
    assert.match(await errorNotice(page).innerText(), UNIFORM);
    await context.close();
  });

  test("right password: dashboard, and a __Host- cookie that is httpOnly, Secure, SameSite=Lax, Path=/", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/login`);
    await screenshot(page, "login-1440");
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    await page.getByRole("heading", { name: /Selamat datang/ }).waitFor();
    const cookie = (await context.cookies(BASE)).find((c) => c.name === COOKIE);
    assert.ok(cookie, "session cookie set");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.path, "/");
    assert.ok(cookie.expires > Date.now() / 1000 + 7.9 * 3600, "about 8 hours");
    assert.equal(await page.evaluate(() => document.cookie.includes("sumenep_admin")), false, "invisible to JavaScript");
    await screenshot(page, "dashboard-1440");

    // already logged in: the login page forwards once, no loop
    await page.goto(`${BASE}/admin/login`);
    await page.waitForURL(`${BASE}/admin`);
    await context.close();
  });

  test("after login the Admin returns to the page that was asked for", async () => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/akun`);
    assert.match(page.url(), /\/admin\/login\?next=%2Fadmin%2Fakun/);
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin/akun`);
    await context.close();
  });
});

describe("logout, sessions and password", () => {
  test("logout revokes the session in the database; the old cookie is useless afterwards", async () => {
    const context = await newContext(browser, { width: 390, height: 844 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    await screenshot(page, "dashboard-390");
    const token = (await browserSession(context))!;
    assert.equal(await apiMe(token), 200);

    await page.getByRole("button", { name: "Keluar" }).first().click();
    await page.waitForURL(/\/admin\/login\?pesan=keluar/);
    assert.match(await infoNotice(page).innerText(), /Anda telah keluar/);
    assert.equal(await browserSession(context), undefined, "cookie cleared");
    assert.equal(await apiMe(token), 401, "replaying the old cookie fails");
    const row = await owner.adminSession.findFirstOrThrow({ where: { revokedReason: "auth.logout" }, orderBy: { revokedAt: "desc" } });
    assert.ok(row.revokedAt);
    await context.close();
  });

  test("revoking another device from the sessions list", async () => {
    const laptop = await newContext(browser, { width: 1440, height: 900 });
    const phone = await newContext(browser, { width: 390, height: 844 });
    const laptopPage = await laptop.newPage();
    const phonePage = await phone.newPage();
    await loginInBrowser(phonePage);
    await phonePage.waitForURL(`${BASE}/admin`);
    await loginInBrowser(laptopPage);
    await laptopPage.waitForURL(`${BASE}/admin`);
    const phoneToken = (await browserSession(phone))!;

    await phonePage.goto(`${BASE}/admin/akun`);
    await screenshot(phonePage, "akun-390");
    await laptopPage.goto(`${BASE}/admin/akun`);
    await screenshot(laptopPage, "akun-1440");
    laptopPage.once("dialog", (dialog) => dialog.accept());
    const otherDevice = laptopPage.locator("li").filter({ hasNotText: "Perangkat ini" }).filter({ has: laptopPage.getByRole("button", { name: "Cabut" }) });
    await otherDevice.first().getByRole("button", { name: "Cabut" }).click();
    await laptopPage.waitForURL(/status=sesi-dicabut/);
    assert.equal(await apiMe(phoneToken), 401, "the other device is out");
    assert.equal(await apiMe((await browserSession(laptop))!), 200, "this device stays in");
    await laptop.close();
    await phone.close();
  });

  test("log out of every device", async () => {
    const first = await newContext(browser);
    const second = await newContext(browser);
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    await loginInBrowser(secondPage);
    await secondPage.waitForURL(`${BASE}/admin`);
    await loginInBrowser(firstPage);
    await firstPage.waitForURL(`${BASE}/admin`);
    const tokens = [(await browserSession(first))!, (await browserSession(second))!];

    await firstPage.goto(`${BASE}/admin/akun`);
    firstPage.once("dialog", (dialog) => dialog.accept());
    await firstPage.getByRole("button", { name: "Keluar dari semua perangkat" }).click();
    await firstPage.waitForURL(/\/admin\/login\?pesan=semua/);
    for (const token of tokens) assert.equal(await apiMe(token), 401);
    assert.equal(await activeSessions(), 0);
    await first.close();
    await second.close();
  });

  test("password change: validation, then every other session is revoked and the new password works", async () => {
    const current = await newContext(browser, { width: 1440, height: 900 });
    const other = await newContext(browser);
    const page = await current.newPage();
    const otherPage = await other.newPage();
    await loginInBrowser(otherPage);
    await otherPage.waitForURL(`${BASE}/admin`);
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    const otherToken = (await browserSession(other))!;
    const oldToken = (await browserSession(current))!;
    const newPassword = generateTestPassword("baru");

    await page.goto(`${BASE}/admin/akun`);
    const submit = async (currentPassword: string, next: string, confirm: string) => {
      await page.locator("button:has-text('Ganti password'):enabled").waitFor();
      await page.fill("#currentPassword", currentPassword);
      await page.fill("#newPassword", next);
      await page.fill("#confirmPassword", confirm);
      const answered = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/akun");
      await page.getByRole("button", { name: "Ganti password" }).click();
      await answered;
    };

    await submit("salah salah salah salah", newPassword, newPassword);
    await page.getByText("Password saat ini salah.").waitFor();

    await submit(E2E_ADMIN.password, newPassword, `${newPassword}x`);
    await page.getByText("Konfirmasi password baru tidak sama.").waitFor();
    await screenshot(page, "akun-galat-1440");

    await submit(E2E_ADMIN.password, newPassword, newPassword);
    await page.waitForURL(/status=password-diganti/);
    assert.match(await infoNotice(page).innerText(), /Password berhasil diganti/);

    const newToken = (await browserSession(current))!;
    assert.notEqual(newToken, oldToken, "this device got a new session");
    assert.equal(await apiMe(newToken), 200);
    assert.equal(await apiMe(oldToken), 401);
    assert.equal(await apiMe(otherToken), 401, "the other device is logged out");

    // the old password no longer works, the new one does
    const fresh = await newContext(browser);
    const freshPage = await fresh.newPage();
    await loginInBrowser(freshPage, E2E_ADMIN.password);
    assert.match(await expectLoginError(freshPage), UNIFORM);
    await freshPage.goto(`${BASE}/admin/login`);
    await loginInBrowser(freshPage, newPassword);
    await freshPage.waitForURL(`${BASE}/admin`);
    await Promise.all([current.close(), other.close(), fresh.close()]);

    // back to the run's password for the next test files (operator CLI path)
    await resetAdminPassword(owner, E2E_ADMIN.password);
  });
});
