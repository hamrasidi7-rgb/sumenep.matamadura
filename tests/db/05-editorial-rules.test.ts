import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import type { Prisma } from "@prisma/client";

import type { DocNode } from "@/lib/article-doc";
import type { ArticleFieldsInput } from "@/server/articles/fields";
import { changeArticleState, createArticle, publishArticle, saveArticle } from "@/server/articles/service";
import { seedInitialData } from "@/server/seed";

import { connect, DBERR, LAYERS, rawSql, rejects, resetData } from "../helpers/db";
import { findSection, insertAdmin, makeAuthor, makeMedia, sha256 } from "../helpers/fixtures";

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
  test("kanal must be a KANAL section and rubrik a RUBRIK section (every Prisma write)", async () => {
    await rejects(draft({ kanalId: ctx.rubrikId }), DBERR.guard, /kanal_id must reference an existing KANAL/);
    await rejects(draft({ rubrikId: ctx.kanalId }), DBERR.guard, /rubrik_id must reference an existing RUBRIK/);
    const article = await draft({ kanalId: ctx.kanalId, rubrikId: ctx.rubrikId });
    await rejects(app.article.update({ where: { id: article.id }, data: { kanalId: ctx.rubrikId } }), /KANAL/);
    await rejects(app.article.updateMany({ where: { id: article.id }, data: { rubrikId: ctx.kanalId } }), /RUBRIK/);
    await rejects(app.article.update({ where: { id: article.id }, data: { kanal: { connect: { id: ctx.rubrikId } } } }), /KANAL/);
  });

  test("…and the same at database level when the guard triggers are installed", { skip: LAYERS.triggers ? false : "server refuses CREATE TRIGGER" }, async () => {
    await rejects(
      rawSql("owner", "INSERT INTO article (id, slug, title, author_id, kanal_id, tags, body, updated_at) VALUES (UUID(), 'x', 'X', ?, ?, '[]', '{}', NOW())", [ctx.authorId, ctx.rubrikId]),
      DBERR.signal,
      /kanal_id must reference an existing KANAL/,
    );
    await rejects(rawSql("owner", "UPDATE section SET kind = 'RUBRIK' WHERE id = ?", [ctx.kanalId]), DBERR.signal, /section\.kind cannot change/);
  });

  test("a section's kind can never change", async () => {
    await rejects(app.section.update({ where: { id: ctx.kanalId }, data: { kind: "RUBRIK" } }), DBERR.guard, /section\.kind cannot change/);
    await rejects(app.section.updateMany({ data: { kind: "KANAL" } }), DBERR.guard, /section\.kind cannot change/);
  });

  test("slug is unique per kind, and lowercase-kebab (case-sensitive check)", async () => {
    await rejects(app.section.create({ data: { kind: "KANAL", slug: "ekonomi", name: "Lagi" } }), DBERR.unique);
    await app.section.create({ data: { kind: "RUBRIK", slug: "ekonomi", name: "Rubrik Ekonomi" } });
    await rejects(app.section.create({ data: { kind: "KANAL", slug: "Wisata Bahari", name: "Wisata" } }), DBERR.check, /section_slug_format/);
    await rejects(app.section.create({ data: { kind: "KANAL", slug: "Wisata", name: "Wisata" } }), /section_slug_format/);
  });

  test("homepage bands only take rubrik sections", async () => {
    await rejects(app.homepageRubric.create({ data: { sectionId: ctx.kanalId, position: 1 } }), DBERR.guard, /homepage_rubric\.section_id must reference an existing RUBRIK/);
  });

  test("a section, author or media in use cannot be deleted", async () => {
    await draft({ kanalId: ctx.kanalId, heroMediaId: ctx.heroId });
    await rejects(app.section.delete({ where: { id: ctx.kanalId } }), DBERR.foreignKey);
    await rejects(app.author.delete({ where: { id: ctx.authorId } }), DBERR.foreignKey);
    await rejects(app.media.delete({ where: { id: ctx.heroId } }), DBERR.foreignKey);
    // rubrik used by the homepage band
    await rejects(app.section.delete({ where: { id: ctx.rubrikId } }), DBERR.foreignKey);
  });
});

describe("article status rules", () => {
  test("PUBLISHED needs a publish date, a hero image and a kanal or rubrik", async () => {
    const complete = { status: "PUBLISHED" as const, publishedAt: new Date(), heroMediaId: ctx.heroId, kanalId: ctx.kanalId };
    await rejects(draft({ ...complete, publishedAt: null }), DBERR.check, /article_published_needs_date/);
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

  test("slug, title, URL, version and tags rules", async () => {
    await rejects(draft({ slug: "Garam Kalianget" }), /article_slug_format/);
    await rejects(draft({ slug: "Garam-Kalianget" }), /article_slug_format/);
    await rejects(draft({ slug: "-garam" }), /article_slug_format/);
    await rejects(draft({ slug: "a".repeat(121) }), /article_slug_format/);
    await rejects(draft({ title: "   " }), /article_title_not_blank/);
    await rejects(draft({ canonicalUrl: "http://contoh.id/x" }), /article_canonical_url_https/);
    await rejects(draft({ canonicalUrl: "HTTPS://contoh.id/x" }), /article_canonical_url_https/);
    await rejects(draft({ version: 0 }), /article_version_positive/);
    const ok = await draft({ slug: "ok", tags: ["garam", "Kalianget"] });
    assert.deepEqual(ok.tags, ["garam", "Kalianget"]);
    await rejects(rawSql("owner", "UPDATE article SET tags = NULL"), /1048|cannot be null/i);
    await rejects(rawSql("owner", "UPDATE article SET tags = '{\"a\":1}'"), DBERR.check, /article_tags_array/);
    await rejects(rawSql("owner", "UPDATE article SET tags = 'bukan json'"), /4025|json_valid|tags/);
  });
});

describe("history written by the article service (PostgreSQL: triggers)", () => {
  const actor = { adminId: 1, ip: null, userAgent: null };
  const body = (text: string): DocNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  let input: ArticleFieldsInput;

  beforeEach(async () => {
    await insertAdmin(owner);
    input = { title: "Garam Kalianget", standfirst: "Petani garam.", authorId: ctx.authorId, kanalId: ctx.kanalId, heroMediaId: ctx.heroId, body: body("Isi.") };
  });

  test("every status an article enters is recorded, in order", async () => {
    const a = await createArticle(app, input, actor);
    assert.ok(a.ok);
    const saved = await saveArticle(app, a.id, a.version, input, actor, "manual"); // no status change
    assert.ok(saved.ok);
    const pub = await publishArticle(app, a.id, saved.version, input, null, actor);
    assert.ok(pub.ok);
    const archived = await changeArticleState(app, a.id, pub.version, "archive", actor);
    assert.ok(archived.ok);
    const history = await app.articleStatusChange.findMany({ where: { articleId: a.id }, orderBy: { id: "asc" } });
    assert.deepEqual(
      history.map((h) => `${h.fromStatus ?? "∅"}→${h.toStatus}`),
      ["∅→DRAFT", "DRAFT→PUBLISHED", "PUBLISHED→ARCHIVED"],
    );
  });

  test("old slugs of a published article are kept; a slug that becomes live again stops redirecting", async () => {
    const a = await createArticle(app, { ...input, slug: "slug-satu" }, actor);
    assert.ok(a.ok);
    const pub = await publishArticle(app, a.id, a.version, { ...input, slug: "slug-satu" }, null, actor);
    assert.ok(pub.ok);
    const two = await saveArticle(app, a.id, pub.version, { ...input, slug: "slug-dua" }, actor, "manual");
    assert.ok(two.ok);
    const three = await saveArticle(app, a.id, two.version, { ...input, slug: "slug-tiga" }, actor, "manual");
    assert.ok(three.ok);
    let history = await app.articleSlugHistory.findMany({ orderBy: { slug: "asc" } });
    assert.deepEqual(
      history.map((h) => [h.slug, h.articleId]),
      [
        ["slug-dua", a.id],
        ["slug-satu", a.id],
      ],
    );
    const back = await saveArticle(app, a.id, three.version, { ...input, slug: "slug-satu" }, actor, "manual");
    assert.ok(back.ok);
    history = await app.articleSlugHistory.findMany({ orderBy: { slug: "asc" } });
    assert.deepEqual(
      history.map((h) => h.slug),
      ["slug-dua", "slug-tiga"],
    );
  });

  test("a new article taking an old slug wins over the redirect", async () => {
    const a = await createArticle(app, { ...input, slug: "lama" }, actor);
    assert.ok(a.ok);
    const pub = await publishArticle(app, a.id, a.version, { ...input, slug: "lama" }, null, actor);
    assert.ok(pub.ok);
    const renamed = await saveArticle(app, a.id, pub.version, { ...input, slug: "baru" }, actor, "manual");
    assert.ok(renamed.ok);
    assert.equal(await app.articleSlugHistory.count({ where: { slug: "lama" } }), 1);
    // The service refuses an old slug of another article, so take it the way the
    // database rule is defined: a new article with that slug clears the redirect.
    const { recordArticleCreated } = await import("@/server/articles/history");
    await app.$transaction(async (tx) => {
      const b = await tx.article.create({ data: { slug: "lama", title: "Artikel lain", authorId: ctx.authorId } });
      await recordArticleCreated(tx, b);
    });
    assert.equal(await app.articleSlugHistory.count({ where: { slug: "lama" } }), 0);
  });
});

describe("deleting an article", () => {
  test("cascades to its history, media usage and homepage slot; hero setting is cleared", async () => {
    const gallery = await makeMedia(app, "galeri-1");
    const a = await draft({ kanalId: ctx.kanalId, heroMediaId: ctx.heroId, status: "PUBLISHED", publishedAt: new Date() });
    await app.articleSlugHistory.create({ data: { slug: "garam-kalianget-lama", articleId: a.id } });
    await app.articleStatusChange.create({ data: { articleId: a.id, fromStatus: null, toStatus: "PUBLISHED" } });
    await app.articleMedia.create({ data: { articleId: a.id, mediaId: gallery.id, usage: "GALLERY", position: 0 } });
    await app.articleRevision.create({ data: { articleId: a.id, version: 1, reason: "PUBLISH", snapshot: { title: a.title } } });
    await app.homepageFeatured.create({ data: { articleId: a.id, position: 0 } });
    await app.homepageSettings.update({ where: { id: 1 }, data: { heroArticleId: a.id } });

    await rejects(app.media.delete({ where: { id: gallery.id } }), DBERR.foreignKey);
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
  test("singletons cannot gain a second row, nor be deleted", async () => {
    await rejects(owner.homepageSettings.create({ data: { id: 2 } }), DBERR.check, /homepage_settings_singleton/);
    await rejects(owner.siteSettings.create({ data: { id: 2 } }), DBERR.check, /site_settings_singleton/);
    await rejects(app.siteSettings.create({ data: { id: 2 } }), LAYERS.separateUser ? DBERR.privilege : DBERR.check);
    await rejects(app.homepageSettings.update({ where: { id: 1 }, data: { latestCount: 0 } }), /homepage_settings_latest_count_range/);
    await rejects(app.siteSettings.delete({ where: { id: 1 } }), DBERR.guard, /singleton/);
    await rejects(owner.homepageSettings.deleteMany({}), DBERR.guard, /singleton/);
    if (LAYERS.triggers) await rejects(rawSql("owner", "DELETE FROM site_settings"), DBERR.signal, /singleton/);
    assert.equal(await owner.siteSettings.count(), 1);
  });

  test("Tulisan Pilihan: unique positions 0–11", async () => {
    const a = await draft({ slug: "a" });
    const b = await draft({ slug: "b" });
    await app.homepageFeatured.create({ data: { articleId: a.id, position: 0 } });
    await rejects(app.homepageFeatured.create({ data: { articleId: b.id, position: 0 } }), DBERR.unique);
    await rejects(app.homepageFeatured.create({ data: { articleId: b.id, position: 12 } }), /homepage_featured_position_range/);
  });

  test("media metadata is checked", async () => {
    const base = { storageKey: "m/x.webp", originalName: "x.jpg", mimeType: "image/webp", sizeBytes: 10, sha256: sha256("x") };
    await rejects(app.media.create({ data: { ...base, sha256: "ABC" } }), /media_sha256_hex/);
    await rejects(app.media.create({ data: { ...base, sha256: sha256("x").toUpperCase() } }), /media_sha256_hex/);
    await rejects(app.media.create({ data: { ...base, sizeBytes: 0 } }), /media_size_positive/);
    await rejects(app.media.create({ data: { ...base, width: 0 } }), /media_dimensions_positive/);
    await app.media.create({ data: base });
    // the same file twice (same sha256) is refused
    await rejects(app.media.create({ data: { ...base, storageKey: "m/y.webp" } }), DBERR.unique, /sha256/);
  });
});
