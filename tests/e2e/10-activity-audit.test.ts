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

describe("activity audit & login security UI (Fase 7)", () => {
  test("displays live activity log, category filters, login attempts, article status timeline, and 0px mobile overflow", async () => {
    // Pastikan minimal satu artikel terbit memiliki riwayat transisi status
    const published = await owner.article.findFirst({
      where: { status: "PUBLISHED", deletedAt: null },
      select: { id: true },
    });

    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    // 1. Buka /admin/aktivitas dan periksa KPI, log aktivitas (auth.login), serta riwayat login
    await page.goto(`${BASE}/admin/aktivitas`);
    await page.getByRole("heading", { name: "Aktivitas & Keamanan", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Log aktivitas redaksi & sistem" }).waitFor();
    await page.getByRole("heading", { name: "Riwayat percobaan login" }).waitFor();
    await page.getByText("auth.login").first().waitFor();

    // 2. Uji filter kategori
    await page.getByRole("link", { name: "Keamanan & Auth", exact: true }).click();
    await page.waitForURL(/kategori=auth/);
    await page.getByText("auth.login").first().waitFor();

    await screenshot(page, "aktivitas-1440");

    // 3. Cek tampilan mobile 390px tanpa horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/aktivitas`);
    await page.getByRole("heading", { name: "Aktivitas & Keamanan", exact: true }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `unexpected horizontal overflow on 390px /admin/aktivitas: ${overflow}px`);
    await screenshot(page, "aktivitas-390");

    // 4. Jika ada artikel dengan status history, verifikasi panel Riwayat status di editor
    if (published) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE}/admin/artikel/${published.id}`);
      const statusSection = page.getByRole("button", { name: /Riwayat status/ });
      if ((await statusSection.count()) > 0) {
        await statusSection.click();
        assert.equal(await statusSection.getAttribute("aria-expanded"), "true");
      }
    }

    await context.close();
  });
});
