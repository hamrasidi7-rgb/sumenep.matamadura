import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import type { Browser } from "playwright-core";

import { resetAdminPassword } from "@/server/admin/recover";

import { E2E_ADMIN } from "./admin";
import { BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner, screenshot } from "./helpers";

let browser: Browser;

const CMS_ROUTES = [
  { path: "/admin", heading: /Selamat datang,/ },
  { path: "/admin/statistik", heading: "Statistik Redaksi" },
  { path: "/admin/artikel", heading: "Artikel" },
  { path: "/admin/artikel/baru", heading: null },
  { path: "/admin/hero", heading: "Hero Utama" },
  { path: "/admin/media", heading: "Media Library" },
  { path: "/admin/seksi", heading: "Kanal & Rubrik" },
  { path: "/admin/penulis", heading: "Penulis" },
  { path: "/admin/aktivitas", heading: "Aktivitas & Keamanan" },
  { path: "/admin/pengaturan", heading: "Pengaturan CMS" },
  { path: "/admin/akun", heading: "Akun & Keamanan" },
] as const;

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password);
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await closeAll();
});

describe("CMS full integration & responsive audit (Fase 10)", () => {
  test("every CMS route renders cleanly on desktop (1440px) & mobile (390px) with zero console errors or overflow", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    // Verifikasi Dashboard memiliki tautan silang lengkap ke semua modul baru
    for (const href of [
      "/admin/statistik",
      "/admin/hero",
      "/admin/media",
      "/admin/seksi",
      "/admin/penulis",
      "/admin/aktivitas",
      "/admin/pengaturan",
      "/admin/akun",
    ]) {
      assert.ok((await page.locator(`a[href="${href}"]`).count()) >= 1, `missing dashboard link to ${href}`);
    }
    await screenshot(page, "dashboard-final-1440");

    // Kunjungi seluruh rute pada desktop 1440px dan mobile 390px
    for (const route of CMS_ROUTES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      const resDesktop = await page.goto(`${BASE}${route.path}`);
      assert.equal(resDesktop?.status(), 200, `${route.path} returned ${resDesktop?.status()}`);
      if (route.heading) {
        await page.getByRole("heading", { name: route.heading }).first().waitFor();
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(60);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.ok(overflow <= 1, `${route.path} horizontal overflow on 390px: ${overflow}px`);
    }

    assert.equal(pageErrors.length, 0, `unexpected browser page errors: ${pageErrors.join("; ")}`);
    await context.close();
  });
});
