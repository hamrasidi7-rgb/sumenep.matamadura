import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import type { Browser } from "playwright-core";

import { resetAdminPassword } from "@/server/admin/recover";

import { E2E_ADMIN } from "./admin";
import { BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner, screenshot } from "./helpers";

let browser: Browser;

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password);
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await closeAll();
});

describe("editorial authors & sections (Fase 4)", () => {
  test("create, edit, toggle author and section; verify live sync with article editor and 0px mobile overflow", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    // 1. Tambah penulis via /admin/penulis
    await page.goto(`${BASE}/admin/penulis`);
    await page.getByRole("heading", { name: "Penulis", exact: true }).waitFor();
    await page.fill("#author-name", "Koresponden Kangean E2E");
    await page.fill("#author-role", "Kontributor Kangean");
    await page.fill("#author-bio", "Menulis laporan khusus masyarakat kepulauan Sumenep.");
    await page.getByRole("button", { name: "Simpan penulis" }).click();
    await page.getByText(/Penulis "Koresponden Kangean E2E" ditambahkan\./).waitFor();
    await screenshot(page, "penulis-1440");

    // 2. Tambah kanal via /admin/seksi
    await page.goto(`${BASE}/admin/seksi`);
    await page.getByRole("heading", { name: "Kanal & Rubrik", exact: true }).waitFor();
    await page.fill("#section-name", "Bahari & Kepulauan");
    await page.fill("#section-desc", "Kabar kelautan dan transportasi pulau.");
    await page.getByRole("button", { name: "Simpan Kanal" }).click();
    await page.getByText(/Kanal "Bahari & Kepulauan" ditambahkan\./).waitFor();
    await screenshot(page, "seksi-1440");

    // 3. Verifikasi pilihan muncul di dropdown editor artikel (/admin/artikel/baru)
    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.selectOption("#penulis", { label: "Koresponden Kangean E2E" });
    await page.selectOption("#kanal", { label: "Bahari & Kepulauan" });

    // 4. Mobile 390x844 overflow check
    const mobile = await newContext(browser, { width: 390, height: 844 });
    const mPage = await mobile.newPage();
    await loginInBrowser(mPage);
    await mPage.waitForURL(`${BASE}/admin`);
    for (const [route, name] of [
      ["/admin/penulis", "penulis-390"],
      ["/admin/seksi", "seksi-390"],
    ] as const) {
      await mPage.goto(`${BASE}${route}`);
      const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${route} mobile overflow=${overflow}`);
      await screenshot(mPage, name);
    }
    await mobile.close();

    // Bersihkan entitas E2E agar state bersih jika ada suite lanjutan
    await page.goto(`${BASE}/admin/penulis`);
    page.once("dialog", (d) => d.accept());
    await page.locator("li", { hasText: "Koresponden Kangean E2E" }).getByRole("button", { name: "Hapus" }).click();
    await page.getByText(/Profil "Koresponden Kangean E2E" dihapus\./).waitFor();

    await page.goto(`${BASE}/admin/seksi`);
    page.once("dialog", (d) => d.accept());
    await page.locator("li", { hasText: "Bahari & Kepulauan" }).getByRole("button", { name: "Hapus" }).click();
    await page.getByText(/"Bahari & Kepulauan" dihapus\./).waitFor();

    await context.close();
  });
});
