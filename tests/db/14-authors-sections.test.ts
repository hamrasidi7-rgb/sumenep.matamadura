import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { createArticle, publishArticle } from "@/server/articles/service";
import { editorOptions } from "@/server/articles/queries";
import {
  publicArticlesByAuthor,
  publicAuthorBySlug,
  publicAuthorsList,
} from "@/server/authors/queries";
import {
  createAuthor,
  deleteAuthor,
  listAuthorsForAdmin,
  toggleAuthorActive,
  updateAuthor,
} from "@/server/authors/service";
import {
  createSection,
  deleteSection,
  listSectionsForAdmin,
  toggleSectionActive,
  updateSection,
} from "@/server/sections/service";
import { seedInitialData } from "@/server/seed";

import { connect, resetData } from "../helpers/db";
import { findSection, insertAdmin, makeMedia } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);

const actor = { adminId: 1, ip: "203.0.113.10", userAgent: "uji-fase4" };

beforeEach(async () => {
  await resetData(owner);
  await insertAdmin(owner);
  await seedInitialData(owner);
});

describe("authors service (Fase 4)", () => {
  test("create, auto-slug, avatar FK, update, toggle, and sole-active guard", async () => {
    const avatar = await makeMedia(app, "foto-penulis");
    const created = await createAuthor(
      app,
      { name: "Kontributor Sapeken", role: "Wartawan Kepulauan", bio: "Meliput kepulauan.", avatarId: avatar.id, isActive: true },
      actor,
    );
    assert.ok(created.ok);
    assert.equal(created.slug, "kontributor-sapeken");

    // Duplicate name derives -2 when slug omitted, but rejects explicit colliding slug.
    const dupAuto = await createAuthor(app, { name: "Kontributor Sapeken", role: "Reporter" }, actor);
    assert.ok(dupAuto.ok);
    assert.equal(dupAuto.slug, "kontributor-sapeken-2");

    const dupExplicit = await createAuthor(app, { name: "Lain", slug: "kontributor-sapeken" }, actor);
    assert.ok(!dupExplicit.ok);

    const updated = await updateAuthor(
      app,
      created.id,
      { name: "Ahmad Sapeken", slug: "ahmad-sapeken", role: "Editor Kepulauan", bio: "Bio baru.", avatarId: avatar.id, isActive: true },
      actor,
    );
    assert.ok(updated.ok && updated.slug === "ahmad-sapeken");

    const toggled = await toggleAuthorActive(app, created.id, actor);
    assert.ok(toggled.ok && toggled.isActive === false);

    // Nonaktifkan dupAuto juga -> sekarang tinggal 1 ("redaksi") yang aktif -> menolak nonaktifkan "redaksi".
    await toggleAuthorActive(app, dupAuto.id, actor);
    const redaksi = await app.author.findUniqueOrThrow({ where: { slug: "redaksi" } });
    const soleBlocked = await toggleAuthorActive(app, redaksi.id, actor);
    assert.ok(!soleBlocked.ok);

    const list = await listAuthorsForAdmin(app);
    assert.ok(list.avatarMedia[avatar.id]);
    assert.equal(list.authors.length, 3);
    assert.ok(await owner.activityLog.count({ where: { action: "author.create" } }) >= 2);
    assert.equal(await owner.activityLog.count({ where: { action: "author.update" } }), 1);
  });

  test("refuses deleting an author referenced by an article, allows deleting an unused author", async () => {
    const unused = await createAuthor(app, { name: "Penulis Sementara" }, actor);
    assert.ok(unused.ok);
    const used = await createAuthor(app, { name: "Penulis Dipakai" }, actor);
    assert.ok(used.ok);
    const kanal = await findSection(app, "KANAL", "ekonomi");
    const art = await createArticle(
      app,
      {
        title: "Artikel Dengan Penulis",
        standfirst: "Ringkasan.",
        authorId: used.id,
        kanalId: kanal.id,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi." }] }] },
      },
      actor,
    );
    assert.ok(art.ok);

    const blocked = await deleteAuthor(app, used.id, actor);
    assert.ok(!blocked.ok);
    assert.match(blocked.error, /masih terhubung/);

    const deleted = await deleteAuthor(app, unused.id, actor);
    assert.ok(deleted.ok);
    assert.equal(await owner.activityLog.count({ where: { action: "author.delete", entityId: unused.id } }), 1);
  });

  test("editorOptions preserves inactive assigned author and public author queries expose published work", async () => {
    const avatar = await makeMedia(app, "foto-zainal");
    const authorCreated = await createAuthor(
      app,
      {
        name: "Dr. Zainal Arifin",
        role: "Pengamat Budaya",
        bio: "Meneliti sejarah dan sastra lisan Madura.",
        avatarId: avatar.id,
        isActive: true,
      },
      actor,
    );
    assert.ok(authorCreated.ok);

    const idleInactive = await createAuthor(
      app,
      { name: "Kontributor Nonaktif Tanpa Karya", role: "Kontributor", isActive: false },
      actor,
    );
    assert.ok(idleInactive.ok);

    const kanal = await findSection(app, "KANAL", "ekonomi");
    const hero = await makeMedia(app, "hero-budaya");
    const created = await createArticle(
      app,
      {
        title: "Jejak Sastra Pesisir Sumenep",
        standfirst: "Menelusuri tradisi naskah kuno di pesisir timur.",
        authorId: authorCreated.id,
        kanalId: kanal.id,
        heroMediaId: hero.id,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi berita sastra pesisir." }] }] },
      },
      actor,
    );
    assert.ok(created.ok);

    // Draft article does not appear in public author archive yet.
    const beforePubAuthor = await publicAuthorBySlug(app, authorCreated.slug);
    assert.equal(beforePubAuthor?.name, "Dr. Zainal Arifin");
    assert.equal(beforePubAuthor?.role, "Pengamat Budaya");
    assert.ok(beforePubAuthor?.avatar?.src.includes("foto-zainal"));
    assert.equal((await publicArticlesByAuthor(app, authorCreated.slug)).length, 0);

    // Unused inactive author stays hidden from public profile & sitemap list.
    assert.equal(await publicAuthorBySlug(app, idleInactive.slug), null);
    assert.equal((await publicAuthorsList(app)).some((a) => a.slug === idleInactive.slug), false);

    // Publish article, then deactivate author -> existing article & profile must stay live and editable.
    const pub = await publishArticle(
      app,
      created.id,
      created.version,
      {
        title: "Jejak Sastra Pesisir Sumenep",
        standfirst: "Menelusuri tradisi naskah kuno di pesisir timur.",
        authorId: authorCreated.id,
        kanalId: kanal.id,
        heroMediaId: hero.id,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi berita sastra pesisir." }] }] },
      },
      null,
      actor,
    );
    assert.ok(pub.ok);

    const toggled = await toggleAuthorActive(app, authorCreated.id, actor);
    assert.ok(toggled.ok && toggled.isActive === false);

    const plainOpts = await editorOptions(app);
    assert.equal(plainOpts.authors.some((a) => a.id === authorCreated.id), false);

    const editOpts = await editorOptions(app, { includeAuthorId: authorCreated.id });
    assert.equal(editOpts.authors.find((a) => a.id === authorCreated.id)?.name, "Dr. Zainal Arifin (nonaktif)");

    const filterOpts = await editorOptions(app, { includeUsedAuthors: true });
    assert.equal(filterOpts.authors.some((a) => a.id === authorCreated.id), true);

    const pubAfterDeactivate = await publicAuthorBySlug(app, authorCreated.slug);
    assert.equal(pubAfterDeactivate?.name, "Dr. Zainal Arifin");
    const pubArticles = await publicArticlesByAuthor(app, authorCreated.slug);
    assert.equal(pubArticles.length, 1);
    assert.equal(pubArticles[0]?.title, "Jejak Sastra Pesisir Sumenep");
    assert.equal(pubArticles[0]?.author.name, "Dr. Zainal Arifin");
  });
});

describe("sections service (Fase 4)", () => {
  test("create, update without altering kind, toggle active, and usage delete guard", async () => {
    const kanalCreated = await createSection(
      app,
      { kind: "KANAL", name: "Wisata Bahari", description: "Destinasi Sumenep", sortOrder: 12, isActive: true },
      actor,
    );
    assert.ok(kanalCreated.ok);
    assert.equal(kanalCreated.slug, "wisata-bahari");

    const rubrikUnused = await createSection(
      app,
      { kind: "RUBRIK", name: "Lintas Pulau", description: "Cerita pulau kecil", sortOrder: 8, isActive: true },
      actor,
    );
    assert.ok(rubrikUnused.ok);

    // Update tanpa mengirim `kind` menjaga guard section.kind immutable tetap lulus.
    const upd = await updateSection(
      app,
      kanalCreated.id,
      { name: "Pariwisata & Bahari", slug: "pariwisata-bahari", description: "Diperbarui", sortOrder: 7, isActive: true },
      actor,
    );
    assert.ok(upd.ok && upd.slug === "pariwisata-bahari");

    const toggled = await toggleSectionActive(app, kanalCreated.id, actor);
    assert.ok(toggled.ok && toggled.isActive === false);

    // Pakai rubrik Catatan Sumenep (dipakai homepage_rubric dari seedInitialData) -> tolak hapus.
    const catatan = await findSection(app, "RUBRIK", "catatan-sumenep");
    const blockedHome = await deleteSection(app, catatan.id, actor);
    assert.ok(!blockedHome.ok);

    // Hapus rubrik yang tidak dipakai -> berhasil & tercatat di activity_log.
    const delOk = await deleteSection(app, rubrikUnused.id, actor);
    assert.ok(delOk.ok);
    assert.equal(await owner.activityLog.count({ where: { action: "section.delete", entityId: rubrikUnused.id } }), 1);

    const listed = await listSectionsForAdmin(app);
    assert.ok(listed.kanal.some((k) => k.slug === "pariwisata-bahari" && k.isActive === false));
  });
});
