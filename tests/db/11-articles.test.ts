import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import type { DocNode } from "@/lib/article-doc";
import type { ArticleFieldsInput } from "@/server/articles/fields";
import { listArticles } from "@/server/articles/queries";
import { changeArticleState, createArticle, deleteArticlePermanently, publishArticle, revisionList, saveArticle } from "@/server/articles/service";
import { publicArticleView, publicRedirectTarget } from "@/server/articles/view";
import { seedInitialData } from "@/server/seed";

import { connect, DBERR, rejects, resetData } from "../helpers/db";
import { findSection, insertAdmin, makeMedia } from "../helpers/fixtures";

// Article CMS rules, run with the RUNTIME role (what the CMS uses).

const { owner, app, close } = connect();
after(close);

const actor = { adminId: 1, ip: "203.0.113.9", userAgent: "uji" };
let base: ArticleFieldsInput;
let heroId: string;
let kanal: string;
let rubrik: string;

const body = (...texts: string[]): DocNode => ({ type: "doc", content: texts.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) });

beforeEach(async () => {
  await resetData(owner);
  await insertAdmin(owner);
  await seedInitialData(owner);
  const [author, hero, k, r] = await Promise.all([
    app.author.findUniqueOrThrow({ where: { slug: "redaksi" } }),
    makeMedia(app, "foto-utama"),
    findSection(app, "KANAL", "ekonomi"),
    findSection(app, "RUBRIK", "catatan-sumenep"),
  ]);
  heroId = hero.id;
  kanal = k.id;
  rubrik = r.id;
  base = { title: "Garam Kalianget di Musim Kemarau", standfirst: "Petani garam menunggu panas.", authorId: author.id, kanalId: kanal, body: body("Paragraf pertama.") };
});

async function created(input: Partial<ArticleFieldsInput> = {}) {
  const result = await createArticle(app, { ...base, ...input }, actor);
  assert.ok(result.ok, !result.ok ? result.error : "");
  return result;
}

const ready = (extra: Partial<ArticleFieldsInput> = {}): ArticleFieldsInput => ({ ...base, heroMediaId: heroId, ...extra });

describe("create and save", () => {
  test("create: slug from the title, unique with -2, logged", async () => {
    const first = await created();
    assert.equal(first.slug, "garam-kalianget-di-musim-kemarau");
    assert.equal(first.version, 1);
    const second = await created();
    assert.equal(second.slug, "garam-kalianget-di-musim-kemarau-2");
    assert.equal(await owner.activityLog.count({ where: { action: "article.create" } }), 2);
    const row = await owner.article.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(row.status, "DRAFT");
    assert.equal(row.bodyText, "Paragraf pertama.");
  });

  test("explicit slugs must be valid and free (also of other articles' old slugs)", async () => {
    const a = await created();
    const bad = await createArticle(app, { ...base, slug: "Judul Bebas!!" }, actor);
    assert.ok(bad.ok, "slugify makes it valid");
    assert.equal(bad.slug, "judul-bebas");
    const taken = await createArticle(app, { ...base, slug: a.slug }, actor);
    assert.ok(!taken.ok && taken.fields?.slug);
    // a published article renamed → its old slug still belongs to it
    const pub = await publishArticle(app, a.id, a.version, ready(), null, actor);
    assert.ok(pub.ok);
    const renamed = await saveArticle(app, a.id, pub.version, ready({ slug: "garam-baru" }), actor, "manual");
    assert.ok(renamed.ok);
    const hijack = await createArticle(app, { ...base, slug: a.slug }, actor);
    assert.ok(!hijack.ok, "an old URL that still redirects is not up for grabs");
  });

  test("autosave increments the version; a stale version is a conflict and overwrites nothing", async () => {
    const a = await created();
    const s1 = await saveArticle(app, a.id, a.version, { ...base, title: "Judul dari tab A" }, actor, "autosave");
    assert.ok(s1.ok && s1.version === 2);
    const stale = await saveArticle(app, a.id, a.version, { ...base, title: "Judul dari tab B" }, actor, "autosave");
    assert.ok(!stale.ok);
    assert.deepEqual(Object.keys(stale.conflict ?? {}).sort(), ["updatedAt", "version"]);
    assert.equal(stale.conflict?.version, 2);
    const row = await owner.article.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(row.title, "Judul dari tab A");
    assert.equal(row.version, 2);
  });

  test("autosave never touches a live article; manual save does and keeps a revision", async () => {
    const a = await created();
    const pub = await publishArticle(app, a.id, a.version, ready(), null, actor);
    assert.ok(pub.ok);
    const auto = await saveArticle(app, a.id, pub.version, ready({ title: "Setengah jadi" }), actor, "autosave");
    assert.ok(!auto.ok && auto.live);
    assert.equal((await owner.article.findUniqueOrThrow({ where: { id: a.id } })).title, base.title);
    const manual = await saveArticle(app, a.id, pub.version, ready({ title: "Judul diperbarui" }), actor, "manual");
    assert.ok(manual.ok && manual.state === "terbit");
    assert.deepEqual((await revisionList(app, a.id)).map((r) => r.reason), ["MANUAL_SAVE", "PUBLISH"]);
    assert.equal(await owner.activityLog.count({ where: { action: "article.update" } }), 1);
  });

  test("the body is sanitised on the server before it is stored", async () => {
    const a = await created({
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "klik", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
          { type: "script", content: [{ type: "text", text: "alert(1)" }] },
          { type: "iframe", attrs: { src: "https://evil.example" } },
        ],
      } as DocNode,
    });
    const stored = JSON.stringify((await owner.article.findUniqueOrThrow({ where: { id: a.id } })).body);
    assert.doesNotMatch(stored, /javascript|script|iframe|evil/);
    assert.match(stored, /klik/);
  });

  test("media must exist; body and gallery media are tracked so they cannot be deleted", async () => {
    const missing = await createArticle(app, { ...base, heroMediaId: "44444444-4444-4444-8444-444444444444" }, actor);
    assert.ok(!missing.ok);
    const gallery = await makeMedia(app, "galeri");
    const a = await created({
      body: { type: "doc", content: [{ type: "articleImage", attrs: { mediaId: heroId, alt: "x" } }, { type: "articleGallery", attrs: { items: [{ mediaId: gallery.id }] } }] } as DocNode,
    });
    const usage = await owner.articleMedia.findMany({ where: { articleId: a.id }, orderBy: { usage: "asc" } });
    assert.deepEqual(usage.map((u) => [u.usage, u.mediaId]), [["BODY", heroId], ["GALLERY", gallery.id]]);
    await rejects(app.media.delete({ where: { id: gallery.id } }), DBERR.foreignKey);
  });

  test("SEO fields are validated and stored", async () => {
    const bad = await createArticle(app, { ...base, canonicalUrl: "http://contoh.id/x" }, actor);
    assert.ok(!bad.ok && bad.fields?.canonicalUrl);
    const a = await created({ seoTitle: "Garam", seoDescription: "Deskripsi", canonicalUrl: "https://contoh.id/x", ogMediaId: heroId });
    const row = await owner.article.findUniqueOrThrow({ where: { id: a.id } });
    assert.deepEqual([row.seoTitle, row.seoDescription, row.canonicalUrl, row.ogMediaId], ["Garam", "Deskripsi", "https://contoh.id/x", heroId]);
  });
});

describe("publication", () => {
  test("publish needs a lead, a hero image, a kanal or rubrik and some content", async () => {
    const a = await created({ standfirst: "", kanalId: null });
    const missing = await publishArticle(app, a.id, a.version, { ...base, standfirst: "", kanalId: null, body: body() }, null, actor);
    assert.ok(!missing.ok);
    assert.deepEqual(Object.keys(missing.fields ?? {}).sort(), ["body", "heroMediaId", "kanalId", "standfirst"]);
    const ok = await publishArticle(app, a.id, a.version, ready({ kanalId: null, rubrikId: rubrik }), null, actor);
    assert.ok(ok.ok && ok.state === "terbit");
    const history = await owner.articleStatusChange.findMany({ where: { articleId: a.id }, orderBy: { id: "asc" } });
    assert.deepEqual(history.map((h) => h.toStatus), ["DRAFT", "PUBLISHED"]);
  });

  test("visible to the public only when published, time reached, not archived, not in the trash", async () => {
    const a = await created();
    const slug = a.slug;
    assert.equal(await publicArticleView(app, slug), null, "draft hidden");

    const future = new Date(Date.now() + 3600_000);
    const scheduled = await publishArticle(app, a.id, a.version, ready(), future, actor);
    assert.ok(scheduled.ok && scheduled.state === "terjadwal");
    assert.equal(await publicArticleView(app, slug), null, "scheduled hidden");
    assert.ok(await publicArticleView(app, slug, new Date(future.getTime() + 1000)), "visible once the time has come");
    assert.equal(await owner.activityLog.count({ where: { action: "article.schedule" } }), 1);

    const now = await publishArticle(app, a.id, scheduled.version, ready(), null, actor);
    assert.ok(now.ok && now.state === "terbit");
    const view = await publicArticleView(app, slug);
    assert.ok(view);
    assert.equal(view.title, base.title);
    assert.equal(view.section?.slug, "ekonomi");
    assert.equal(view.author.name, "Redaksi SUMENEP");
    assert.match(view.hero.src, /^\/media\/.*foto-utama\.webp$/);
    assert.deepEqual(view.body, [{ type: "paragraph", content: [{ text: "Paragraf pertama." }] }]);

    const archived = await changeArticleState(app, a.id, now.version, "archive", actor);
    assert.ok(archived.ok && archived.state === "arsip");
    assert.equal(await publicArticleView(app, slug), null, "archived hidden");
    const back = await changeArticleState(app, a.id, archived.version, "unarchive", actor);
    assert.ok(back.ok && back.state === "draf");

    const republished = await publishArticle(app, a.id, back.version, ready(), null, actor);
    assert.ok(republished.ok);
    const trashed = await changeArticleState(app, a.id, republished.version, "trash", actor);
    assert.ok(trashed.ok && trashed.state === "sampah");
    assert.equal(await publicArticleView(app, slug), null, "trash hidden");
    const edit = await saveArticle(app, a.id, trashed.version, ready(), actor, "manual");
    assert.ok(!edit.ok, "no editing in the trash");
    const restored = await changeArticleState(app, a.id, trashed.version, "restore", actor);
    assert.ok(restored.ok && restored.state === "terbit");
    assert.ok(await publicArticleView(app, slug), "restored as it was");
  });

  test("unpublish returns a live article to draft", async () => {
    const a = await created();
    const pub = await publishArticle(app, a.id, a.version, ready(), null, actor);
    assert.ok(pub.ok);
    const draft = await changeArticleState(app, a.id, pub.version, "unpublish", actor);
    assert.ok(draft.ok && draft.state === "draf");
    assert.equal(await publicArticleView(app, a.slug), null);
  });

  test("renaming a published article keeps the old URL as a redirect; draft renames leave no history", async () => {
    const a = await created();
    const s1 = await saveArticle(app, a.id, a.version, { ...base, slug: "draf-sementara" }, actor, "autosave");
    assert.ok(s1.ok);
    assert.equal(await owner.articleSlugHistory.count(), 0, "a never-published slug is not a URL anyone knows");
    const pub = await publishArticle(app, a.id, s1.version, ready({ slug: "garam-kalianget" }), null, actor);
    assert.ok(pub.ok);
    const renamed = await saveArticle(app, a.id, pub.version, ready({ slug: "garam-kalianget-2026" }), actor, "manual");
    assert.ok(renamed.ok && renamed.slug === "garam-kalianget-2026");
    assert.equal(await publicRedirectTarget(app, "garam-kalianget"), "garam-kalianget-2026");
    assert.equal(await publicRedirectTarget(app, "tidak-ada"), null);
  });

  test("permanent delete only from the trash, with revisions and history", async () => {
    const a = await created();
    const notYet = await deleteArticlePermanently(app, a.id, actor);
    assert.ok(!notYet.ok);
    const pub = await publishArticle(app, a.id, a.version, ready(), null, actor);
    assert.ok(pub.ok);
    const trashed = await changeArticleState(app, a.id, pub.version, "trash", actor);
    assert.ok(trashed.ok);
    const gone = await deleteArticlePermanently(app, a.id, actor);
    assert.ok(gone.ok);
    assert.equal(await owner.article.count({ where: { id: a.id } }), 0);
    assert.equal(await owner.articleRevision.count({ where: { articleId: a.id } }), 0);
    assert.equal(await owner.activityLog.count({ where: { action: "article.delete" } }), 1, "the audit trail keeps the deletion");
  });
});

describe("list, search and filters", () => {
  test("by text, state, kanal, rubrik and date", async () => {
    const a = await created({ title: "Nelayan Masalembu" });
    await created({ title: "Sekolah di Pulau", kanalId: (await findSection(app, "KANAL", "pendidikan")).id, rubrikId: rubrik });
    const c = await created({ title: "Arsip Lama" });
    const pub = await publishArticle(app, a.id, a.version, ready({ title: "Nelayan Masalembu" }), new Date("2026-01-15T03:00:00Z"), actor);
    assert.ok(pub.ok);
    const arch = await changeArticleState(app, c.id, c.version, "archive", actor);
    assert.ok(arch.ok);

    const titles = async (f: Parameters<typeof listArticles>[1]) => (await listArticles(app, f)).items.map((i) => i.title).sort();
    assert.deepEqual(await titles({ q: "masalembu" }), ["Nelayan Masalembu"]);
    assert.deepEqual(await titles({ state: "terbit" }), ["Nelayan Masalembu"]);
    assert.deepEqual(await titles({ state: "draf" }), ["Sekolah di Pulau"]);
    assert.deepEqual(await titles({ state: "arsip" }), ["Arsip Lama"]);
    assert.deepEqual(await titles({ kanal: "pendidikan" }), ["Sekolah di Pulau"]);
    assert.deepEqual(await titles({ rubrik: "catatan-sumenep" }), ["Sekolah di Pulau"]);
    assert.deepEqual(await titles({ from: "2026-01-15", to: "2026-01-15" }), ["Nelayan Masalembu"]);
    const { counts } = await listArticles(app, {});
    assert.deepEqual(counts, { draf: 1, terjadwal: 0, terbit: 1, arsip: 1, sampah: 0 });
  });
});
