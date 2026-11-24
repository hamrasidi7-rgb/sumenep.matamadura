import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildMediaHref,
  buildMediaLibraryWhere,
  folderNameSchema,
  MEDIA_USED_WHERE,
  parseMediaQuery,
  summarizeMediaUsage,
} from "@/server/media/library";

describe("media library helpers (Fase 5)", () => {
  test("parseMediaQuery applies defaults and accepts only safe filters", () => {
    const folderId = "11111111-1111-4111-8111-111111111111";

    assert.deepEqual(parseMediaQuery({}), {
      q: "",
      folder: "semua",
      usage: "semua",
      page: 1,
    });

    assert.deepEqual(
      parseMediaQuery({
        q: "  kalianget  ",
        folder: folderId,
        pemakaian: "dipakai",
        halaman: "3",
      }),
      {
        q: "kalianget",
        folder: folderId,
        usage: "dipakai",
        page: 3,
      },
    );

    assert.deepEqual(
      parseMediaQuery({
        folder: "bukan-uuid",
        pemakaian: "asing",
        halaman: "-5",
      }),
      {
        q: "",
        folder: "semua",
        usage: "semua",
        page: 1,
      },
    );
  });

  test("buildMediaHref omits default params cleanly", () => {
    assert.equal(buildMediaHref({ q: "", folder: "semua", usage: "semua", page: 1 }), "/admin/media");
    assert.equal(
      buildMediaHref({ q: "garam", folder: "tanpa-folder", usage: "tidak-dipakai", page: 2 }),
      "/admin/media?q=garam&folder=tanpa-folder&pemakaian=tidak-dipakai&halaman=2",
    );
  });

  test("buildMediaLibraryWhere combines q, folder, and usage guards", () => {
    const folderId = "22222222-2222-4222-8222-222222222222";
    const where = buildMediaLibraryWhere({ q: "perahu", folder: folderId, usage: "dipakai" });
    assert.ok(Array.isArray(where.AND) && where.AND.length === 3);
    assert.deepEqual(where.AND[1], { folderId });
    assert.deepEqual(where.AND[2], MEDIA_USED_WHERE);

    const unusedNoFolder = buildMediaLibraryWhere({ q: "", folder: "tanpa-folder", usage: "tidak-dipakai" });
    assert.ok(Array.isArray(unusedNoFolder.AND) && unusedNoFolder.AND.length === 2);
    assert.deepEqual(unusedNoFolder.AND[0], { folderId: null });
    assert.deepEqual(unusedNoFolder.AND[1], { NOT: MEDIA_USED_WHERE });
  });

  test("summarizeMediaUsage aggregates across 5 FK relations cleanly", () => {
    const { usages, totalUsages } = summarizeMediaUsage({
      heroOf: [{ id: "a1", title: "Panen Garam" }],
      ogOf: [{ id: "a1", title: "Panen Garam" }],
      usages: [{ article: { id: "a2", title: "Wisata Lombang" } }],
      authorAvatars: [{ id: "au1", name: "Redaksi" }],
      siteDefaultOg: [{ id: 1 }],
      _count: { heroOf: 1, ogOf: 1, usages: 2, authorAvatars: 1, siteDefaultOg: 1 },
    });

    assert.equal(totalUsages, 6);
    assert.equal(usages.length, 5);
    assert.equal(usages[0]?.href, "/admin/artikel/a1");
    assert.equal(usages[3]?.href, "/admin/penulis");
    assert.equal(usages[4]?.href, "/admin/pengaturan");
  });

  test("folderNameSchema rejects empty and overlong names", () => {
    assert.equal(folderNameSchema.safeParse({ name: "   " }).success, false);
    assert.equal(folderNameSchema.safeParse({ name: "a".repeat(101) }).success, false);
    assert.equal(folderNameSchema.safeParse({ name: "Liputan Laut" }).success, true);
  });
});
