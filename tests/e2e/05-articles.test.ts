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
import { app, BASE, closeAll, http, launchBrowser, loginInBrowser, newContext, ORIGIN, owner, screenshot, sessionCookieSet } from "./helpers";

// The article CMS end to end, against the production build with
// CMS_PUBLIC_ARTICLES=on (public /artikel/[slug] reads published CMS articles).

let browser: Browser;
let context: BrowserContext;
let imagePath: string;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-e2e-img-"));

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password);
  imagePath = path.join(tmp, "perahu.jpg");
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 90, b: 140 } } }).jpeg().toFile(imagePath);
  browser = await launchBrowser();
  context = await newContext(browser, { width: 1440, height: 900 });
  // The video block's thumbnail comes from i.ytimg.com: answered locally, so the
  // run needs no internet and shows no third-party picture.
  const thumbnail = await sharp({ create: { width: 480, height: 360, channels: 3, background: { r: 40, g: 44, b: 52 } } }).jpeg().toBuffer();
  await context.route("https://i.ytimg.com/**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: thumbnail }));
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

const saved = (page: Page) => page.locator('[data-save-status="saved"]').waitFor({ timeout: 20_000 });

/** Polls until `check` returns true (database state written by autosave). */
async function eventually(check: () => Promise<boolean>, label: string, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.fail(`timed out: ${label}`);
}
const editorId = (page: Page) => page.url().match(/\/admin\/artikel\/([0-9a-f-]{36})$/)?.[1] ?? "";

async function redaksi() {
  return owner.author.findUniqueOrThrow({ where: { slug: "redaksi" } });
}

/** A draft made through the same service the CMS uses. */
async function draft(title: string) {
  const author = await redaksi();
  const kanal = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "ekonomi" } });
  const result = await createArticle(app, { title, standfirst: "Lead artikel uji.", authorId: author.id, kanalId: kanal.id, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi artikel uji." }] }] } }, { adminId: 1 });
  assert.ok(result.ok);
  return result;
}

async function publicStatus(slug: string): Promise<number> {
  const response = await http(`/artikel/${slug}`);
  await response.arrayBuffer();
  return response.status;
}

describe("access without login", () => {
  test("CMS pages, preview, upload API: login required; bad media keys 404", async () => {
    for (const p of ["/admin/artikel", "/admin/artikel/baru", "/pratinjau/11111111-1111-4111-8111-111111111111"]) {
      const response = await http(p);
      assert.equal(response.status, 307, p);
      assert.match(response.headers.get("location") ?? "", /\/admin\/login/);
    }
    assert.equal((await http("/api/admin/media")).status, 401);
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "x.png");
    assert.equal((await http("/api/admin/media", { method: "POST", headers: { origin: ORIGIN }, body: form })).status, 401);
    for (const key of ["2026/11/0123456789abcdef.webp", "../../.env", "2026/11/x.svg"]) {
      assert.equal((await http(`/media/${key}`)).status, 404, key);
    }
  });
});

describe("writing and publishing", () => {
  let articleId = "";
  const title = "Garam Kalianget Uji Ujung ke Ujung";
  const slug = "garam-kalianget-uji-ujung-ke-ujung";

  test("new article: fields, rich body, upload, autosave, then preview in the real template", async () => {
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.fill("#judul", title);
    assert.equal(await page.inputValue("#slug"), slug, "slug follows the title");
    await page.fill("#lead", "Petani garam di Kalianget menunggu musim kemarau panjang.");
    await page.selectOption("#kanal", { label: "Ekonomi" });

    const body = page.getByRole("textbox", { name: "Isi artikel" });
    await body.click();
    await page.keyboard.type("Paragraf pembuka artikel uji. ");
    await page.keyboard.press("Control+b");
    await page.keyboard.type("Bagian tebal");
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Subjudul H2" }).click();
    await page.keyboard.type("Musim Garam");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Paragraf kedua di bawah subjudul.");

    await page.getByRole("button", { name: "Kutipan menonjol" }).click();
    const quote = page.locator('[data-block="Kutipan menonjol"]');
    await quote.getByLabel("Kutipan", { exact: true }).fill("Laut adalah ladang kami.");
    await quote.getByLabel("Narasumber (opsional)").fill("Petani garam");

    await body.click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("Control+End");
    await page.getByRole("button", { name: "Video YouTube/Vimeo" }).click();
    await page.getByLabel("Tautan video YouTube atau Vimeo").fill("https://www.youtube.com/watch?v=uji-e2e-vid");
    await page.getByLabel("Judul video", { exact: true }).fill("Video panen garam");

    await body.click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("Control+End");
    await page.getByRole("button", { name: "Tabel", exact: true }).click();
    for (const cell of ["Tahun", "Ton", "Catatan", "2025", "1200", "Musim baik"]) {
      await page.keyboard.type(cell);
      await page.keyboard.press("Tab");
    }
    await page.getByLabel("Keterangan tabel").fill("Produksi garam (contoh uji)");

    await page.getByRole("button", { name: "Pilih gambar utama" }).click();
    const picker = page.getByRole("dialog", { name: "Pilih gambar utama" });
    await picker.getByRole("tab", { name: "Unggah baru" }).click();
    await picker.locator('input[type="file"]').setInputFiles(imagePath);
    await picker.getByLabel(/Teks alternatif/).fill("Perahu biru di laut Kalianget");
    await picker.getByLabel("Kredit foto").fill("Foto: Uji E2E");
    await picker.getByRole("button", { name: "Unggah & pakai" }).click();
    await picker.waitFor({ state: "detached" });

    await page.waitForURL(/\/admin\/artikel\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    articleId = editorId(page);
    assert.ok(articleId);
    await eventually(async () => Boolean((await owner.article.findUnique({ where: { id: articleId } }))?.heroMediaId), "hero saved by autosave");
    await saved(page);
    await screenshot(page, "editor-1440");

    const row = await owner.article.findUniqueOrThrow({ where: { id: articleId } });
    assert.equal(row.status, "DRAFT");
    assert.equal(row.slug, slug);
    assert.ok(row.heroMediaId, "hero saved");
    const stored = JSON.stringify(row.body);
    for (const part of ["Bagian tebal", "Musim Garam", "pullQuote", "articleVideo", "uji-e2e-vid", "Produksi garam"]) assert.ok(stored.includes(part), part);
    assert.equal(await publicStatus(slug), 404, "a draft is not public");

    const preview = await context.newPage();
    const response = await preview.goto(`${BASE}/pratinjau/${articleId}`);
    assert.equal(response?.status(), 200);
    assert.match(response?.headers()["x-robots-tag"] ?? "", /noindex/);
    await preview.getByRole("heading", { level: 1, name: title }).waitFor();
    await preview.getByText("PRATINJAU", { exact: true }).waitFor();
    for (const text of ["Musim Garam", "Laut adalah ladang kami.", "Produksi garam (contoh uji)", "Perahu biru di laut Kalianget"]) {
      assert.ok((await preview.content()).includes(text), text);
    }
    await screenshot(preview, "pratinjau-1440");
    await preview.close();

    const anonymous = await newContext(browser);
    const anonPage = await anonymous.newPage();
    await anonPage.goto(`${BASE}/pratinjau/${articleId}`);
    assert.match(anonPage.url(), /\/admin\/login/, "preview is for the Admin only");
    await anonymous.close();
    await page.close();
  });

  test("publish: the article appears on its public URL in the SUMENEP template, never cached by the CDN", async () => {
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel/${articleId}`);
    await page.getByRole("button", { name: "Terbitkan sekarang" }).click();
    await page.getByText("Artikel terbit.").waitFor();
    const response = await http(`/artikel/${slug}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const html = (await response.text()).replaceAll("<!-- -->", "");
    for (const text of [title, "Petani garam di Kalianget", "Musim Garam", "Laut adalah ladang kami.", "Video panen garam", "Produksi garam (contoh uji)"]) {
      assert.ok(html.includes(text), text);
    }
    assert.match(html, /data-template="standard"/);
    const pub = await context.newPage();
    await pub.goto(`${BASE}/artikel/${slug}`);
    await screenshot(pub, "artikel-publik-1440");
    await pub.close();
    await page.close();
  });

  test("renaming a published article: the old URL answers 301", async () => {
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel/${articleId}`);
    await page.fill("#slug", `${slug}-baru`);
    await page.getByRole("button", { name: "Perbarui" }).click();
    await saved(page);
    const old = await http(`/artikel/${slug}`);
    assert.ok([301, 308].includes(old.status), `permanent redirect, got ${old.status}`);
    assert.match(old.headers.get("location") ?? "", new RegExp(`/artikel/${slug}-baru$`));
    assert.equal(await publicStatus(`${slug}-baru`), 200);
    await page.close();
  });
});

describe("autosave safety", () => {
  test("two tabs: the second save is a conflict and overwrites nothing", async () => {
    const { id } = await draft("Artikel Konflik Uji");
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto(`${BASE}/admin/artikel/${id}`);
    await b.goto(`${BASE}/admin/artikel/${id}`);
    // both editors fully started (TipTap mounts after hydration) before tab A types
    for (const tab of [a, b]) await tab.getByRole("textbox", { name: "Isi artikel" }).waitFor();
    // merely opening an article changes nothing: no autosave, no new version
    await new Promise((r) => setTimeout(r, 3500));
    assert.equal((await owner.article.findUniqueOrThrow({ where: { id } })).version, 1, "opening saved nothing");
    for (const tab of [a, b]) assert.equal(await tab.locator("[data-save-status]").count(), 0, "no save status: nothing to save");
    await a.fill("#lead", "Versi dari tab A.");
    await saved(a);
    await b.fill("#lead", "Versi dari tab B.");
    await b.locator('[data-save-status="conflict"]').waitFor({ timeout: 20_000 });
    await b.getByText(/sudah disimpan dari tab atau perangkat lain/).waitFor();
    assert.equal((await owner.article.findUniqueOrThrow({ where: { id } })).standfirst, "Versi dari tab A.");
    await screenshot(b, "editor-konflik-1440");
    await a.close();
    await b.close();
  });

  test("offline: changes stay in the browser and are saved when the connection returns", async () => {
    const { id } = await draft("Artikel Offline Uji");
    const offline = await newContext(browser);
    const page = await offline.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    await page.goto(`${BASE}/admin/artikel/${id}`);
    await offline.setOffline(true);
    await page.fill("#lead", "Ditulis saat offline.");
    await page.locator('[data-save-status="offline"], [data-save-status="error"]').first().waitFor({ timeout: 20_000 });
    const local = await page.evaluate((key) => localStorage.getItem(key), `sumenep:artikel:${id}`);
    assert.ok(local?.includes("Ditulis saat offline."), "kept in this browser");
    await offline.setOffline(false);
    await saved(page);
    assert.equal((await owner.article.findUniqueOrThrow({ where: { id } })).standfirst, "Ditulis saat offline.");
    await offline.close();
  });
});

describe("schedule, archive, trash", () => {
  test("scheduled = hidden until its time; archive and trash hide; restore; delete forever", async () => {
    const { id, slug } = await draft("Artikel Jadwal Uji");
    const bytes = await sharp({ create: { width: 1200, height: 675, channels: 3, background: { r: 166, g: 27, b: 43 } } }).jpeg().toBuffer();
    const { media: hero } = await uploadImage(app, { name: "jadwal.jpg", bytes }, { alt: "Gambar uji jadwal" }, { adminId: 1 });
    await owner.article.update({ where: { id }, data: { heroMediaId: hero.id } });
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel/${id}`);
    const inTwoHours = new Date(Date.now() + 2 * 3600_000 + 7 * 3600_000).toISOString().slice(0, 16);
    await page.fill("#jadwal", inTwoHours);
    await page.getByRole("button", { name: "Jadwalkan" }).click();
    await page.getByText(/Dijadwalkan terbit/).waitFor();
    assert.equal(await publicStatus(slug), 404, "scheduled is hidden");

    await owner.article.update({ where: { id }, data: { publishedAt: new Date(Date.now() - 1000) } });
    let status = 404;
    for (let i = 0; i < 20 && status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = await publicStatus(slug);
    }
    assert.equal(status, 200, "appears once the time has come (cache window)");

    await page.reload();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Arsipkan" }).click();
    await page.getByText("Artikel diarsipkan.").waitFor();
    assert.equal(await publicStatus(slug), 404, "archived is hidden");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Pindahkan ke tempat sampah/ }).click();
    await page.getByText("Artikel dipindahkan ke tempat sampah.").waitFor();
    await page.getByRole("button", { name: "Pulihkan" }).click();
    await page.getByText("Artikel dipulihkan dari tempat sampah.").waitFor();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Pindahkan ke tempat sampah/ }).click();
    await page.getByText("Artikel dipindahkan ke tempat sampah.").waitFor();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Hapus permanen" }).click();
    await page.waitForURL(/\/admin\/artikel\?status=sampah&pesan=dihapus/);
    assert.equal(await owner.article.count({ where: { id } }), 0);
    await page.close();
  });
});

describe("list and server-side protection", () => {
  test("search and status filters", async () => {
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel?q=Konflik`);
    await page.getByRole("link", { name: "Artikel Konflik Uji" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Artikel Offline Uji" }).count(), 0);
    await page.goto(`${BASE}/admin/artikel?status=terbit`);
    await page.getByRole("link", { name: "Garam Kalianget Uji Ujung ke Ujung" }).waitFor();
    await screenshot(page, "daftar-artikel-1440");
    await page.goto(`${BASE}/admin`);
    await screenshot(page, "dashboard-artikel-1440");
    await page.close();
  });

  test("list operational state actions and permanent delete confirmation modal", async () => {
    const { id, slug } = await draft("Artikel Aksi Daftar Uji");
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel?status=draf`);
    const row = page.locator("li", { has: page.getByRole("link", { name: "Artikel Aksi Daftar Uji" }) });
    await row.getByRole("button", { name: "Kelola" }).click();
    page.once("dialog", (d) => d.accept());
    await row.getByRole("menuitem", { name: "Arsipkan" }).click();
    await page.waitForURL(/pesan=arsip/);
    await page.getByText("Artikel diarsipkan dan tidak tampil di situs.").waitFor();

    await page.goto(`${BASE}/admin/artikel?status=arsip`);
    const archRow = page.locator("li", { has: page.getByRole("link", { name: "Artikel Aksi Daftar Uji" }) });
    await archRow.getByRole("button", { name: "Kelola" }).click();
    await archRow.getByRole("menuitem", { name: "Kembalikan ke draf" }).click();
    await page.waitForURL(/pesan=buka-arsip/);

    await page.goto(`${BASE}/admin/artikel?status=draf`);
    const drafRow = page.locator("li", { has: page.getByRole("link", { name: "Artikel Aksi Daftar Uji" }) });
    await drafRow.getByRole("button", { name: "Kelola" }).click();
    page.once("dialog", (d) => d.accept());
    await drafRow.getByRole("menuitem", { name: "Pindahkan ke tempat sampah" }).click();
    await page.waitForURL(/pesan=sampah/);

    await page.goto(`${BASE}/admin/artikel?status=sampah`);
    const trashRow = page.locator("li", { has: page.getByRole("link", { name: "Artikel Aksi Daftar Uji" }) });
    await trashRow.getByRole("button", { name: "Pulihkan" }).click();
    await page.waitForURL(/pesan=pulih/);
    assert.equal((await owner.article.findUniqueOrThrow({ where: { id } })).deletedAt, null);

    await page.goto(`${BASE}/admin/artikel?status=draf`);
    const reTrashRow = page.locator("li", { has: page.getByRole("link", { name: "Artikel Aksi Daftar Uji" }) });
    await reTrashRow.getByRole("button", { name: "Kelola" }).click();
    page.once("dialog", (d) => d.accept());
    await reTrashRow.getByRole("menuitem", { name: "Pindahkan ke tempat sampah" }).click();
    await page.waitForURL(/pesan=sampah/);

    await page.goto(`${BASE}/admin/artikel?status=sampah`);
    const purgeRow = page.locator("li", { has: page.getByRole("link", { name: "Artikel Aksi Daftar Uji" }) });
    await purgeRow.getByRole("button", { name: "Hapus permanen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(`/artikel/${slug}`).waitFor();
    const confirmBtn = dialog.getByRole("button", { name: "Hapus permanen" });
    assert.equal(await confirmBtn.isDisabled(), true);
    await dialog.getByPlaceholder("HAPUS").fill("HAPUS");
    assert.equal(await confirmBtn.isDisabled(), false);
    await confirmBtn.click();
    await page.waitForURL(/\/admin\/artikel\?status=sampah&pesan=dihapus/);
    await page.getByText("Artikel dihapus permanen.").waitFor();
    assert.equal(await owner.article.count({ where: { id } }), 0);
    assert.equal(await owner.activityLog.count({ where: { action: "article.delete", entityId: id } }), 1);
    await page.close();
  });

  test("a forged Server Action with a javascript: link and a script node is stored sanitised", async () => {
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/artikel/baru`);
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"])),
      page.fill("#judul", "Rekaman permintaan"),
    ]);
    await page.waitForURL(/\/admin\/artikel\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const args = JSON.parse(request.postData() ?? "[]");
    args[0].title = "Artikel Disusupi";
    args[0].slug = "artikel-disusupi";
    args[0].body = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "klik", marks: [{ type: "link", attrs: { href: "javascript:alert(document.cookie)" } }] }] },
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        { type: "articleVideo", attrs: { provider: "youtube", videoId: '"><script>alert(1)</script>' } },
      ],
    };
    const headers = request.headers();
    const response = await fetch(`${BASE}/admin/artikel/baru`, {
      method: "POST",
      headers: { "next-action": headers["next-action"], "next-router-state-tree": headers["next-router-state-tree"], accept: headers.accept, "content-type": headers["content-type"], origin: ORIGIN, cookie: (await context.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join("; ") },
      body: JSON.stringify(args),
      redirect: "manual",
    });
    await response.arrayBuffer();
    assert.equal(sessionCookieSet(response), null);
    const forged = await owner.article.findFirstOrThrow({ where: { slug: "artikel-disusupi" } });
    const stored = JSON.stringify(forged.body);
    assert.match(stored, /klik/);
    assert.doesNotMatch(stored, /javascript|script|alert/);
    await page.close();
  });
});

/** Fails with the widest elements named when the page scrolls sideways. */
async function assertNoHorizontalScroll(page: Page, label: string) {
  const { extra, wide } = await page.evaluate(() => {
    const width = window.innerWidth;
    const culprits = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > width + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 4)
      .map(({ el, right }) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 3).join(".")} (${Math.round(right)}px)`);
    return { extra: document.documentElement.scrollWidth - width, wide: culprits };
  });
  assert.ok(extra <= 1, `${label}: horizontal scroll ${extra}px — ${wide.join(", ")}`);
}

describe("mobile editor", () => {
  test("the editor and the article list work on a phone screen", async () => {
    const { id } = await draft("Artikel Ponsel Uji");
    const mobile = await newContext(browser, { width: 390, height: 844 });
    const page = await mobile.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);
    await page.goto(`${BASE}/admin/artikel/${id}`);
    await page.getByRole("textbox", { name: "Isi artikel" }).waitFor();
    await assertNoHorizontalScroll(page, "editor");
    await screenshot(page, "editor-390");
    await page.goto(`${BASE}/admin/artikel`);
    await page.getByRole("link", { name: "Artikel Ponsel Uji" }).waitFor();
    await assertNoHorizontalScroll(page, "daftar artikel");
    await screenshot(page, "daftar-artikel-390");
    await mobile.close();
  });
});

