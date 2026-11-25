import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import type { Browser, BrowserContext, Page } from "playwright-core";
import sharp from "sharp";

import { resetAdminPassword } from "@/server/admin/recover";
import { changeArticleState, deleteArticlePermanently } from "@/server/articles/service";
import { deleteAuthor } from "@/server/authors/service";
import { uploadImage } from "@/server/media/service";

import { E2E_ADMIN } from "./admin";
import { app, BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner } from "./helpers";

let browser: Browser;
let context: BrowserContext;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-author-box-"));

function shotDir(): string | null {
  return process.env.E2E_SCREENSHOT_DIR ? path.resolve(process.env.E2E_SCREENSHOT_DIR) : null;
}

async function saveShot(page: Page, name: string, fullPage = false): Promise<void> {
  const dir = shotDir();
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${label}: unexpected horizontal overflow ${overflow}px`);
}

async function makePortrait(filename: string, bg: { r: number; g: number; b: number }): Promise<string> {
  const filePath = path.join(tmp, filename);
  await sharp({ create: { width: 640, height: 640, channels: 3, background: bg } }).jpeg({ quality: 88 }).toFile(filePath);
  return filePath;
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

describe("Dynamic Author Box & Author Profiles (Section 11)", () => {
  const articleSlug = "laporan-author-box-e2e";
  const authorZainalSlug = "dr-zainal-arifin-e2e";
  const authorSitiSlug = "siti-rahmawati-e2e";
  let articleId = "";
  let zainalId = "";
  let sitiId = "";

  test("manages dynamic authors, renders Author Box on Standard & Feature templates, and syncs archive + metadata", async () => {
    const [avatarFile, heroFile] = await Promise.all([
      makePortrait("avatar-zainal.jpg", { r: 166, g: 27, b: 43 }),
      makePortrait("hero-author-box.jpg", { r: 36, g: 76, b: 108 }),
    ]);

    const uploadedAvatar = await uploadImage(
      app,
      { name: "zainal-portrait.jpg", bytes: fs.readFileSync(avatarFile) },
      { alt: "Potret Dr. Zainal Arifin", caption: "", credit: "Foto Redaksi" },
      { adminId: 1 },
    );
    const uploadedHero = await uploadImage(
      app,
      { name: "hero-author.jpg", bytes: fs.readFileSync(heroFile) },
      { alt: "Suasana pesisir timur Sumenep", caption: "Dermaga pagi hari di Kalianget.", credit: "Redaksi" },
      { adminId: 1 },
    );

    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    // 1. Create two dynamic authors via /admin/penulis (1 with avatar + role + bio, 1 minimal without avatar/bio)
    await page.goto(`${BASE}/admin/penulis`);
    await page.getByRole("heading", { name: "Penulis", exact: true }).waitFor();

    await page.getByRole("button", { name: "Pilih / unggah foto" }).click();
    const picker = page.getByRole("dialog", { name: "Pilih foto profil penulis" });
    await picker.waitFor();
    await picker.getByRole("button", { name: /Potret Dr\. Zainal Arifin/ }).first().click();
    await picker.getByRole("button", { name: "Pakai", exact: true }).click();
    await picker.waitFor({ state: "detached" });

    await page.fill("#author-name", "Dr. Zainal Arifin");
    await page.fill("#author-slug", authorZainalSlug);
    await page.fill("#author-role", "Pengamat Kebudayaan Madura");
    await page.fill(
      "#author-bio",
      "Meneliti tradisi pesisir, sastra lisan, dan arsitektur keraton Sumenep selama dua dekade.",
    );
    await page.getByRole("button", { name: "Simpan penulis" }).click();
    await page.getByText(/Penulis "Dr\. Zainal Arifin" ditambahkan\./).waitFor();

    await page.fill("#author-name", "Siti Rahmawati");
    await page.fill("#author-slug", authorSitiSlug);
    await page.fill("#author-role", "Reporter Kota");
    await page.fill("#author-bio", "");
    await page.getByRole("button", { name: "Simpan penulis" }).click();
    await page.getByText(/Penulis "Siti Rahmawati" ditambahkan\./).waitFor();

    const zainalRow = await owner.author.findUniqueOrThrow({ where: { slug: authorZainalSlug } });
    const sitiRow = await owner.author.findUniqueOrThrow({ where: { slug: authorSitiSlug } });
    zainalId = zainalRow.id;
    sitiId = sitiRow.id;

    // 2. Create and publish Standard article assigned to Dr. Zainal Arifin (verifies Redaksi SUMENEP also selectable)
    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.getByRole("textbox", { name: "Isi artikel" }).waitFor();

    const redaksiOptionCount = await page.locator("#penulis option", { hasText: "Redaksi SUMENEP" }).count();
    assert.equal(redaksiOptionCount, 1, "Redaksi SUMENEP must stay available as one selectable profile");
    await page.selectOption("#penulis", zainalId);

    const ekonomi = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "ekonomi" } });
    await page.selectOption("#kanal", ekonomi.id);

    // Select hero media cleanly before filling title so 2.5s autosave timer never races Simpan draf
    await page.locator("#gambar-utama").click();
    const heroPicker = page.getByRole("dialog", { name: "Pilih gambar utama" });
    await heroPicker.waitFor();
    await heroPicker.getByRole("button", { name: /Suasana pesisir timur Sumenep/ }).first().click();
    await heroPicker.getByRole("button", { name: "Pakai", exact: true }).click();
    await heroPicker.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Ganti gambar utama" }).waitFor();

    const bodyBox = page.getByRole("textbox", { name: "Isi artikel" });
    await bodyBox.click();
    await page.keyboard.type("Paragraf laporan utama tentang arsip maritim Kalianget yang ditulis langsung dari lapangan.");

    await page.fill("#lead", "Dokumentasi perahu rakyat dan catatan dermaga membuka perspektif baru sejarah maritim Sumenep.");
    await page.fill("#judul", "Merawat Arsip Maritim Kalianget di Sumenep");
    await page.fill("#slug", articleSlug);

    // Verify Schema NewsArticle sidebar reflects chosen author name
    await page.getByText(/Schema NewsArticle/).waitFor();
    assert.ok((await page.locator("aside, section").allTextContents()).some((t) => t.includes("Dr. Zainal Arifin")));

    await page.getByRole("button", { name: "Simpan draf" }).click();
    await page.waitForURL(/\/admin\/artikel\/[0-9a-f-]{36}$/i, { timeout: 15_000 });
    await page.locator('[data-save-status="saved"]').waitFor({ timeout: 15_000 });
    articleId = page.url().split("/").pop() ?? "";
    assert.ok(articleId);

    const publishBtn = page.getByRole("button", { name: "Terbitkan sekarang" });
    await publishBtn.waitFor({ state: "visible" });
    // Ensure Simpan draf's busy lock has cleared before clicking Terbitkan sekarang.
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Terbitkan sekarang"));
      return Boolean(btn && !btn.disabled);
    }, { timeout: 5_000 });
    await publishBtn.click();
    await page.getByRole("button", { name: "Tarik dari publikasi" }).waitFor({ timeout: 15_000 });

    // 3. Visit public Standard article page -> Author Box MUST render with photo, Lora bold name, role, bio & link
    const pubRes = await page.goto(`${BASE}/artikel/${articleSlug}`);
    assert.equal(pubRes?.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    await assertNoOverflow(page, "standard article author box desktop 1440");

    const authorBox = page.getByTestId("author-box");
    await authorBox.waitFor();

    const desktopCheck = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="author-box"]')!;
      const heading = box.querySelector("h2")!;
      const avatarImg = box.querySelector("img")!;
      const byline = document.querySelector('header a[rel="author"]')!;
      const ogAuthor = document.querySelector('meta[property="article:author"]')?.getAttribute("content");
      return {
        text: box.textContent ?? "",
        headingFont: getComputedStyle(heading).fontFamily,
        headingWeight: Number(getComputedStyle(heading).fontWeight),
        headingColor: getComputedStyle(heading).color,
        avatarComplete: avatarImg.complete && avatarImg.naturalWidth > 0,
        bylineName: byline.textContent?.trim(),
        ogAuthor,
      };
    });

    assert.match(desktopCheck.text, /TENTANG PENULIS/i);
    assert.match(desktopCheck.text, /Dr\. Zainal Arifin/);
    assert.match(desktopCheck.text, /Pengamat Kebudayaan Madura/);
    assert.match(desktopCheck.text, /Meneliti tradisi pesisir, sastra lisan/);
    assert.match(desktopCheck.text, /Semua tulisan Dr\. Zainal Arifin/);
    assert.match(desktopCheck.headingFont, /Lora/i);
    assert.ok(desktopCheck.headingWeight >= 600);
    assert.equal(desktopCheck.avatarComplete, true);
    assert.equal(desktopCheck.bylineName, "Dr. Zainal Arifin");
    assert.equal(desktopCheck.ogAuthor, "Dr. Zainal Arifin");

    await authorBox.scrollIntoViewIfNeeded();
    await saveShot(page, "author-box-standard-1440", false);

    // 4. Click author archive link -> /penulis/[slug] must be 200 OK with author's profile & published article
    await authorBox.getByRole("link", { name: /Semua tulisan Dr\. Zainal Arifin/ }).click();
    await page.waitForURL(`${BASE}/penulis/${authorZainalSlug}`);
    await page.getByRole("heading", { name: "Dr. Zainal Arifin", level: 1 }).waitFor();
    await page.getByText(/Pengamat Kebudayaan Madura — Meneliti tradisi pesisir/).waitFor();
    await page.getByRole("heading", { name: "Merawat Arsip Maritim Kalianget di Sumenep" }).waitFor();
    await assertNoOverflow(page, "author archive desktop 1440");
    await saveShot(page, "author-archive-1440", false);

    // 5. Mobile 390x844 responsive check on article Author Box
    const mobileCtx = await newContext(browser, { width: 390, height: 844 });
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.goto(`${BASE}/artikel/${articleSlug}`);
    await mobilePage.evaluate(() => document.fonts.ready);
    await mobilePage.getByTestId("author-box").scrollIntoViewIfNeeded();
    await assertNoOverflow(mobilePage, "standard article author box mobile 390");
    await saveShot(mobilePage, "author-box-mobile-390", false);
    await mobileCtx.close();

    // 6. Verify /admin/artikel list & Penulis filter reflect the chosen author accurately
    await page.goto(`${BASE}/admin/artikel?penulis=${authorZainalSlug}`);
    await page.getByText("Merawat Arsip Maritim Kalianget di Sumenep").waitFor();
    const listText = await page.locator("main ul li").first().textContent();
    assert.ok(listText?.includes("Dr. Zainal Arifin"));

    // 7. Reassign article to Siti Rahmawati (Feature template, no bio, monogram avatar), update & verify consistency
    await page.goto(`${BASE}/admin/artikel/${articleId}`);
    await page.locator('input[name="template"][value="FEATURE"]').check();
    await page.selectOption("#penulis", sitiId);
    await page.getByRole("button", { name: "Perbarui" }).click();
    await page.locator('[data-save-status="saved"]').waitFor({ timeout: 15_000 });

    await page.goto(`${BASE}/artikel/${articleSlug}`);
    await page.evaluate(() => document.fonts.ready);
    const updatedBox = page.getByTestId("author-box");
    await updatedBox.waitFor();
    const minimalCheck = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="author-box"]')!;
      const byline = document.querySelector('header a[rel="author"]')!;
      const ogAuthor = document.querySelector('meta[property="article:author"]')?.getAttribute("content");
      return {
        text: box.textContent ?? "",
        imgCount: box.querySelectorAll("img").length,
        paragraphs: box.querySelectorAll("p").length,
        bylineName: byline.textContent?.trim(),
        ogAuthor,
      };
    });

    assert.match(minimalCheck.text, /Siti Rahmawati/);
    assert.match(minimalCheck.text, /Reporter Kota/);
    assert.equal(minimalCheck.imgCount, 0, "Author without photo falls back cleanly to initial monogram");
    assert.equal(minimalCheck.paragraphs, 2, "Only eyebrow and role paragraphs render when bio is omitted");
    assert.equal(minimalCheck.bylineName, "Siti Rahmawati");
    assert.equal(minimalCheck.ogAuthor, "Siti Rahmawati");

    await updatedBox.scrollIntoViewIfNeeded();
    await saveShot(page, "author-box-minimal-1440", false);

    // 8. Clean up E2E rows so throw-away DB remains clean
    const actor = { adminId: 1 };
    const latest = await owner.article.findUniqueOrThrow({ where: { id: articleId }, select: { version: true } });
    await changeArticleState(app, articleId, latest.version, "trash", actor);
    await deleteArticlePermanently(app, articleId, actor);
    await deleteAuthor(app, zainalId, actor);
    await deleteAuthor(app, sitiId, actor);
    await owner.media.deleteMany({ where: { id: { in: [uploadedAvatar.media.id, uploadedHero.media.id] } } });

    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join("; ")}`);
    await page.close();
  });
});
