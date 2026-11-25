import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import type { Browser } from "playwright-core";
import sharp from "sharp";

import { resetAdminPassword } from "@/server/admin/recover";
import { uploadImage } from "@/server/media/service";

import { E2E_ADMIN } from "./admin";
import { app, BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner, screenshot } from "./helpers";

let browser: Browser;

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password);
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await closeAll();
});

describe("Hero Utama editorial module end-to-end (admin + public homepage)", () => {
  test("manages Hero across Berita, Catatan Sumenep, Feature, Opini, blocks hideFromHomepage, syncs /admin/pengaturan & /admin/artikel, records history, and returns old Hero to its original homepage group", async () => {
    const stamp = Date.now().toString(36);
    const body = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Konten uji Hero Utama." }] }],
    };

    // Upload a real 1200x750 WebP-backed image via uploadImage so thumbnails render cleanly in Playwright
    const imgBytes = await sharp({
      create: { width: 1200, height: 750, channels: 3, background: { r: 28, g: 64, b: 92 } },
    })
      .jpeg({ quality: 86 })
      .toBuffer();
    const uploaded = await uploadImage(
      app,
      { name: `hero-e2e-${stamp}.jpg`, bytes: imgBytes },
      { alt: "Ilustrasi Hero E2E", caption: "Foto uji Hero Utama.", credit: "Redaksi" },
      { adminId: 1 },
    );
    const media = uploaded.media;
    const author =
      (await owner.author.findFirst({ where: { isActive: true } })) ??
      (await owner.author.create({ data: { slug: `penulis-hero-${stamp}`, name: "Redaksi Hero", role: "Redaksi" } }));

    const kanalPolitik = await owner.section.findFirstOrThrow({
      where: { kind: "KANAL", slug: "politik-pemerintahan" },
    });
    const kanalEkonomi = await owner.section.findFirstOrThrow({
      where: { kind: "KANAL", slug: "ekonomi" },
    });
    const rubrikCatatan = await owner.section.findFirstOrThrow({
      where: { kind: "RUBRIK", slug: "catatan-sumenep" },
    });
    const rubrikOpini =
      (await owner.section.findUnique({ where: { kind_slug: { kind: "RUBRIK", slug: "opini" } } })) ??
      (await owner.section.create({
        data: {
          kind: "RUBRIK",
          slug: "opini",
          name: "Opini",
          description: "Gagasan dan sudut pandang warga Sumenep.",
          sortOrder: 10,
        },
      }));

    // Ensure both Catatan Sumenep and Opini rubric bands exist on homepage
    await owner.homepageRubric.deleteMany({});
    await owner.homepageRubric.createMany({
      data: [
        { sectionId: rubrikCatatan.id, position: 0, itemCount: 3 },
        { sectionId: rubrikOpini.id, position: 1, itemCount: 3 },
      ],
    });
    await owner.homepageFeatured.deleteMany({});

    const nowMs = Date.now();
    const berita1 = await owner.article.create({
      data: {
        slug: `hero-e2e-berita-1-${stamp}`,
        title: `Hero E2E Berita Utama ${stamp}`,
        standfirst: "Ringkasan berita utama untuk pengujian Hero.",
        kanalId: kanalPolitik.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date(nowMs - 60_000),
        body,
      },
    });
    const berita2 = await owner.article.create({
      data: {
        slug: `hero-e2e-berita-2-${stamp}`,
        title: `Hero E2E Berita Kedua ${stamp}`,
        standfirst: "Ringkasan berita kedua.",
        kanalId: kanalEkonomi.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date(nowMs - 120_000),
        body,
      },
    });
    const catatan = await owner.article.create({
      data: {
        slug: `hero-e2e-catatan-${stamp}`,
        title: `Hero E2E Catatan Sumenep ${stamp}`,
        standfirst: "Esai Catatan Sumenep untuk pengujian Hero.",
        kanalId: kanalPolitik.id,
        rubrikId: rubrikCatatan.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "SPOTLIGHT",
        status: "PUBLISHED",
        publishedAt: new Date(nowMs - 90_000),
        body,
      },
    });
    const opini = await owner.article.create({
      data: {
        slug: `hero-e2e-opini-${stamp}`,
        title: `Hero E2E Opini Warga ${stamp}`,
        standfirst: "Tulisan opini warga Sumenep.",
        rubrikId: rubrikOpini.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date(nowMs - 80_000),
        body,
      },
    });
    const feature = await owner.article.create({
      data: {
        slug: `hero-e2e-feature-${stamp}`,
        title: `Hero E2E Feature Pesisir ${stamp}`,
        standfirst: "Liputan mendalam pesisir Sumenep.",
        kanalId: kanalEkonomi.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "FEATURE",
        status: "PUBLISHED",
        publishedAt: new Date(nowMs - 70_000),
        body,
      },
    });
    const hidden = await owner.article.create({
      data: {
        slug: `hero-e2e-hidden-${stamp}`,
        title: `Hero E2E Tersembunyi ${stamp}`,
        standfirst: "Tidak boleh tampil sebagai kandidat Hero.",
        kanalId: kanalPolitik.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date(nowMs - 50_000),
        hideFromHomepage: true,
        body,
      },
    });

    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());

    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    // 1. Open /admin/hero via sidebar
    await page.getByRole("link", { name: "Hero Utama" }).first().click();
    await page.waitForURL(`${BASE}/admin/hero`);
    await page.getByRole("heading", { name: "Hero Utama", exact: true }).waitFor();

    // Hidden article must NEVER appear in candidates
    const pageText = await page.locator("main").innerText();
    assert.equal(pageText.includes(hidden.title), false, "hideFromHomepage article must be excluded");

    // 2. Filter by Catatan Sumenep and set it as Hero Utama
    await page.selectOption('select[name="rubrik"]', "catatan-sumenep");
    await page.getByRole("button", { name: "Saring" }).click();
    await page.waitForURL(/rubrik=catatan-sumenep/);

    const catatanRow = page.locator("li", { hasText: catatan.title }).first();
    await catatanRow.getByRole("button", { name: "Jadikan Hero Utama" }).click();
    await page.getByText(`"${catatan.title}" ditetapkan sebagai Hero Utama aktif.`).waitFor();

    // Check public homepage: Catatan Sumenep is Hero, NOT duplicated in Catatan band or Artikel Terbaru
    await page.goto(`${BASE}/`);
    assert.equal((await page.locator('article[aria-labelledby="berita-utama"] h2').innerText()).trim(), catatan.title);
    const catatanSectionWhileHero = await page.locator('section[aria-labelledby="catatan-sumenep"]').innerText();
    assert.equal(catatanSectionWhileHero.includes(catatan.title), false);
    const latestWhileCatatanHero = await page.locator('section[aria-labelledby="artikel-terbaru"]').innerText();
    assert.equal(latestWhileCatatanHero.includes(catatan.title), false);
    assert.equal(latestWhileCatatanHero.includes(berita1.title), true);

    // 3. Switch Hero to Opini → Catatan Sumenep returns to Catatan Sumenep group (NOT Artikel Terbaru!)
    await page.goto(`${BASE}/admin/hero?rubrik=opini`);
    const opiniRow = page.locator("li", { hasText: opini.title }).first();
    await opiniRow.getByRole("button", { name: "Jadikan Hero Utama" }).click();
    await page.getByText(`"${opini.title}" ditetapkan sebagai Hero Utama aktif.`).waitFor();

    await page.goto(`${BASE}/`);
    assert.equal((await page.locator('article[aria-labelledby="berita-utama"] h2').innerText()).trim(), opini.title);
    const catatanSectionAfter = await page.locator('section[aria-labelledby="catatan-sumenep"]').innerText();
    assert.equal(catatanSectionAfter.includes(catatan.title), true, "Catatan Sumenep must return to Catatan Sumenep group");
    const latestAfterOpiniHero = await page.locator('section[aria-labelledby="artikel-terbaru"]').innerText();
    assert.equal(latestAfterOpiniHero.includes(catatan.title), false, "Catatan Sumenep must NOT be forced into Artikel Terbaru");

    // 4. Switch Hero to Berita 1 → Opini returns to Opini band, Feature in Tulisan Pilihan, Berita 2 in Artikel Terbaru
    await page.goto(`${BASE}/admin/hero?q=${encodeURIComponent(berita1.title)}`);
    const beritaRow = page.locator("li", { hasText: berita1.title }).first();
    await beritaRow.getByRole("button", { name: "Jadikan Hero Utama" }).click();
    await page.getByText(`"${berita1.title}" ditetapkan sebagai Hero Utama aktif.`).waitFor();

    await page.goto(`${BASE}/`);
    assert.equal((await page.locator('article[aria-labelledby="berita-utama"] h2').innerText()).trim(), berita1.title);
    const opiniBandText = await page.locator('section[aria-labelledby="rubrik-opini"]').innerText();
    assert.equal(opiniBandText.includes(opini.title), true, "Opini must return to Opini rubric group");
    const featuredText = await page.locator('section[aria-labelledby="tulisan-pilihan"]').innerText();
    assert.equal(featuredText.includes(feature.title), true, "Feature must stay in Tulisan Pilihan editorial group");
    const latestText = await page.locator('section[aria-labelledby="artikel-terbaru"]').innerText();
    assert.equal(latestText.includes(berita2.title), true, "Berita 2 must appear in Artikel Terbaru");
    assert.equal(latestText.includes(opini.title), false, "Opini must NOT be forced into Artikel Terbaru");
    assert.equal(latestText.includes(feature.title), false, "Feature must NOT be forced into Artikel Terbaru");

    // Verify original URLs remain intact (no duplication, no slug mutation)
    const catatanArticleRes = await page.goto(`${BASE}/artikel/${catatan.slug}`);
    assert.equal(catatanArticleRes?.status(), 200);
    const opiniArticleRes = await page.goto(`${BASE}/artikel/${opini.slug}`);
    assert.equal(opiniArticleRes?.status(), 200);

    // 5. Verify sync with /admin/pengaturan, badge on /admin/artikel, and Riwayat Hero Utama on /admin/hero
    await page.goto(`${BASE}/admin/pengaturan`);
    assert.equal(await page.inputValue("#hero-article"), berita1.id);

    await page.goto(`${BASE}/admin/artikel?q=${encodeURIComponent(berita1.title)}`);
    const articleListRow = page.locator("li", { hasText: berita1.title }).first();
    assert.equal(await articleListRow.getByText("Hero Utama").count(), 1);

    await page.goto(`${BASE}/admin/hero`);
    const historySection = page.locator('section[aria-labelledby="riwayat-hero-heading"]');
    const historyText = await historySection.innerText();
    assert.equal(historyText.includes(berita1.title), true);
    assert.equal(historyText.includes(opini.title), true);
    assert.equal(historyText.includes(catatan.title), true);
    await screenshot(page, "hero-manager-1440");

    // 6. Responsive 390px mobile check (0px horizontal overflow)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/hero`);
    await page.getByRole("heading", { name: "Hero Utama", exact: true }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `unexpected horizontal overflow on 390px /admin/hero: ${overflow}px`);
    await screenshot(page, "hero-manager-390");

    await context.close();
  });
});
