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

describe("editorial authors & sections (Fase 4)", () => {
  test("create, edit, toggle, profile, delete author and section; verify 60/40 desktop (1440px & 1280px) and stacked mobile (390px) with 0px overflow", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    // 1. Tambah penulis via /admin/penulis (uji nama & jabatan panjang agar keterbacaan terukur)
    await page.goto(`${BASE}/admin/penulis`);
    await page.getByRole("heading", { name: "Penulis", exact: true }).waitFor();
    await page.fill("#author-name", "Koresponden Kangean E2E");
    await page.fill("#author-role", "Kontributor Kepulauan Kangean & Sapeken");
    await page.fill("#author-bio", "Menulis laporan khusus masyarakat kepulauan Sumenep.");
    await page.getByRole("button", { name: "Simpan penulis" }).click();
    await page.getByText(/Penulis "Koresponden Kangean E2E" ditambahkan\./).waitFor();

    // 1b. Verifikasi layout 2 kolom 60/40, tidak overflow, & form berada di dalam panel pada 1440px dan 1280px
    for (const width of [1440, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(60);
      const metrics = await page.evaluate(() => {
        const listCard = document.querySelector('section[aria-labelledby="daftar-penulis-heading"]')!.getBoundingClientRect();
        const formCard = document.querySelector('section[aria-labelledby="form-penulis-heading"]')!.getBoundingClientRect();
        const inputs = Array.from(document.querySelectorAll('#author-name, #author-slug, #author-role, #author-bio')).map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.id, left: r.left, right: r.right, width: r.width };
        });
        const firstInfo = document.querySelector('section[aria-labelledby="daftar-penulis-heading"] li > div:first-child')?.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          listWidth: listCard.width,
          formWidth: formCard.width,
          sameRow: Math.abs(listCard.top - formCard.top) < 8,
          formRight: formCard.right,
          clientWidth: document.documentElement.clientWidth,
          inputs,
          infoWidth: firstInfo?.width ?? 0,
        };
      });
      assert.equal(metrics.overflow, 0, `desktop ${width}px overflow=${metrics.overflow}`);
      assert.equal(metrics.sameRow, true, `desktop ${width}px should display 2 columns side by side`);
      const ratio = metrics.listWidth / (metrics.listWidth + metrics.formWidth);
      assert.ok(ratio >= 0.56 && ratio <= 0.64, `desktop ${width}px list ratio=${ratio.toFixed(3)} expected ~0.60`);
      assert.ok(metrics.formRight <= metrics.clientWidth + 1, `desktop ${width}px form card exceeded viewport`);
      assert.ok(metrics.infoWidth >= 240, `desktop ${width}px author info width too narrow: ${metrics.infoWidth}px`);
      for (const inp of metrics.inputs) {
        assert.ok(inp.right <= metrics.formRight + 1, `desktop ${width}px input #${inp.id} overflowed form panel`);
      }
      await screenshot(page, `penulis-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1c. Verifikasi aksi Profil, Edit, Nonaktifkan, Aktifkan pada /admin/penulis
    const row = page.locator("li", { hasText: "Koresponden Kangean E2E" }).first();
    const profileHref = await row.getByRole("link", { name: "Profil" }).getAttribute("href");
    assert.ok(profileHref?.startsWith("/penulis/"), `unexpected Profil href: ${profileHref}`);

    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("heading", { name: /Ubah penulis: Koresponden Kangean E2E/ }).waitFor();
    await page.fill("#author-role", "Koresponden Senior Kepulauan");
    await page.getByRole("button", { name: "Perbarui penulis" }).click();
    await page.getByText(/Profil "Koresponden Kangean E2E" diperbarui\./).waitFor();

    await row.getByRole("button", { name: "Nonaktifkan" }).click();
    await page.getByText(/"Koresponden Kangean E2E" dinonaktifkan/).waitFor();

    await row.getByRole("button", { name: "Aktifkan" }).click();
    await page.getByText(/"Koresponden Kangean E2E" diaktifkan kembali\./).waitFor();

    // 2. Tambah kanal via /admin/seksi
    await page.goto(`${BASE}/admin/seksi`);
    await page.getByRole("heading", { name: "Kanal & Rubrik", exact: true }).waitFor();
    await page.fill("#section-name", "Bahari & Kepulauan");
    await page.fill("#section-desc", "Kabar kelautan dan transportasi pulau.");
    await page.getByRole("button", { name: "Simpan Kanal" }).click();
    await page.getByText(/Kanal "Bahari & Kepulauan" ditambahkan\./).waitFor();
    await screenshot(page, "seksi-1440");

    // 3. Verifikasi pilihan muncul di dropdown editor artikel (/admin/artikel/baru)
    await page.goto(`${BASE}/admin/artikel/baru`);
    await page.selectOption("#penulis", { label: "Koresponden Kangean E2E" });
    await page.selectOption("#kanal", { label: "Bahari & Kepulauan" });

    // 4. Mobile 390x844 overflow & stacking check (form after list)
    const mobile = await newContext(browser, { width: 390, height: 844 });
    const mPage = await mobile.newPage();
    mPage.on("pageerror", (err) => consoleErrors.push(err.message));
    await loginInBrowser(mPage);
    await mPage.waitForURL(`${BASE}/admin`);
    for (const [route, name] of [
      ["/admin/penulis", "penulis-390"],
      ["/admin/seksi", "seksi-390"],
    ] as const) {
      await mPage.goto(`${BASE}${route}`);
      const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${route} mobile overflow=${overflow}`);
      if (route === "/admin/penulis") {
        const stacked = await mPage.evaluate(() => {
          const listRect = document.querySelector('section[aria-labelledby="daftar-penulis-heading"]')!.getBoundingClientRect();
          const formRect = document.querySelector('section[aria-labelledby="form-penulis-heading"]')!.getBoundingClientRect();
          return { formBelowList: formRect.top >= listRect.bottom - 2 };
        });
        assert.equal(stacked.formBelowList, true, "mobile form must stack below author list");
      }
      await screenshot(mPage, name);
    }
    await mobile.close();

    // 5. Hapus penulis & kanal uji agar state bersih
    await page.goto(`${BASE}/admin/penulis`);
    page.once("dialog", (d) => d.accept());
    await page.locator("li", { hasText: "Koresponden Kangean E2E" }).getByRole("button", { name: "Hapus" }).click();
    await page.getByText(/Profil "Koresponden Kangean E2E" dihapus\./).waitFor();

    await page.goto(`${BASE}/admin/seksi`);
    page.once("dialog", (d) => d.accept());
    await page.locator("li", { hasText: "Bahari & Kepulauan" }).getByRole("button", { name: "Hapus" }).click();
    await page.getByText(/"Bahari & Kepulauan" dihapus\./).waitFor();

    assert.equal(consoleErrors.length, 0, `unexpected console/page errors: ${consoleErrors.join("; ")}`);
    await context.close();
  });
});
