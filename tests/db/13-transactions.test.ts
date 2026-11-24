import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { logActivity } from "@/server/activity-log";
import type { DocNode } from "@/lib/article-doc";
import type { ArticleFieldsInput } from "@/server/articles/fields";
import { recordArticleCreated } from "@/server/articles/history";
import { createArticle, publishArticle, saveArticle } from "@/server/articles/service";
import { registerWrongPassword } from "@/server/auth/attempts";
import { seedInitialData } from "@/server/seed";

import { connect, resetData } from "../helpers/db";
import { findSection, insertAdmin, makeMedia } from "../helpers/fixtures";

// Transactions and concurrency on MariaDB/InnoDB: what PostgreSQL guaranteed
// must still hold — all-or-nothing writes, row locks, optimistic locking.

const { owner, app, close } = connect();
after(close);

const actor = { adminId: 1, ip: null, userAgent: null };
const body = (text: string): DocNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
let input: ArticleFieldsInput;

beforeEach(async () => {
  await resetData(owner);
  await insertAdmin(owner);
  await seedInitialData(owner);
  const [author, hero, kanal] = await Promise.all([
    app.author.findUniqueOrThrow({ where: { slug: "redaksi" } }),
    makeMedia(app, "foto-transaksi"),
    findSection(app, "KANAL", "ekonomi"),
  ]);
  input = { title: "Uji Transaksi", standfirst: "Lead.", authorId: author.id, kanalId: kanal.id, heroMediaId: hero.id, body: body("Isi.") };
});

const counts = async () => ({
  articles: await owner.article.count(),
  statuses: await owner.articleStatusChange.count(),
  slugs: await owner.articleSlugHistory.count(),
  log: await owner.activityLog.count(),
});

describe("all or nothing", () => {
  test("a failure inside a transaction leaves no article, history or audit entry behind", async () => {
    const before = await counts();
    await assert.rejects(
      app.$transaction(async (tx) => {
        const article = await tx.article.create({ data: { slug: "batal", title: "Batal", authorId: input.authorId } });
        await recordArticleCreated(tx, article);
        await logActivity(tx, { actor: "ADMIN", adminId: 1, action: "article.create", entityType: "article", entityId: article.id });
        throw new Error("gagal di tengah jalan");
      }),
      /gagal di tengah jalan/,
    );
    assert.deepEqual(await counts(), before);
  });

  test("a database error in the middle rolls back what came before", async () => {
    const before = await counts();
    await assert.rejects(
      app.$transaction(async (tx) => {
        const article = await tx.article.create({ data: { slug: "setengah", title: "Setengah", authorId: input.authorId } });
        await recordArticleCreated(tx, article);
        await tx.article.create({ data: { slug: "Slug Tidak Valid", title: "X", authorId: input.authorId } }); // CHECK fails
      }),
      /article_slug_format/,
    );
    assert.deepEqual(await counts(), before);
  });
});

describe("concurrency", () => {
  test("every connection runs without InnoDB snapshot isolation (MariaDB 11.6.2+ turns it on by default)", async () => {
    for (const db of [app, owner]) {
      const rows = await db.$queryRaw<Array<{ value: string }>>`
        SELECT VARIABLE_VALUE AS value FROM information_schema.SESSION_VARIABLES WHERE VARIABLE_NAME = 'INNODB_SNAPSHOT_ISOLATION'`;
      // Older servers do not have the variable at all; where it exists it must be OFF for this session.
      if (rows.length) assert.equal(rows[0].value, "OFF");
    }
  });

  test("two saves from the same version: exactly one wins, the other is a conflict; history stays consistent", async () => {
    const a = await createArticle(app, input, actor);
    assert.ok(a.ok);
    const pub = await publishArticle(app, a.id, a.version, input, null, actor);
    assert.ok(pub.ok);
    const results = await Promise.all([
      saveArticle(app, a.id, pub.version, { ...input, slug: "versi-satu" }, actor, "manual"),
      saveArticle(app, a.id, pub.version, { ...input, slug: "versi-dua" }, actor, "manual"),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
    const loser = results.find((r) => !r.ok);
    assert.ok(loser && !loser.ok && loser.conflict, "the other save reports a conflict");
    const article = await owner.article.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(article.version, pub.version + 1, "version moved exactly once");
    const history = await owner.articleSlugHistory.findMany({ where: { articleId: a.id } });
    assert.deepEqual(
      history.map((h) => h.slug),
      [a.slug],
      "only the winning rename left a redirect",
    );
  });

  test("parallel wrong passwords are counted one by one (row lock): the 5th locks the account", async () => {
    await Promise.all(Array.from({ length: 5 }, () => registerWrongPassword(app, { ip: "203.0.113.50" })));
    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(admin.failedLoginCount, 5);
    assert.ok(admin.lockedUntil && admin.lockedUntil > new Date(), "locked");
    assert.equal(await owner.activityLog.count({ where: { action: "auth.lockout" } }), 1, "one lockout, logged once");
  });
});
