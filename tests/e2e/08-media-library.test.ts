import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import type { Browser } from "playwright-core";
import sharp from "sharp";

import { resetAdminPassword } from "@/server/admin/recover";

import { E2E_ADMIN } from "./admin";
import { BASE, closeAll, launchBrowser, loginInBrowser, newContext, owner, screenshot } from "./helpers";

let browser: Browser;
let tmpDir = "";
let uploadImagePath = "";

before(async () => {
  await resetAdminPassword(owner, E2E_ADMIN.password);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-e2e-media-"));
  uploadImagePath = path.join(tmpDir, "lombang-e2e.png");
  const buf = await sharp({
    create: { width: 640, height: 420, channels: 3, background: { r: 24, g: 112, b: 148 } },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(uploadImagePath, buf);
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await closeAll();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("media library UI & folder workflow (Fase 5)", () => {
  test("create folder, upload image, edit metadata, search/filter, delete unused via confirmation dialog, and 0px mobile overflow", async () => {
    const context = await newContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await loginInBrowser(page);
    await page.waitForURL(`${BASE}/admin`);

    await page.goto(`${BASE}/admin/media`);
    await page.getByRole("heading", { name: "Media Library", exact: true }).waitFor();

    // 1. Buat folder baru lewat panel Kelola folder
    await page.getByRole("button", { name: /Kelola folder/ }).click();
    await page.fill("#new-folder-name", "Pantai E2E");
    await page.getByRole("button", { name: "Tambah folder" }).click();
    await page.getByText(/Folder "Pantai E2E" dibuat\./).waitFor();

    // 2. Unggah gambar baru langsung ke folder Pantai E2E
    await page.getByRole("button", { name: "Unggah gambar" }).click();
    await page.locator('input[type="file"]').setInputFiles(uploadImagePath);
    await page.getByPlaceholder("Jelaskan isi foto secara singkat").fill("Pantai Lombang Pagi Hari");
    await page.getByLabel("Folder (opsional)").selectOption({ label: "Pantai E2E" });
    await page.getByRole("button", { name: "Simpan & unggah" }).click();
    await page.getByText(/Gambar berhasil diunggah ke pustaka media\./).waitFor();

    // 3. Filter berdasar folder Pantai E2E dan ubah metadata keterangan
    await page.getByRole("link", { name: /Pantai E2E \(1\)/ }).click();
    await page.waitForURL(/folder=/);
    await page.getByText("Pantai Lombang Pagi Hari").first().waitFor();

    const inspector = page.getByLabel("Detail media");
    await inspector.getByLabel("Kredit foto").fill("Foto: Koresponden E2E");
    await inspector.getByRole("button", { name: "Simpan keterangan" }).click();
    await page.getByText(/Keterangan dan folder gambar diperbarui\./).waitFor();

    await screenshot(page, "media-library-1440");

    // 4. Cek tampilan mobile 390px tanpa horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/media`);
    await page.getByRole("heading", { name: "Media Library", exact: true }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `unexpected horizontal overflow on 390px /admin/media: ${overflow}px`);
    await screenshot(page, "media-library-390");

    // 5. Hapus permanen gambar yang belum dipakai melalui modal konfirmasi
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/media?pemakaian=tidak-dipakai`);
    const detailPanel = page.getByLabel("Detail media");
    await detailPanel.getByRole("button", { name: "Hapus permanen" }).click();
    const confirmDialog = page.getByRole("dialog", { name: /Hapus gambar secara permanen/ });
    await confirmDialog.waitFor();
    await confirmDialog.getByRole("button", { name: "Ya, hapus permanen" }).click();
    await page.getByText(/dihapus permanen\./).waitFor();

    await context.close();
  });
});
