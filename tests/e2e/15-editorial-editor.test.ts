import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import type { Browser, BrowserContext, Page } from "playwright-core";
import sharp from "sharp";

import { resetAdminPassword } from "@/server/admin/recover";
import { createArticle } from "@/server/articles/service";
import { uploadImage } from "@/server/media/service";

import { E2E_ADMIN } from "./admin";
import { app, BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner } from "./helpers";

let browser: Browser;
let context: BrowserContext;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-editorial-img-"));

function shotDir(): string | null {
  return process.env.E2E_SCREENSHOT_DIR ? path.resolve(process.env.E2E_SCREENSHOT_DIR) : null;
}

async function saveShot(page: Page, name: string, fullPage = false): Promise<void> {
  const dir = shotDir();
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  if (fullPage) {
    // Trigger lazy-loaded images along the page, then return cleanly to top before fullPage shot.
    await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll("img")];
      for (const img of imgs) img.loading = "eager";
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? img.decode().catch(() => {})
            : new Promise((res) => {
                img.addEventListener("load", () => res(null), { once: true });
                img.addEventListener("error", () => res(null), { once: true });
              }),
        ),
      );
      window.scrollTo(0, 0);
    });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
}

async function makePhoto(filename: string, bg: { r: number; g: number; b: number }): Promise<string> {
  const p = path.join(tmp, filename);
  await sharp({ create: { width: 1400, height: 840, channels: 3, background: bg } }).jpeg({ quality: 88 }).toFile(p);
  return p;
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const { extra, culprits } = await page.evaluate(() => {
    const w = window.innerWidth;
    const bad = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((el) => ({ el, r: el.getBoundingClientRect().right }))
      .filter(({ r }) => r > w + 1)
      .sort((a, b) => b.r - a.r)
      .slice(0, 4)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} (${Math.round(r)}px/${w}px)`);
    return { extra: document.documentElement.scrollWidth - w, culprits: bad };
  });
  assert.ok(extra <= 1, `${label}: overflow horizontal ${extra}px — ${culprits.join(", ")}`);
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

describe("Editorial Block Editor & Nieman Typography (end-to-end)", () => {
  let articleId = "";
  let slug = "";
  let heroMediaId = "";
  let fullMediaId = "";
  let leftMediaId = "";
  let pairLeftId = "";
  let pairRightId = "";

  test("uploads editorial sample images, composes multi-block article, reorders blocks, and persists on reload", async () => {
    const author = await owner.author.findUniqueOrThrow({ where: { slug: "redaksi" } });
    const kanal = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "ekonomi" } });
    assert.ok(author && kanal);

    const files = await Promise.all([
      makePhoto("hero-pesisir.jpg", { r: 30, g: 78, b: 112 }),
      makePhoto("full-garam.jpg", { r: 166, g: 120, b: 68 }),
      makePhoto("nelayan-kiri.jpg", { r: 44, g: 102, b: 88 }),
      makePhoto("pair-1.jpg", { r: 140, g: 52, b: 56 }),
      makePhoto("pair-2.jpg", { r: 62, g: 82, b: 104 }),
    ]);

    heroMediaId = (await uploadImage(app, { name: "hero.jpg", bytes: fs.readFileSync(files[0]) }, { alt: "Perahu tradisional Sumenep saat pagi", caption: "Aktivitas pagi di dermaga Kalianget.", credit: "Ahmad Fauzi" }, { adminId: 1 })).media.id;
    fullMediaId = (await uploadImage(app, { name: "full.jpg", bytes: fs.readFileSync(files[1]) }, { alt: "Hamparan tambak garam di pesisir timur Sumenep", caption: "Ladang garam rakyat membentang menjelang panen raya.", credit: "Sari Hartini" }, { adminId: 1 })).media.id;
    leftMediaId = (await uploadImage(app, { name: "left.jpg", bytes: fs.readFileSync(files[2]) }, { alt: "Petani garam memeriksa kualitas kristal putih", caption: "Pemeriksaan kadar air sebelum pengumpulan.", credit: "Budi Santoso" }, { adminId: 1 })).media.id;
    pairLeftId = (await uploadImage(app, { name: "p1.jpg", bytes: fs.readFileSync(files[3]) }, { alt: "Proses penjemuran di meja kristalisasi", caption: "Tahap pengeringan awal.", credit: "Redaksi" }, { adminId: 1 })).media.id;
    pairRightId = (await uploadImage(app, { name: "p2.jpg", bytes: fs.readFileSync(files[4]) }, { alt: "Karung garam siap distribusi menuju pelabuhan", caption: "Pengemasan hasil panen.", credit: "Redaksi" }, { adminId: 1 })).media.id;

    // 1. Create article using rich editorial TipTap document & editor UI
    const initialTitle = "Ekonomi Garam Kepulauan: Membaca Rantai Nilai dari Tambak ke Dermaga";
    slug = "ekonomi-garam-kepulauan-uji-editorial";
    const created = await createArticle(
      app,
      {
        title: initialTitle,
        slug,
        standfirst: "Di pesisir timur Sumenep, produktivitas tambak rakyat bergantung pada tata kelola ruang pesisir, jadwal pengiriman antarpulau, dan kepastian serapan industri.",
        template: "FEATURE",
        authorId: author.id,
        kanalId: kanal.id,
        heroMediaId,
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { dropCap: true },
              content: [
                {
                  type: "text",
                  text: "Matahari terbit perlahan di atas petak tambak Kalianget ketika sejumlah petani mulai mengukur tingkat salinitas air tua dengan alat ukur tradisional menjelang musim panen garam rakyat.",
                },
              ],
            },
            {
              type: "pullQuote",
              attrs: {
                text: "Ketika rantai distribusi pelabuhan tersendat tiga hari saja, harga jual di tingkat petambak langsung tertekan.",
                attribution: "H. Syafiuddin, Koordinator Petambak Garam Kalianget",
                variant: "editorial",
              },
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Laporan lapangan ini mencatat " },
                {
                  type: "text",
                  text: "lonjakan biaya logistik antarpulau",
                  marks: [{ type: "textStyle", attrs: { color: "#A61B2B", fontSize: "lg" } }, { type: "bold" }],
                },
                { type: "text", text: " yang terjadi bersamaan dengan " },
                {
                  type: "text",
                  text: "perubahan pola kemarau basah sepanjang tahun berjalan",
                  marks: [{ type: "highlight", attrs: { color: "#FAF3D6" } }],
                },
                { type: "text", text: " di daratan hingga gugus kepulauan Sumenep." },
              ],
            },
            {
              type: "largeStatement",
              attrs: {
                headline: "68%",
                description: "Proporsi biaya distribusi yang terserap pada pengangkutan laut antarkecamatan kepulauan dan penimbangan ulang.",
                source: "Olahan data koperasi pesisir, 2026",
                tone: "cream",
              },
            },
            {
              type: "articleImage",
              attrs: {
                mediaId: fullMediaId,
                alt: "Hamparan tambak garam di pesisir timur Sumenep",
                caption: "Bentang tambak garam di Kalianget dilihat dari sisi selatan.",
                credit: "Sari Hartini",
                size: "full",
                ratio: "16/9",
              },
            },
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Dari Petak Tambak ke Kapal Kayu" }],
            },
            {
              type: "articleImage",
              attrs: {
                mediaId: leftMediaId,
                alt: "Petani garam memeriksa kualitas kristal",
                caption: "Petani memilah hasil panen harian.",
                credit: "Budi Santoso",
                size: "column",
                align: "left",
                ratio: "4/3",
              },
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Setiap pagi sebelum gelombang naik, tumpukan garam dimasukkan ke dalam karung anyaman plastik dan diangkut menggunakan perahu motor kayu menuju titik kumpul utama di dermaga kepulauan.",
                },
              ],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Aliran teks di sebelah gambar membantu pembaca melihat konteks kerja lapangan sekaligus mengikuti narasi teknis panen tanpa memecah ritme baca pada layar lebar.",
                },
              ],
            },
            {
              type: "articleImage",
              attrs: {
                mediaId: pairLeftId,
                alt: "Proses pengeringan garam meja",
                caption: "Meja kristalisasi di sisi barat.",
                credit: "Redaksi SUMENEP",
                layout: "pair",
                ratio: "4/3",
                pairMediaId: pairRightId,
                pairAlt: "Pengemasan karung garam",
                pairCaption: "Karung siap muat di dermaga.",
                pairCredit: "Redaksi SUMENEP",
              },
            },
            {
              type: "factBox",
              attrs: {
                title: "Ringkasan Temuan Lapangan",
                items: [
                  "Musim produksi rata-rata berlangsung 4 hingga 5 bulan efektif.",
                  "Penggunaan alas geomembran meningkatkan kebersihan kristal garam rakyat.",
                  "Integrasi gudang resi dapat menahan penjualan saat harga jatuh.",
                ],
                source: "Wawancara lapangan & Dinas terkait",
                tone: "cream",
              },
            },
            {
              type: "callout",
              attrs: {
                label: "Catatan Redaksi",
                title: "Cakupan Wawancara",
                body: "Data dalam laporan ini dikumpulkan sepanjang dua pekan liputan langsung di Kalianget, Saronggi, dan Talango.",
                tone: "blush",
              },
            },
            { type: "horizontalRule", attrs: { variant: "dots" } },
          ],
        },
      },
      { adminId: 1 },
    );
    assert.ok(created.ok);
    articleId = created.id;

    // 2. Open in Editorial Block Editor, verify interactive toolbar controls & reorder, save, reload
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}/admin/artikel/${articleId}`);
    await page.getByRole("textbox", { name: "Isi artikel" }).waitFor();

    // Verify Drop Cap rendered in editor canvas, + Tambah blok menu opens cleanly, typography menus open without overflow
    assert.equal(await page.locator('.cms-prose p[data-drop-cap="true"]').count(), 1);
    await page.getByRole("button", { name: "Warna teks" }).click();
    await page.getByRole("dialog", { name: "Pilih warna teks editorial" }).waitFor();
    await page.getByRole("button", { name: "Sorotan teks" }).click();
    await page.getByRole("dialog", { name: "Pilih sorotan teks editorial" }).waitFor();
    await page.getByRole("button", { name: "Ukuran teks" }).click();
    await page.getByRole("dialog", { name: "Pilih ukuran teks" }).waitFor();
    await page.getByRole("button", { name: "Tambah blok" }).click();
    await page.getByRole("dialog", { name: "Pilih jenis blok editorial" }).waitFor();
    await page.keyboard.press("Escape");

    // Capture full editor view (including sticky editorial toolbar and structured blocks)
    await assertNoOverflow(page, "editor desktop 1440");
    await saveShot(page, "editorial-01-editor-1440", false);

    // Toggle reorder on Kotak Fakta block up & back down so persistence is tested interactively
    const factBlock = page.locator('[data-block="Kotak fakta"]');
    await factBlock.getByRole("button", { name: "Geser kotak fakta ke atas" }).click();
    await factBlock.getByRole("button", { name: "Geser kotak fakta ke bawah" }).click();

    await page.getByRole("button", { name: "Simpan draf" }).click();
    await page.locator('[data-save-status="saved"]').waitFor({ timeout: 15_000 });

    const persisted = await owner.article.findUniqueOrThrow({ where: { id: articleId } });
    const nodeTypes = ((persisted.body as { content?: { type: string }[] }).content ?? []).map((n) => n.type);
    const pairIdx = nodeTypes.lastIndexOf("articleImage");
    const factIdx = nodeTypes.indexOf("factBox");
    const calloutIdx = nodeTypes.indexOf("callout");
    assert.ok(pairIdx >= 0 && factIdx > pairIdx && calloutIdx > factIdx, `unexpected order after up+down: ${nodeTypes.join(", ")}`);

    await page.reload();
    await page.getByRole("textbox", { name: "Isi artikel" }).waitFor();
    assert.equal(await page.locator('.cms-prose p[data-drop-cap="true"]').count(), 1);
    assert.equal(await page.locator('[data-block="Pernyataan besar"]').count(), 1);
    assert.equal(await page.locator('[data-block="Kotak fakta"]').count(), 1);
    assert.equal(await page.locator('[data-block="Callout informasi"]').count(), 1);

    assert.deepEqual(consoleErrors, [], `console errors on editor: ${consoleErrors.join("; ")}`);
    await page.close();
  });

  test("edits an existing legacy article cleanly without breaking prior blocks", async () => {
    const author = await owner.author.findUniqueOrThrow({ where: { slug: "redaksi" } });
    const kanal = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "ekonomi" } });
    const legacy = await createArticle(
      app,
      {
        title: "Artikel Lama Kompatibel Editor Baru",
        standfirst: "Ringkasan artikel format lama.",
        authorId: author.id,
        kanalId: kanal.id,
        body: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Paragraf lama sebelum pembaruan editor.", marks: [{ type: "bold" }] }] },
            { type: "pullQuote", attrs: { text: "Kutipan lama tetap utuh.", attribution: "Redaksi" } },
          ],
        },
      },
      { adminId: 1 },
    );
    assert.ok(legacy.ok);

    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel/${legacy.id}`);
    await page.getByRole("textbox", { name: "Isi artikel" }).waitFor();

    // Add Drop Cap on first paragraph, hit Enter (verify keepOnSplit=false), select & apply editorial color, insert callout
    await page.locator(".cms-prose p").first().click();
    await page.getByRole("button", { name: "Drop Cap" }).click();

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Sorotan editorial merah");
    // Triple-click the newly typed paragraph to select its full text cleanly inside ProseMirror
    await page.locator(".cms-prose p").nth(1).click({ clickCount: 3 });
    await page.getByRole("button", { name: "Warna teks" }).click();
    await page.getByRole("dialog", { name: "Pilih warna teks editorial" }).getByRole("button", { name: /Merah editorial/ }).click();

    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Tambah blok" }).click();
    await page.getByRole("dialog", { name: "Pilih jenis blok editorial" }).getByRole("button", { name: /Callout informasi/ }).click();
    const insertedCallout = page.locator('[data-block="Callout informasi"]').last();
    await insertedCallout.getByLabel("Judul (opsional)").fill("Catatan Tambah Blok");
    await insertedCallout.getByLabel("Isi callout").fill("Blok ini ditambahkan langsung lewat menu blok.");

    await page.getByRole("button", { name: "Simpan draf" }).click();
    await page.locator('[data-save-status="saved"]').waitFor({ timeout: 15_000 });

    const saved = await owner.article.findUniqueOrThrow({ where: { id: legacy.id } });
    const stored = JSON.stringify(saved.body);
    assert.match(stored, /Paragraf lama sebelum pembaruan editor/);
    assert.match(stored, /"dropCap":true/);
    assert.match(stored, /#A61B2B/);
    assert.match(stored, /Sorotan editorial merah/);
    assert.match(stored, /Catatan Tambah Blok/);
    assert.match(stored, /Kutipan lama tetap utuh/);
    const bodyDoc = saved.body as { content?: { attrs?: Record<string, unknown> }[] };
    assert.equal(bodyDoc.content?.[1]?.attrs?.dropCap, undefined, "Enter after dropCap must start a regular paragraph");
    await page.close();
  });

  test("verifies preview, publishes article, checks Lora Nieman typography & layouts on 1440px & 390px, and captures screenshots", async () => {
    const adminPage = await context.newPage();
    await adminPage.goto(`${BASE}/admin/artikel/${articleId}`);
    await adminPage.getByRole("button", { name: "Terbitkan sekarang" }).click();
    await adminPage.getByText("Artikel terbit.").waitFor({ timeout: 15_000 });
    await adminPage.close();

    // Check preview route parity first
    const prevPage = await context.newPage();
    const prevRes = await prevPage.goto(`${BASE}/pratinjau/${articleId}`);
    assert.equal(prevRes?.status(), 200);
    await prevPage.getByText("PRATINJAU", { exact: true }).waitFor();
    assert.equal(await prevPage.locator('[data-block="large-statement"]').count(), 1);
    assert.equal(await prevPage.locator('[data-block="fact-box"]').count(), 1);
    assert.equal(await prevPage.locator('[data-block="callout"]').count(), 1);
    await prevPage.close();

    // Public Desktop 1440x900
    const pubDesktop = await context.newPage();
    const deskErrors: string[] = [];
    pubDesktop.on("pageerror", (e) => deskErrors.push(e.message));
    pubDesktop.on("console", (m) => {
      if (m.type() === "error") deskErrors.push(m.text());
    });

    await pubDesktop.goto(`${BASE}/artikel/${slug}`);
    await pubDesktop.evaluate(() => document.fonts.ready);
    await assertNoOverflow(pubDesktop, "public desktop 1440");

    const metricsDesktop = await pubDesktop.evaluate(() => {
      const h1 = document.querySelector("article h1")!;
      const bodyWrap = document.querySelector("[data-article-body]")!;
      const p = document.querySelector('[data-article-body] p[data-drop-cap="true"]')!;
      const h2 = document.querySelector("[data-article-body] h2")!;
      const cap = document.querySelector("article figcaption")!;
      const floatFig = document.querySelector('[data-article-body] figure[class*="float-left"]')!;
      const fullFig = [...document.querySelectorAll("[data-article-body] figure")].find((el) =>
        (el.className || "").includes("75rem"),
      )!;
      const pairGrid = document.querySelector('[data-block="image-pair"]')!;

      return {
        h1Font: getComputedStyle(h1).fontFamily,
        h1Weight: Number(getComputedStyle(h1).fontWeight),
        h1Size: parseFloat(getComputedStyle(h1).fontSize),
        h1Color: getComputedStyle(h1).color,
        bodyFont: getComputedStyle(bodyWrap).fontFamily,
        bodyWeight: Number(getComputedStyle(bodyWrap).fontWeight),
        bodySize: parseFloat(getComputedStyle(bodyWrap).fontSize),
        bodyLine: parseFloat(getComputedStyle(bodyWrap).lineHeight),
        bodyColor: getComputedStyle(bodyWrap).color,
        h2Font: getComputedStyle(h2).fontFamily,
        h2Weight: Number(getComputedStyle(h2).fontWeight),
        capFont: getComputedStyle(cap).fontFamily,
        floatCss: getComputedStyle(floatFig).float,
        fullWidthPx: fullFig.getBoundingClientRect().width,
        pairCols: getComputedStyle(pairGrid).gridTemplateColumns.split(" ").length,
        hasDropCap: p.getAttribute("data-drop-cap") === "true",
      };
    });

    assert.match(metricsDesktop.h1Font, /Lora/i);
    assert.equal(metricsDesktop.h1Weight, 600);
    assert.ok(metricsDesktop.h1Size >= 28 && metricsDesktop.h1Size <= 42, `h1Size=${metricsDesktop.h1Size}`);
    assert.match(metricsDesktop.bodyFont, /Lora/i);
    assert.equal(metricsDesktop.bodyWeight, 500);
    assert.ok(metricsDesktop.bodySize >= 18 && metricsDesktop.bodySize <= 20.5, `bodySize=${metricsDesktop.bodySize}`);
    assert.equal(metricsDesktop.bodyColor, "rgb(36, 36, 36)"); // #242424
    assert.ok(metricsDesktop.bodyLine / metricsDesktop.bodySize >= 1.6 && metricsDesktop.bodyLine / metricsDesktop.bodySize <= 1.75);
    assert.match(metricsDesktop.h2Font, /Lora/i);
    assert.equal(metricsDesktop.h2Weight, 600);
    assert.match(metricsDesktop.capFont, /Inter/i);
    assert.equal(metricsDesktop.floatCss, "left");
    assert.ok(metricsDesktop.fullWidthPx >= 1000, `fullWidthPx=${metricsDesktop.fullWidthPx}`);
    assert.equal(metricsDesktop.pairCols, 2);
    assert.equal(metricsDesktop.hasDropCap, true);

    // Screenshot 7: full desktop view
    await saveShot(pubDesktop, "editorial-07-desktop-full-1440", true);

    // Screenshot 4: Drop Cap + Pull Quote together in viewport
    await pubDesktop.evaluate(() => {
      document.querySelector('[data-article-body] p[data-drop-cap="true"]')?.scrollIntoView({ block: "center" });
    });
    await saveShot(pubDesktop, "editorial-04-dropcap-pullquote-1440", false);

    // Screenshot 5: Colored & highlighted inline text + Large Statement centered in viewport
    await pubDesktop.evaluate(() => {
      document.querySelector('[data-block="large-statement"]')?.scrollIntoView({ block: "center" });
    });
    await saveShot(pubDesktop, "editorial-05-statement-highlight-1440", false);

    // Screenshot 2: Full-width editorial image centered in viewport
    await pubDesktop.evaluate(() => {
      const fig = [...document.querySelectorAll("[data-article-body] figure")].find((el) => (el.className || "").includes("75rem"));
      fig?.scrollIntoView({ block: "center" });
    });
    await saveShot(pubDesktop, "editorial-02-fullwidth-1440", false);

    // Screenshot 3: Floated left image with wrapping text + side-by-side image pair
    await pubDesktop.evaluate(() => {
      document.querySelector('[data-article-body] figure[class*="float-left"]')?.scrollIntoView({ block: "start" });
    });
    await saveShot(pubDesktop, "editorial-03-float-pair-1440", false);

    assert.deepEqual(deskErrors, [], `desktop errors: ${deskErrors.join("; ")}`);
    await pubDesktop.close();

    // Public Mobile 390x844
    const mobileCtx = await newContext(browser, { width: 390, height: 844 });
    const pubMobile = await mobileCtx.newPage();
    const mobErrors: string[] = [];
    pubMobile.on("pageerror", (e) => mobErrors.push(e.message));
    pubMobile.on("console", (m) => {
      if (m.type() === "error") mobErrors.push(m.text());
    });

    await pubMobile.goto(`${BASE}/artikel/${slug}`);
    await pubMobile.evaluate(() => document.fonts.ready);
    await assertNoOverflow(pubMobile, "public mobile 390");

    const metricsMobile = await pubMobile.evaluate(() => {
      const h1 = document.querySelector("article h1")!;
      const bodyWrap = document.querySelector("[data-article-body]")!;
      const floatFig = document.querySelector('[data-article-body] figure[class*="float-left"]')!;
      const pairGrid = document.querySelector('[data-block="image-pair"]')!;
      return {
        h1Size: parseFloat(getComputedStyle(h1).fontSize),
        bodySize: parseFloat(getComputedStyle(bodyWrap).fontSize),
        floatCss: getComputedStyle(floatFig).float,
        pairCols: getComputedStyle(pairGrid).gridTemplateColumns.split(" ").length,
      };
    });

    assert.ok(metricsMobile.h1Size >= 24 && metricsMobile.h1Size <= 34, `mobile h1=${metricsMobile.h1Size}`);
    assert.ok(metricsMobile.bodySize >= 17 && metricsMobile.bodySize <= 18.5, `mobile body=${metricsMobile.bodySize}`);
    assert.equal(metricsMobile.floatCss, "none", "floated images stack vertically on mobile");
    assert.equal(metricsMobile.pairCols, 1, "pair images stack vertically on mobile");

    // Screenshot 6: Mobile full page
    await saveShot(pubMobile, "editorial-06-mobile-390", true);

    assert.deepEqual(mobErrors, [], `mobile errors: ${mobErrors.join("; ")}`);
    await mobileCtx.close();
  });
});
