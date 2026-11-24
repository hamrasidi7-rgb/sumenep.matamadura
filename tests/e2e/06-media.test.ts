import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import sharp from "sharp";

import { resetAdminPassword } from "@/server/admin/recover";

import { E2E_ADMIN } from "./admin";
import { closeAll, http, mintSession, ORIGIN, owner } from "./helpers";

// Media on the local disk (MEDIA_ROOT outside the app directory, as in
// production), through the real HTTP API of the production build.

const mediaRoot = process.env.MEDIA_ROOT ?? "";
const sha = (bytes: Buffer | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let session = "";

before(async () => {
  assert.ok(path.isAbsolute(mediaRoot), "MEDIA_ROOT is an absolute path");
  assert.ok(!path.resolve(mediaRoot).toLowerCase().startsWith(process.cwd().toLowerCase()), "MEDIA_ROOT is outside the app directory");
  await resetAdminPassword(owner, E2E_ADMIN.password);
  session = await mintSession();
});
after(closeAll);

async function upload(bytes: Buffer, name: string, type = "image/jpeg", extra: { origin?: string; session?: string } = {}) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  form.append("alt", `Uji ${name}`);
  return http("/api/admin/media", { method: "POST", headers: { origin: extra.origin ?? ORIGIN }, session: extra.session ?? session, body: form });
}

const jpeg = (r: number, g: number, b: number, width = 1200, height = 800) =>
  sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();

describe("upload", () => {
  test("a photo is stored as WebP on disk under MEDIA_ROOT and served from /media/<key>", async () => {
    const response = await upload(await jpeg(200, 120, 40), "senja.jpg");
    assert.equal(response.status, 201);
    const { media, duplicate } = (await response.json()) as { media: { id: string; src: string; width: number }; duplicate: boolean };
    assert.equal(duplicate, false);
    assert.match(media.src, /^\/media\/\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/);
    const key = media.src.slice("/media/".length);
    const file = path.join(mediaRoot, ...key.split("/"));
    assert.ok(fs.existsSync(file), "file written to the media folder");

    const served = await http(media.src);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/webp");
    assert.equal(served.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.match(served.headers.get("content-security-policy") ?? "", /sandbox/);
    const bytes = Buffer.from(await served.arrayBuffer());
    assert.equal(sha(bytes), sha(fs.readFileSync(file)), "served bytes = file on disk");
    assert.equal((await sharp(bytes).metadata()).format, "webp");

    // The same photo again is recognised, not stored twice.
    const again = await upload(await jpeg(200, 120, 40), "salinan.jpg");
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { duplicate: boolean }).duplicate, true);
  });

  test("type is decided by the bytes: renamed non-images and SVG are refused (422)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal((await upload(svg, "foto.jpg", "image/jpeg")).status, 422);
    assert.equal((await upload(svg, "gambar.svg", "image/svg+xml")).status, 422);
    assert.equal((await upload(Buffer.from("%PDF-1.7 bukan foto"), "dokumen.pdf", "application/pdf")).status, 422, "PDF is not accepted");
    assert.equal((await upload(Buffer.from("MZ executable"), "virus.png", "image/png")).status, 422);
  });

  test("size limit: more than 15 MB is refused (413) before it is processed", async () => {
    const big = Buffer.alloc(15 * 1024 * 1024 + 1, 0xff);
    assert.equal((await upload(big, "besar.jpg")).status, 413);
  });

  test("other image formats are converted (PNG, WebP, GIF)", async () => {
    const base = sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 160, b: 90 } } });
    for (const [bytes, name] of [
      [await base.clone().png().toBuffer(), "a.png"],
      [await base.clone().webp().toBuffer(), "b.webp"],
      [await base.clone().gif().toBuffer(), "c.gif"],
    ] as const) {
      const response = await upload(bytes, name, "application/octet-stream");
      assert.equal(response.status, 201, name);
    }
  });
});

describe("access control", () => {
  test("upload and delete need a session (401) and the site's own origin (403)", async () => {
    const bytes = await jpeg(1, 2, 3, 64, 64);
    assert.equal((await upload(bytes, "tanpa-sesi.jpg", "image/jpeg", { session: "" })).status, 401);
    assert.equal((await upload(bytes, "lintas.jpg", "image/jpeg", { origin: "https://matamaduranews.com" })).status, 403);
    const id = "11111111-1111-4111-8111-111111111111";
    assert.equal((await http(`/api/admin/media/${id}`, { method: "DELETE", headers: { origin: ORIGIN } })).status, 401);
    assert.equal((await http(`/api/admin/media/${id}`, { method: "DELETE", headers: { origin: "https://matamaduranews.com" }, session })).status, 403);
  });

  test("no path traversal or other files through /media", async () => {
    for (const key of ["../../.env", "..%2F..%2F.env", "2026/11/0123456789abcdef.webp", "2026/11/ABCDEF0123456789.webp", "2026/11/x.svg", "%2e%2e/%2e%2e/package.json"]) {
      assert.equal((await http(`/media/${key}`)).status, 404, key);
    }
  });
});

describe("delete", () => {
  test("an unused image: 200, gone from the database and from disk, then 404", async () => {
    const response = await upload(await jpeg(90, 20, 160, 400, 300), "hapus.jpg");
    assert.equal(response.status, 201);
    const { media } = (await response.json()) as { media: { id: string; src: string } };
    const file = path.join(mediaRoot, ...media.src.slice("/media/".length).split("/"));
    assert.ok(fs.existsSync(file));
    const deleted = await http(`/api/admin/media/${media.id}`, { method: "DELETE", headers: { origin: ORIGIN }, session });
    assert.equal(deleted.status, 200);
    assert.equal(await owner.media.count({ where: { id: media.id } }), 0);
    assert.equal(fs.existsSync(file), false, "file removed");
    assert.equal((await http(media.src)).status, 404);
    assert.equal((await http(`/api/admin/media/${media.id}`, { method: "DELETE", headers: { origin: ORIGIN }, session })).status, 404);
    assert.equal(await owner.activityLog.count({ where: { action: "media.delete", entityId: media.id } }), 1);
  });

  test("an image in use is refused (409) and keeps being served", async () => {
    const response = await upload(await jpeg(160, 160, 20, 400, 300), "dipakai.jpg");
    const { media } = (await response.json()) as { media: { id: string; src: string } };
    await owner.siteSettings.update({ where: { id: 1 }, data: { defaultOgMediaId: media.id } });
    try {
      const refused = await http(`/api/admin/media/${media.id}`, { method: "DELETE", headers: { origin: ORIGIN }, session });
      assert.equal(refused.status, 409);
      assert.equal((await http(media.src)).status, 200);
    } finally {
      await owner.siteSettings.update({ where: { id: 1 }, data: { defaultOgMediaId: null } });
    }
  });
});
