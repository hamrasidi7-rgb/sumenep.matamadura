import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import type { Prisma } from "@prisma/client";

import { seedInitialData } from "@/server/seed";

import { connect, rejects, resetData } from "../helpers/db";
import { findSection, makeAuthor, makeMedia, sha256 } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);

let ctx: { authorId: string; heroId: string; kanalId: string; rubrikId: string };

beforeEach(async () => {
  await resetData(owner);
  await seedInitialData(owner);
  const [author, hero, kanal, rubrik] = await Promise.all([
    makeAuthor(app, "penulis-uji"),
    makeMedia(app),
    findSection(app, "KANAL", "ekonomi"),
    findSection(app, "RUBRIK", "catatan-sumenep"),
  ]);
  ctx = { authorId: author.id, heroId: hero.id, kanalId: kanal.id, rubrikId: rubrik.id };
});

const draft = (data: Partial<Prisma.ArticleUncheckedCreateInput> = {}) =>
  app.article.create({ data: { slug: "garam-kalianget", title: "Garam Kalianget", authorId: ctx.authorId, ...data } });

describe("kanal / rubrik", () => {
  test("kanal must be a KANAL section and rubrik a RUBRIK section", async () => {
    await rejects(draft({ kanalId: ctx.rubrikId }), /23514/, /kanal_id must reference an existing KANAL/);
    await rejects(draft({ rubrikId: ctx.kanalId }), /23514/, /rubrik_id must reference an existing RUBRIK/);
    const article = await draft({ kanalId: ctx.kanalId, rubrikId: ctx.rubrikId });
    await rejects(app.article.update({ where: { id: article.id }, data: { kanalId: ctx.rubrikId } }), /KANAL/);
  });

  test("a section's kind can never change", async () => {
    await rejects(app.section.update({ where: { id: ctx.kanalId }, data: { kind: "RUBRIK" } }), /23514/, /section\.kind cannot change/);
  });

  test("slug is unique per kind, and lowercase-kebab", async () => {
    await rejects(app.section.create({ data: { kind: "KANAL", slug: "ekonomi", name: "Lagi" } }), /23505/);
    await app.section.create({ data: { kind: "RUBRIK", slug: "ekonomi", name: "Rubrik Ekonomi" } });
    await rejects(app.section.create({ data: { kind: "KANAL", slug: "Wisata Bahari", name: "Wisata" } }), /section_slug_format/);
  });

  test("homepage bands only take rubrik sections", async () => {
    await rejects(app.homepageRubric.create({ data: { sectionId: ctx.kanalId, position: 1 } }), /homepage_rubric\.section_id must reference an existing RUBRIK/);
  });

  test("a section, author or media in use cannot be deleted", async () => {
    await draft({ kanalId: ctx.kanalId, heroMediaId: ctx.heroId });
    await rejects(app.section.delete({ where: { id: ctx.kanalId } }), /23503/);
    await rejects(app.author.delete({ where: { id: ctx.authorId } }), /23503/);
    await rejects(app.media.delete({ where: { id: ctx.heroId } }), /23503/);
    // rubrik used by the homepage band
    await rejects(app.section.delete({ where: { id: ctx.rubrikId } }), /23503/);
  });
});

describe("article status rules", () => {
  test("PUBLISHED needs a publish date, a hero image and a kanal or rubrik", async () => {
    const complete = { status: "PUBLISHED" as const, publishedAt: new Date(), heroMediaId: ctx.heroId, kanalId: ctx.kanalId };
    await rejects(draft({ ...complete, publishedAt: null }), /23514/, /article_published_needs_date/);
    await rejects(draft({ ...complete, heroMediaId: null }), /article_published_needs_hero/);
    await rejects(draft({ ...complete, kanalId: null }), /article_published_needs_section/);
    const article = await draft(complete);
    assert.equal(article.status, "PUBLISHED");
    // a draft may be incomplete
    await draft({ slug: "draf-kosong" });
  });

  test("ARCHIVED needs an archive date", async () => {
    const article = await draft();
    await rejects(app.article.update({ where: { id: article.id }, data: { status: "ARCHIVED" } }), /article_archived_needs_date/);
    await app.article.update({ where: { id: article.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  });

  test("every status change is recorded automatically", async () => {
    const article = await draft({ kanalId: ctx.kanalId, heroMediaId: ctx.heroId });
    await app.article.update({ where: { id: article.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await app.article.update({ where: { id: article.id }, data: { title: "Judul baru" } }); // no status change
    await app.article.update({ where: { id: article.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    const history = await app.articleStatusChange.findMany({ where: { articleId: article.id }, orderBy: { id: "asc" } });
    assert.deepEqual(
      history.map((h) => `${h.fromStatus ?? "∅"}→${h.toStatus}`),
      ["∅→DRAFT", "DRAFT→PUBLISHED", "PUBLISHED→ARCHIVED"],
    );
  });

  test("slug, title, URL and version rules", async () => {
    await rejects(draft({ slug: "Garam Kalianget" }), /article_slug_format/);
    await rejects(draft({ slug: "-garam" }), /article_slug_format/);
    await rejects(draft({ slug: "a".repeat(121) }), /article_slug_format/);
    await rejects(draft({ title: "   " }), /article_title_not_blank/);
    await rejects(draft({ canonicalUrl: "http://contoh.id/x" }), /article_canonical_url_https/);
    await rejects(draft({ version: 0 }), /article_version_positive/);
    await rejects(draft({ tags: undefined, slug: "ok" }).then(() => app.$executeRawUnsafe(`UPDATE "article" SET "tags" = NULL`)), /article_tags_not_null/);
  });
});

describe("slug history (301 redirects)", () => {
  test("old slugs are kept automatically and point at the article", async () => {
    const a = await draft({ slug: "slug-satu" });
    await app.article.update({ where: { id: a.id }, data: { slug: "slug-dua" } });
    await app.article.update({ where: { id: a.id }, data: { slug: "slug-tiga" } });
    let history = await app.articleSlugHistory.findMany({ orderBy: { slug: "asc" } });
    assert.deepEqual(
      history.map((h) => [h.slug, h.articleId]),
      [
        ["slug-dua", a.id],
        ["slug-satu", a.id],
      ],
    );
    // going back to an old slug removes it from the history (it is live again)
    await app.article.update({ where: { id: a.id }, data: { slug: "slug-satu" } });
    history = await app.articleSlugHistory.findMany({ orderBy: { slug: "asc" } });
    assert.deepEqual(
      history.map((h) => h.slug),
      ["slug-dua", "slug-tiga"],
    );
  });

  test("a new article taking an old slug wins over the redirect", async () => {
    const a = await draft({ slug: "lama" });
    await app.article.update({ where: { id: a.id }, data: { slug: "baru" } });
    assert.equal(await app.articleSlugHistory.count({ where: { slug: "lama" } }), 1);
    await draft({ slug: "lama", title: "Artikel lain" });
    assert.equal(await app.articleSlugHistory.count({ where: { slug: "lama" } }), 0);
  });
});

describe("deleting an article", () => {
  test("cascades to its history, media usage and homepage slot; hero setting is cleared", async () => {
    const gallery = await makeMedia(app, "galeri-1");
    const a = await draft({ kanalId: ctx.kanalId, heroMediaId: ctx.heroId, status: "PUBLISHED", publishedAt: new Date() });
    await app.article.update({ where: { id: a.id }, data: { slug: "garam-kalianget-2" } });
    await app.articleMedia.create({ data: { articleId: a.id, mediaId: gallery.id, usage: "GALLERY", position: 0 } });
    await app.articleRevision.create({ data: { articleId: a.id, version: 1, reason: "PUBLISH", snapshot: { title: a.title } } });
    await app.homepageFeatured.create({ data: { articleId: a.id, position: 0 } });
    await app.homepageSettings.update({ where: { id: 1 }, data: { heroArticleId: a.id } });

    await rejects(app.media.delete({ where: { id: gallery.id } }), /23503/, /article_media_media_id_fkey/);
    await app.article.delete({ where: { id: a.id } });

    for (const count of await Promise.all([
      app.articleMedia.count(),
      app.articleRevision.count(),
      app.articleStatusChange.count(),
      app.articleSlugHistory.count(),
      app.homepageFeatured.count(),
    ])) {
      assert.equal(count, 0);
    }
    assert.equal((await app.homepageSettings.findUniqueOrThrow({ where: { id: 1 } })).heroArticleId, null);
    await app.media.delete({ where: { id: gallery.id } }); // free again
  });
});

describe("homepage, settings and media rules", () => {
  test("singletons cannot gain a second row", async () => {
    await rejects(owner.homepageSettings.create({ data: { id: 2 } }), /23514/, /homepage_settings_singleton/);
    await rejects(owner.siteSettings.create({ data: { id: 2 } }), /23514/, /site_settings_singleton/);
    await rejects(app.siteSettings.create({ data: { id: 2 } }), /42501/);
    await rejects(app.homepageSettings.update({ where: { id: 1 }, data: { latestCount: 0 } }), /homepage_settings_latest_count_range/);
  });

  test("Tulisan Pilihan: unique positions 0–11", async () => {
    const a = await draft({ slug: "a" });
    const b = await draft({ slug: "b" });
    await app.homepageFeatured.create({ data: { articleId: a.id, position: 0 } });
    await rejects(app.homepageFeatured.create({ data: { articleId: b.id, position: 0 } }), /23505/);
    await rejects(app.homepageFeatured.create({ data: { articleId: b.id, position: 12 } }), /homepage_featured_position_range/);
  });

  test("media metadata is checked", async () => {
    const base = { storageKey: "m/x.webp", originalName: "x.jpg", mimeType: "image/webp", sizeBytes: 10, sha256: sha256("x") };
    await rejects(app.media.create({ data: { ...base, sha256: "ABC" } }), /media_sha256_hex/);
    await rejects(app.media.create({ data: { ...base, sizeBytes: 0 } }), /media_size_positive/);
    await rejects(app.media.create({ data: { ...base, width: 0 } }), /media_dimensions_positive/);
    await app.media.create({ data: base });
    // the same file twice (same sha256) is refused
    await rejects(app.media.create({ data: { ...base, storageKey: "m/y.webp" } }), /23505/, /sha256/);
  });
});
