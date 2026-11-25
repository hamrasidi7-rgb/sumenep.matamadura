import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import type { Browser, BrowserContext, Page } from "playwright-core";
import sharp from "sharp";

import { resetAdminPassword } from "@/server/admin/recover";
import { changeArticleState, deleteArticlePermanently } from "@/server/articles/service";
import { uploadImage } from "@/server/media/service";

import { E2E_ADMIN } from "./admin";
import { app, BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner } from "./helpers";

let browser: Browser;
let context: BrowserContext;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-featured-1200x750-"));

async function makeImage(filename: string, width: number, height: number, bg: { r: number; g: number; b: number }): Promise<string> {
  const filePath = path.join(tmp, filename);
  await sharp({ create: { width, height, channels: 3, background: bg } }).jpeg({ quality: 88 }).toFile(filePath);
  return filePath;
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${label}: horizontal overflow ${overflow}px`);
}

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password);
  browser = await launchBrowser();
  context = await newContext(browser, { width: 1440, height: 900 });
  const page = await context.newPage();
  await loginInBrowser(page);
  await page.waitForURL(`${BASE}/admin`);
  await page.close();
});

after(async () => {
  await browser?.close();
  await closeAll();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Featured Image 1200×750 (16:10), Focal Crop & Consistent Public Ratios", () => {
  const slug = "uji-featured-image-1200x750-e2e";

  test("uploads featured image with 1200×750 focal crop, replaces & re-crops from Media Library, and verifies 16:10 across site", async () => {
    const [wideFile, squareFile] = await Promise.all([
      makeImage("wide-16x9.jpg", 1600, 900, { r: 28, g: 82, b: 120 }),
      makeImage("square-library.jpg", 900, 900, { r: 166, g: 27, b: 43 }),
    ]);

    // Pre-seed one square image in Media Library to test selecting + re-cropping existing library media.
    const squareMedia = await uploadImage(
      app,
      { name: "square-library.jpg", bytes: fs.readFileSync(squareFile) },
      { alt: "Foto Persegi Pustaka Media", caption: "Caption pustaka media.", credit: "Foto: Pustaka" },
      { adminId: 1 },
    );

    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.getByRole("textbox", { name: "Isi artikel" }).waitFor();

    // 1. Upload 16:9 image via HeroPanel -> auto-cropped to 1200×750 with focal point "Kiri"
    await page.locator("#gambar-utama").click();
    const picker = page.getByRole("dialog", { name: "Pilih gambar utama" });
    await picker.waitFor();
    await picker.getByText(/1200 × 750 px \(16:10\)/).first().waitFor();

    await picker.getByRole("tab", { name: "Unggah baru" }).click();
    await picker.locator('input[type="file"]').setInputFiles(wideFile);
    await picker.getByTestId("focal-point-frame").waitFor();
    await picker.getByRole("button", { name: "Kiri", exact: true }).click();
    await picker.getByText(/20% × 50%/).waitFor();

    await picker.getByLabel(/Teks alternatif/).fill("Pelabuhan Kalianget 1200x750");
    await picker.getByLabel("Caption").fill("Perahu nelayan bersandar di dermaga pagi hari.");
    await picker.getByLabel("Kredit foto").fill("Foto: Tim Sumenep");
    await picker.getByRole("button", { name: "Unggah & pakai" }).click();
    await picker.waitFor({ state: "detached" });

    // HeroPanel must confirm exact 1200 × 750 px crop and display alt/caption/credit inputs
    await page.getByText(/Saat ini 1200 × 750 px/).waitFor();
    const uploadedHeroId = (await owner.media.findFirstOrThrow({
      where: { alt: "Pelabuhan Kalianget 1200x750" },
      select: { id: true, width: true, height: true },
    }));
    assert.deepEqual([uploadedHeroId.width, uploadedHeroId.height], [1200, 750]);

    // 2. Replace hero image from Media Library with square 900×900, verify ratio hint, then crop 16:10 inline
    await page.locator("#gambar-utama").click();
    const replacePicker = page.getByRole("dialog", { name: "Pilih gambar utama" });
    await replacePicker.waitFor();
    await replacePicker.getByRole("button", { name: /Foto Persegi Pustaka Media/ }).first().click();
    await replacePicker.getByRole("button", { name: "Pakai", exact: true }).click();
    await replacePicker.waitFor({ state: "detached" });

    await page.getByText(/Saat ini 900 × 900 px/).waitFor();
    await page.getByText(/belum 16:10/).waitFor();

    await page.getByRole("button", { name: /Crop 16:10/ }).click();
    await page.getByTestId("focal-point-frame").waitFor();
    await page.getByRole("button", { name: "Atas", exact: true }).click();
    await page.getByRole("button", { name: /Simpan crop 1200 × 750/ }).click();
    await page.getByText(/Crop 1200 × 750 px \(fokus 50% × 20%\) diterapkan\./).waitFor({ timeout: 15_000 });
    await page.getByText(/Saat ini 1200 × 750 px/).waitFor();

    // Update caption & credit right inside HeroPanel (blurs to save)
    const captionInput = page.locator("fieldset").getByLabel("Caption");
    const creditInput = page.locator("fieldset").getByLabel("Kredit foto");
    await captionInput.fill("Caption gambar utama setelah crop 16:10.");
    await creditInput.fill("Foto: Redaksi Sumenep");
    await creditInput.blur();
    await page.getByText(/Keterangan gambar tersimpan/).waitFor({ timeout: 10_000 });

    // 3. Complete & publish article so we can verify 16:10 rendering on public article, category, and homepage
    const ekonomi = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "ekonomi" } });
    await page.selectOption("#kanal", ekonomi.id);
    const bodyBox = page.getByRole("textbox", { name: "Isi artikel" });
    await bodyBox.click();
    await page.keyboard.type("Paragraf uji gambar utama 1200x750 rasio 16:10 di seluruh tampilan situs.");
    await page.fill("#lead", "Lead uji gambar utama 1200 kali 750 untuk konsistensi beranda, kanal, dan artikel.");
    await page.fill("#judul", "Uji Konsistensi Gambar Utama 1200x750");
    await page.fill("#slug", slug);

    await page.getByRole("button", { name: "Simpan draf" }).click();
    await page.waitForURL(/\/admin\/artikel\/[0-9a-f-]{36}$/i, { timeout: 15_000 });
    await page.locator('[data-save-status="saved"]').waitFor({ timeout: 15_000 });
    const articleId = page.url().split("/").pop() ?? "";
    assert.ok(articleId);

    const croppedHeroRow = await owner.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { heroMediaId: true, heroMedia: { select: { width: true, height: true } } },
    });
    assert.deepEqual([croppedHeroRow.heroMedia?.width, croppedHeroRow.heroMedia?.height], [1200, 750]);

    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Terbitkan sekarang"));
      return Boolean(btn && !btn.disabled);
    }, { timeout: 5_000 });
    await page.getByRole("button", { name: "Terbitkan sekarang" }).click();
    await page.getByRole("button", { name: "Tarik dari publikasi" }).waitFor({ timeout: 15_000 });

    // 4. Verify 16:10 ratio (~1.6) & caption/credit on public article, homepage, and category on desktop + mobile
    for (const [label, url, checkCaption] of [
      ["article", `${BASE}/artikel/${slug}`, true],
      ["homepage", `${BASE}/`, false],
      ["category", `${BASE}/kanal/ekonomi`, false],
    ] as const) {
      const res = await page.goto(url);
      assert.equal(res?.status(), 200, `${label} status`);
      await assertNoOverflow(page, `${label} desktop 1440`);

      const ratio = await page.evaluate(() => {
        const img = document.querySelector('div[style*="aspect-ratio"] img') as HTMLImageElement | null;
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return r.height > 0 ? r.width / r.height : null;
      });
      assert.ok(ratio && Math.abs(ratio - 1.6) < 0.08, `${label} desktop image ratio=${ratio} expected ~1.6 (16:10)`);

      if (checkCaption) {
        const captionText = await page.locator("figcaption").first().textContent();
        assert.match(captionText ?? "", /Caption gambar utama setelah crop 16:10\./);
        assert.match(captionText ?? "", /Foto: Redaksi Sumenep/);
      }
    }

    // Mobile 390x844 check across article, homepage, and category
    const mobileCtx = await newContext(browser, { width: 390, height: 844 });
    const mPage = await mobileCtx.newPage();
    for (const [label, url] of [
      ["article", `${BASE}/artikel/${slug}`],
      ["homepage", `${BASE}/`],
      ["category", `${BASE}/kanal/ekonomi`],
    ] as const) {
      await mPage.goto(url);
      await assertNoOverflow(mPage, `${label} mobile 390`);
      const ratio = await mPage.evaluate(() => {
        const img = document.querySelector('div[style*="aspect-ratio"] img') as HTMLImageElement | null;
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return r.height > 0 ? r.width / r.height : null;
      });
      assert.ok(ratio && Math.abs(ratio - 1.6) < 0.1, `${label} mobile image ratio=${ratio} expected ~1.6 (16:10)`);
    }
    await mobileCtx.close();

    // Cleanup created article and media
    const actor = { adminId: 1 };
    const latest = await owner.article.findUniqueOrThrow({ where: { id: articleId }, select: { version: true } });
    await changeArticleState(app, articleId, latest.version, "trash", actor);
    await deleteArticlePermanently(app, articleId, actor);
    await owner.media.deleteMany({
      where: { id: { in: [uploadedHeroId.id, squareMedia.media.id, ...(croppedHeroRow.heroMediaId ? [croppedHeroRow.heroMediaId] : [])] } },
    });

    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join("; ")}`);
    await page.close();
  });
});
