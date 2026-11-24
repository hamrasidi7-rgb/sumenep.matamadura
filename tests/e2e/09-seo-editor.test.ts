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

describe("SEO panel, word counters, slug safeguard & Open Graph preview (Fase 6)", () => {
  test("live word counts, non-destructive slug sync, Open Graph card preview, and mobile collapsible sections", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.getByText(/Tulis judul dan isi artikel dulu/).waitFor();

    // 1. Isi judul + modifikasi slug manual, lalu ubah judul -> slug TIDAK berubah otomatis
    await page.fill("#judul", "Nelayan Sapeken Mulai Melaut");
    await page.fill("#slug", "nelayan-sapeken-awal");
    await page.fill("#judul", "Nelayan Sapeken Panen Ikan Segar");
    assert.equal(await page.inputValue("#slug"), "nelayan-sapeken-awal");

    const syncButton = page.getByRole("button", {
      name: /Sesuaikan slug \(nelayan-sapeken-panen-ikan-segar\)/,
    });
    await syncButton.waitFor();
    await syncButton.click();
    assert.equal(await page.inputValue("#slug"), "nelayan-sapeken-panen-ikan-segar");

    // 2. Hitung kata Lead & Isi + Pratinjau Open Graph
    await page.fill(
      "#lead",
      "Cuaca cerah di perairan timur Sumenep mendorong hasil tangkapan nelayan meningkat pekan ini.",
    );
    const body = page.getByRole("textbox", { name: "Isi artikel" });
    await body.click();
    await page.keyboard.type("Laporan langsung dari pelabuhan rakyat Kalianget pagi ini memperlihatkan aktivitas bongkar muat ikan tongkol.");

    await page.getByText(/Estimasi 1 menit baca/).waitFor();
    await page.getByText("Pratinjau berbagi media sosial (Open Graph)").waitFor();
    await page.getByText("Schema NewsArticle").waitFor();

    await screenshot(page, "seo-editor-1440");

    // 3. Cek mobile 390px: SettingsSection terlipat rapi, dapat dibuka tanpa horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.fill("#judul", "Uji Seluler SEO");
    const seoToggle = page.getByRole("button", { name: /^SEO\b/ });
    assert.equal(await seoToggle.getAttribute("aria-expanded"), "false");
    await seoToggle.click();
    assert.equal(await seoToggle.getAttribute("aria-expanded"), "true");
    await page.locator("#seo-title").waitFor();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `unexpected horizontal overflow on 390px editor: ${overflow}px`);
    await screenshot(page, "seo-editor-390");

    await context.close();
  });
});
