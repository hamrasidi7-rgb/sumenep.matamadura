import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import sharp from "sharp";

import { connect, resetData } from "../helpers/db";
import { insertAdmin } from "../helpers/fixtures";

// Upload pipeline (adapted from Busacare's sharp upload). Files go to a
// temporary MEDIA_ROOT for this test file only.

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-media-"));
process.env.MEDIA_ROOT = root;

const { owner, app, close } = connect();
const actor = { adminId: 1 };
let service: typeof import("@/server/media/service");
let storage: typeof import("@/server/media/storage");

before(async () => {
  service = await import("@/server/media/service");
  storage = await import("@/server/media/storage");
  await resetData(owner);
  await insertAdmin(owner);
});
after(async () => {
  await close();
  fs.rmSync(root, { recursive: true, force: true });
});

const jpegWithExif = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 166, g: 27, b: 43 } } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "Uji", Artist: "Kamera uji" } } })
    .toBuffer();

describe("image upload", () => {
  test("stored as WebP, at most 2400 px, rotated by EXIF, metadata removed, deduplicated", async () => {
    const bytes = await jpegWithExif();
    const first = await service.uploadImage(app, { name: "laut.jpg", bytes }, { alt: "Laut merah", caption: "Uji", credit: "Foto: Redaksi" }, actor);
    assert.equal(first.duplicate, false);
    assert.match(first.media.src, /^\/media\/\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/);
    // EXIF orientation 6 = rotate 90°: 3000×2000 becomes portrait, then fits in 2400 px
    assert.deepEqual([first.media.width, first.media.height], [1600, 2400]);

    const key = first.media.src.replace(/^\/media\//, "");
    const stored = await storage.getMediaStorage().get(key);
    assert.ok(stored);
    const meta = await sharp(stored).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined, "EXIF (camera, GPS) is stripped");

    const again = await service.uploadImage(app, { name: "salinan.jpg", bytes }, { alt: "lagi" }, actor);
    assert.equal(again.duplicate, true);
    assert.equal(again.media.id, first.media.id);
    assert.equal(await owner.media.count(), 1);
    assert.equal(await owner.activityLog.count({ where: { action: "media.upload" } }), 1);
  });

  test("non-images and unsupported formats are refused from their bytes, whatever the name", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await assert.rejects(service.uploadImage(app, { name: "foto.jpg", bytes: svg }, { alt: "x" }, actor), service.MediaError);
    await assert.rejects(service.uploadImage(app, { name: "foto.png", bytes: Buffer.from("bukan gambar") }, { alt: "x" }, actor), service.MediaError);
    await assert.rejects(service.uploadImage(app, { name: "kosong.png", bytes: Buffer.alloc(0) }, { alt: "x" }, actor), service.MediaError);
  });

  test("alt, caption and credit can be updated later", async () => {
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const { media } = await service.uploadImage(app, { name: "putih.png", bytes: png }, { alt: "" }, actor);
    const updated = await service.updateMediaMeta(app, media.id, { alt: "Kertas putih", caption: "Caption", credit: "Foto: Uji" }, actor);
    assert.deepEqual([updated.alt, updated.caption, updated.credit], ["Kertas putih", "Caption", "Foto: Uji"]);
  });

  test("media keys are strictly checked (no path traversal)", () => {
    for (const bad of ["../../etc/passwd", "2026/11/../../x.webp", "2026/11/ABC.webp", "2026/11/0123456789abcdef.svg"]) {
      assert.throws(() => storage.assertMediaKey(bad), bad);
    }
  });

  test("original file names are kept for display only, without folders or control characters", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#123456" } }).png().toBuffer();
    const { media } = await service.uploadImage(app, { name: "..\..\C:\rahasia/../foto\u0007 pantai.png", bytes: png }, { alt: "x" }, actor);
    const row = await owner.media.findUniqueOrThrow({ where: { id: media.id } });
    assert.equal(row.originalName, "foto pantai.png");
    assert.match(row.storageKey, /^\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/, "the stored path never comes from the name");
  });

  test("featured preset crops to exact 1200×750 (16:10) honoring focal point and keeps distinct focal variants separate", async () => {
    // 1000×1000 image with red top half and blue bottom half so focalY=0 vs focalY=100 produces visibly distinct crops.
    const redTop = await sharp({ create: { width: 1000, height: 500, channels: 3, background: { r: 220, g: 20, b: 20 } } }).raw().toBuffer();
    const blueBottom = await sharp({ create: { width: 1000, height: 500, channels: 3, background: { r: 20, g: 40, b: 220 } } }).raw().toBuffer();
    const dualTone = await sharp(Buffer.concat([redTop, blueBottom]), { raw: { width: 1000, height: 1000, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    const topCrop = await service.uploadImage(
      app,
      { name: "dual.jpg", bytes: dualTone },
      { alt: "Crop atas", caption: "Bagian atas", credit: "Foto: Uji" },
      actor,
      undefined,
      { preset: "featured", focalX: 50, focalY: 0 },
    );
    assert.equal(topCrop.duplicate, false);
    assert.deepEqual([topCrop.media.width, topCrop.media.height], [1200, 750]);

    const bottomCrop = await service.uploadImage(
      app,
      { name: "dual.jpg", bytes: dualTone },
      { alt: "Crop bawah", caption: "Bagian bawah", credit: "Foto: Uji" },
      actor,
      undefined,
      { preset: "featured", focalX: 50, focalY: 100 },
    );
    assert.equal(bottomCrop.duplicate, false);
    assert.notEqual(bottomCrop.media.id, topCrop.media.id);
    assert.deepEqual([bottomCrop.media.width, bottomCrop.media.height], [1200, 750]);

    // Same bytes + same focal point deduplicates cleanly.
    const repeatTop = await service.uploadImage(
      app,
      { name: "dual-repeat.jpg", bytes: dualTone },
      { alt: "Ulang" },
      actor,
      undefined,
      { preset: "featured", focalX: 50, focalY: 0 },
    );
    assert.equal(repeatTop.duplicate, true);
    assert.equal(repeatTop.media.id, topCrop.media.id);

    // Verify top crop center pixel is red-dominant and bottom crop center pixel is blue-dominant.
    const topKey = topCrop.media.src.replace(/^\/media\//, "");
    const bottomKey = bottomCrop.media.src.replace(/^\/media\//, "");
    const topCenter = await sharp((await storage.getMediaStorage().get(topKey))!)
      .extract({ left: 600, top: 375, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const bottomCenter = await sharp((await storage.getMediaStorage().get(bottomKey))!)
      .extract({ left: 600, top: 375, width: 1, height: 1 })
      .raw()
      .toBuffer();
    assert.ok(topCenter[0] > topCenter[2], `top crop center expected red-dominant, got rgb(${topCenter[0]},${topCenter[1]},${topCenter[2]})`);
    assert.ok(bottomCenter[2] > bottomCenter[0], `bottom crop center expected blue-dominant, got rgb(${bottomCenter[0]},${bottomCenter[1]},${bottomCenter[2]})`);

    // Re-cropping an existing Media Library asset creates a 1200×750 copy preserving alt/caption/credit without mutating original.
    const original = await service.uploadImage(
      app,
      { name: "library-square.jpg", bytes: dualTone },
      { alt: "Asli persegi", caption: "Caption asli", credit: "Foto: Pustaka" },
      actor,
    );
    assert.deepEqual([original.media.width, original.media.height], [1000, 1000]);

    const recropped = await service.cropExistingMediaToFeatured(app, original.media.id, { focalX: 50, focalY: 20 }, actor);
    assert.deepEqual([recropped.media.width, recropped.media.height], [1200, 750]);
    assert.equal(recropped.media.alt, "Asli persegi");
    assert.equal(recropped.media.caption, "Caption asli");
    assert.equal(recropped.media.credit, "Foto: Pustaka");
    assert.notEqual(recropped.media.id, original.media.id);
  });
});

describe("deleting media", () => {
  test("an unused image: row and file are removed, the deletion is logged", async () => {
    const png = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#00ff00" } }).png().toBuffer();
    const { media } = await service.uploadImage(app, { name: "hapus.png", bytes: png }, { alt: "x" }, actor);
    const key = media.src.replace(/^\/media\//, "");
    assert.ok(fs.existsSync(path.join(root, ...key.split("/"))), "file on disk");
    const result = await service.deleteMedia(app, media.id, actor);
    assert.deepEqual(result, { ok: true, storageKey: key });
    assert.equal(await owner.media.count({ where: { id: media.id } }), 0);
    assert.equal(fs.existsSync(path.join(root, ...key.split("/"))), false, "file removed from disk");
    assert.equal(await storage.getMediaStorage().get(key), null);
    assert.equal(await owner.activityLog.count({ where: { action: "media.delete", entityId: media.id } }), 1);
    assert.deepEqual(await service.deleteMedia(app, media.id, actor), { ok: false, status: 404, error: "Gambar tidak ditemukan." });
  });

  test("an image in use is refused and its file stays", async () => {
    const png = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#0000ff" } }).png().toBuffer();
    const { media } = await service.uploadImage(app, { name: "dipakai.png", bytes: png }, { alt: "x" }, actor);
    const author = await app.author.create({ data: { slug: "penulis-foto", name: "Penulis", avatarId: media.id } });
    const result = await service.deleteMedia(app, media.id, actor);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 409);
    const key = media.src.replace(/^\/media\//, "");
    assert.ok(await storage.getMediaStorage().get(key), "file kept");
    assert.equal(await owner.media.count({ where: { id: media.id } }), 1);
    await app.author.delete({ where: { id: author.id } });
  });
});
