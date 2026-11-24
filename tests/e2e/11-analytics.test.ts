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

describe("editorial analytics UI & SVG trend chart (Fase 8)", () => {
  test("renders production KPIs, SVG daily trend chart, channel breakdowns, Search Console notice, and 0px mobile overflow", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    await page.goto(`${BASE}/admin/statistik`);
    await page.getByRole("heading", { name: "Statistik Redaksi", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Produksi artikel terbit per hari" }).waitFor();
    await page.getByRole("img", { name: "Produksi artikel terbit per hari" }).waitFor();
    await page.getByRole("heading", { name: "Artikel terbit per Kanal" }).waitFor();
    await page.getByRole("heading", { name: "Google Search Console (Opsional)" }).waitFor();

    await screenshot(page, "statistik-1440");

    // Verifikasi tautan filter kanal langsung mengarah ke /admin/artikel?status=terbit&kanal=...
    const firstKanalLink = page.locator('a[href*="/admin/artikel?status=terbit&kanal="]').first();
    assert.equal(await firstKanalLink.count(), 1);

    // Mobile 390px: 0px horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/statistik`);
    await page.getByRole("heading", { name: "Statistik Redaksi", exact: true }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `unexpected horizontal overflow on 390px /admin/statistik: ${overflow}px`);
    await screenshot(page, "statistik-390");

    await context.close();
  });
});
