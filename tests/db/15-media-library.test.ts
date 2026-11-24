import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import sharp from "sharp";

import {
  createMediaFolder,
  deleteMediaFolder,
  listMediaLibrary,
  renameMediaFolder,
} from "@/server/media/library";
import { deleteMedia, MediaError, updateMediaMeta, uploadImage } from "@/server/media/service";

import { connect, resetData } from "../helpers/db";
import { insertAdmin, makeAuthor } from "../helpers/fixtures";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sumenep-media-lib-"));
process.env.MEDIA_ROOT = root;

const { owner, app, close } = connect();
const actor = { adminId: 1 };

const makePng = (r: number, g: number, b: number) =>
  sharp({ create: { width: 120, height: 90, channels: 3, background: { r, g, b } } }).png().toBuffer();

before(async () => {
  await resetData(owner);
  await insertAdmin(owner);
});

after(async () => {
  await close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("media folders & library queries (Fase 5 DB)", () => {
  test("create, duplicate-guard, rename, upload-with-folder, move, and delete folder keeps media safe", async () => {
    const f1 = await createMediaFolder(app, { name: "Kepulauan" }, actor);
    assert.equal(f1.ok, true);
    if (!f1.ok) throw new Error("expected folder");

    const dup = await createMediaFolder(app, { name: "Kepulauan" }, actor);
    assert.equal(dup.ok, false);

    const f2 = await createMediaFolder(app, { name: "Arsip Foto" }, actor);
    assert.equal(f2.ok, true);
    if (!f2.ok) throw new Error("expected second folder");

    const dupRename = await renameMediaFolder(app, f2.folder.id, { name: "Kepulauan" }, actor);
    assert.equal(dupRename.ok, false);

    const renamed = await renameMediaFolder(app, f2.folder.id, { name: "Arsip Redaksi" }, actor);
    assert.equal(renamed.ok, true);
    if (!renamed.ok) throw new Error("expected rename");
    assert.equal(renamed.folder.name, "Arsip Redaksi");

    // Upload image directly into folder 1 + another without folder
    const { media: m1 } = await uploadImage(
      app,
      { name: "pulau.png", bytes: await makePng(10, 90, 140) },
      { alt: "Dermaga Kalianget", folderId: f1.folder.id },
      actor,
    );
    const { media: m2 } = await uploadImage(
      app,
      { name: "kota.png", bytes: await makePng(190, 80, 40) },
      { alt: "Masjid Jamik" },
      actor,
    );

    assert.equal(m1.folderId, f1.folder.id);
    assert.equal(m2.folderId, null);

    // Invalid folder rejection before write
    await assert.rejects(
      uploadImage(
        app,
        { name: "bad.png", bytes: await makePng(3, 3, 3) },
        { alt: "Gagal", folderId: "11111111-1111-4111-8111-111111111111" },
        actor,
      ),
      MediaError,
    );

    // Assign m2 into a folder, mark m1 as used via Article heroMediaId + Author avatar
    const updatedM2 = await updateMediaMeta(
      app,
      m2.id,
      { alt: "Masjid Jamik Sumenep", folderId: f1.folder.id },
      actor,
    );
    assert.equal(updatedM2.folderId, f1.folder.id);

    const author = await makeAuthor(owner, "tim-liputan");
    const kanal = await owner.section.create({ data: { kind: "KANAL", slug: "daerah", name: "Daerah" } });
    await owner.article.create({
      data: {
        slug: "berita-uji-media",
        title: "Berita Uji Media",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: m1.id,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi." }] }] },
      },
    });

    // Query library metrics & filters
    const full = await listMediaLibrary(app, { q: "", folder: "semua", usage: "semua", page: 1 });
    assert.equal(full.stats.totalCount, 2);
    assert.equal(full.stats.usedCount, 1);
    assert.equal(full.stats.unusedCount, 1);
    assert.equal(full.stats.withoutFolderCount, 0);
    assert.ok(full.stats.totalBytes > 0);

    const usedOnly = await listMediaLibrary(app, { q: "", folder: "semua", usage: "dipakai", page: 1 });
    assert.equal(usedOnly.filteredTotal, 1);
    assert.equal(usedOnly.items[0]?.id, m1.id);
    assert.equal(usedOnly.items[0]?.totalUsages, 1);
    assert.equal(usedOnly.items[0]?.usages[0]?.label, "Berita Uji Media");

    // Used image cannot be deleted (409)
    const blocked = await deleteMedia(app, m1.id, actor);
    assert.equal(blocked.ok, false);
    if (blocked.ok) throw new Error("expected 409");
    assert.equal(blocked.status, 409);

    // Deleting folder moves media cleanly to "tanpa-folder" without deleting images
    const delFolder = await deleteMediaFolder(app, f1.folder.id, actor);
    assert.equal(delFolder.ok, true);
    if (!delFolder.ok) throw new Error("expected folder deleted");
    assert.equal(delFolder.movedCount, 2);

    const afterFolderDelete = await listMediaLibrary(app, {
      q: "",
      folder: "tanpa-folder",
      usage: "semua",
      page: 1,
    });
    assert.equal(afterFolderDelete.filteredTotal, 2);
    assert.equal(afterFolderDelete.stats.withoutFolderCount, 2);

    // Unused image m2 can be deleted cleanly
    const deletedM2 = await deleteMedia(app, m2.id, actor);
    assert.equal(deletedM2.ok, true);

    assert.equal(await owner.activityLog.count({ where: { action: "media.folder_create" } }), 2);
    assert.equal(await owner.activityLog.count({ where: { action: "media.folder_rename" } }), 1);
    assert.equal(await owner.activityLog.count({ where: { action: "media.folder_delete" } }), 1);
  });
});
