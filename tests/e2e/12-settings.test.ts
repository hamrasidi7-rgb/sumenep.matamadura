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

describe("CMS settings & homepage curation UI (Fase 9)", () => {
  test("saves site identity & homepage layout settings, persists across reload, and has 0px mobile overflow", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    await page.goto(`${BASE}/admin/pengaturan`);
    await page.getByRole("heading", { name: "Pengaturan CMS", exact: true }).waitFor();

    // 1. Simpan Pengaturan Situs
    await page.fill("#site-tagline", "Portal Kepulauan & Daratan Sumenep E2E");
    await page.fill("#site-email", "meja.redaksi@sumenep.test");
    await page.getByRole("button", { name: "Simpan Pengaturan Situs" }).click();
    await page.getByText("Pengaturan situs & media sosial berhasil disimpan.").waitFor();

    // 2. Simpan Kurasi Beranda
    await page.fill("#latest-count", "6");
    await page.getByRole("button", { name: "Simpan Susunan Beranda" }).click();
    await page.getByText("Susunan kurasi beranda berhasil disimpan.").waitFor();

    // 3. Reload dan pastikan persisten di UI & database
    await page.reload();
    assert.equal(
      await page.inputValue("#site-tagline"),
      "Portal Kepulauan & Daratan Sumenep E2E",
    );
    assert.equal(await page.inputValue("#latest-count"), "6");
    await screenshot(page, "pengaturan-1440");

    // 4. Mobile 390px check
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/pengaturan`);
    await page.getByRole("heading", { name: "Pengaturan CMS", exact: true }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `unexpected horizontal overflow on 390px /admin/pengaturan: ${overflow}px`);
    await screenshot(page, "pengaturan-390");

    await context.close();
  });
});
