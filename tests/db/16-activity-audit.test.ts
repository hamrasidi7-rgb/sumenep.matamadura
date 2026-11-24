import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { articleStatusHistory, listActivityLogPage } from "@/server/activity/queries";
import { logActivity } from "@/server/activity-log";

import { connect, resetData } from "../helpers/db";
import { insertAdmin, insertSession, makeAuthor, makeMedia } from "../helpers/fixtures";

const { owner, app, close } = connect();

before(async () => {
  await resetData(owner);
  await insertAdmin(owner);
});

after(async () => {
  await close();
});

describe("activity log queries & article status history (Fase 7 DB)", () => {
  test("filters activity logs by actor/category/search, counts 7d logins & active sessions, and fetches status transitions", async () => {
    const now = new Date();
    await insertSession(owner, { token: "tok-aktivitas-1" });

    await logActivity(owner, {
      actor: "ADMIN",
      adminId: 1,
      action: "article.publish",
      entityType: "article",
      entityId: "11111111-1111-4111-8111-111111111111",
      summary: "Menerbitkan artikel Garam",
      ip: "127.0.0.1",
    });
    await logActivity(owner, {
      actor: "CLI",
      action: "admin.recover.password_reset",
      entityType: "admin_user",
      entityId: "1",
      summary: "Reset password melalui CLI",
    });

    await owner.loginAttempt.createMany({
      data: [
        { email: "admin@sumenep.test", ip: "127.0.0.1", success: true, reason: "ok" },
        { email: "penyusup@example.com", ip: "198.51.100.7", success: false, reason: "bad_credentials" },
      ],
    });

    const author = await makeAuthor(owner, "redaksi-uji");
    const kanal = await owner.section.create({ data: { kind: "KANAL", slug: "ekonomi", name: "Ekonomi" } });
    const hero = await makeMedia(owner, "hero-aktivitas");
    const article = await owner.article.create({
      data: {
        slug: "uji-riwayat-status",
        title: "Uji Riwayat Status",
        standfirst: "Ringkasan artikel uji riwayat status.",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: hero.id,
        status: "PUBLISHED",
        publishedAt: now,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi." }] }] },
      },
    });
    await owner.articleStatusChange.createMany({
      data: [
        { articleId: article.id, fromStatus: null, toStatus: "DRAFT", changedAt: new Date(now.getTime() - 60_000) },
        { articleId: article.id, fromStatus: "DRAFT", toStatus: "PUBLISHED", changedAt: now },
      ],
    });

    const allData = await listActivityLogPage(
      app,
      { q: "", actor: "semua", kategori: "semua", dari: "", sampai: "", page: 1 },
      now,
    );
    assert.equal(allData.stats.activeSessions, 1);
    assert.equal(allData.stats.failedLoginsLast7Days, 1);
    assert.equal(allData.stats.activityLast7Days >= 2, true);
    assert.equal(allData.loginAttempts.length, 2);

    const cliAuth = await listActivityLogPage(
      app,
      { q: "", actor: "CLI", kategori: "auth", dari: "", sampai: "", page: 1 },
      now,
    );
    assert.equal(cliAuth.logs.length, 1);
    assert.equal(cliAuth.logs[0]?.action, "admin.recover.password_reset");

    const history = await articleStatusHistory(app, article.id);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.toStatus, "PUBLISHED");
    assert.equal(history[1]?.toStatus, "DRAFT");
  });
});
