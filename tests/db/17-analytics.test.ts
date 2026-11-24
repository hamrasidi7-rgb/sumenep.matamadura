import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { getEditorialAnalytics } from "@/server/analytics/editorial";

import { connect, resetData } from "../helpers/db";
import { insertAdmin, makeAuthor, makeMedia } from "../helpers/fixtures";

const { owner, app, close } = connect();

before(async () => {
  await resetData(owner);
  await insertAdmin(owner);
});

after(async () => {
  await close();
});

describe("editorial analytics DB queries (Fase 8)", () => {
  test("counts non-overlapping states, 28d comparisons, SEO readiness, and breakdowns", async () => {
    const now = new Date("2026-11-25T10:00:00Z");
    const author = await makeAuthor(owner, "editor-statistik");
    const kanal = await owner.section.create({ data: { kind: "KANAL", slug: "bahari", name: "Bahari" } });
    const rubrik = await owner.section.create({ data: { kind: "RUBRIK", slug: "tajuk", name: "Tajuk" } });
    const hero = await makeMedia(owner, "hero-stat");
    const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi." }] }] };

    // 1 terbit hari ini (tanpa seoDescription & ogMedia), 1 terbit 35 hari lalu, 1 terjadwal, 1 draf, 1 arsip
    await owner.article.create({
      data: {
        slug: "stat-terbit-kini",
        title: "Stat Terbit Kini",
        standfirst: "Ringkasan berita baru.",
        kanalId: kanal.id,
        rubrikId: rubrik.id,
        authorId: author.id,
        heroMediaId: hero.id,
        status: "PUBLISHED",
        template: "FEATURE",
        publishedAt: new Date(now.getTime() - 3600_000),
        body,
      },
    });
    await owner.article.create({
      data: {
        slug: "stat-terbit-lalu",
        title: "Stat Terbit Lalu",
        standfirst: "Ringkasan berita lama.",
        seoDescription: "Sudah diisi lengkap.",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: hero.id,
        status: "PUBLISHED",
        template: "STANDARD",
        publishedAt: new Date(now.getTime() - 35 * 86_400_000),
        body,
      },
    });
    await owner.article.create({
      data: {
        slug: "stat-terjadwal",
        title: "Stat Terjadwal",
        standfirst: "Jadwal depan.",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: hero.id,
        status: "PUBLISHED",
        publishedAt: new Date(now.getTime() + 86_400_000),
        body,
      },
    });
    await owner.article.create({
      data: {
        slug: "stat-draf",
        title: "Stat Draf",
        kanalId: kanal.id,
        authorId: author.id,
        status: "DRAFT",
        body,
      },
    });
    await owner.article.create({
      data: {
        slug: "stat-arsip",
        title: "Stat Arsip",
        kanalId: kanal.id,
        authorId: author.id,
        status: "ARCHIVED",
        archivedAt: now,
        body,
      },
    });

    const data = await getEditorialAnalytics(app, now);
    assert.equal(data.totals.publishedTotal, 2);
    assert.equal(data.totals.publishedLast28Days, 1);
    assert.equal(data.totals.publishedPrev28Days, 1);
    assert.equal(data.totals.scheduled, 1);
    assert.equal(data.totals.drafts, 1);
    assert.equal(data.totals.archived, 1);
    assert.equal(data.dailySeries.length, 28);
    assert.equal(data.seoReadiness.missingSeoDescription, 1);
    assert.equal(data.seoReadiness.missingCustomOgMedia, 2);
    assert.equal(data.upcomingScheduled.length, 1);
    assert.equal(data.kanalBreakdown[0]?.count, 2);
    assert.equal(data.rubrikBreakdown[0]?.count, 1);
    assert.equal(data.authorBreakdown[0]?.count, 2);
  });
});
