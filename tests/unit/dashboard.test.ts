import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ArticleStatus } from "@prisma/client";

import { activityLabel, describeDevice, formatBytes, formatWib } from "@/components/admin/format";
import { articleState, STATE_FILTERS, stateFilter } from "@/server/articles/status";
import { computeDashboardCounts, type RawStatusGroup } from "@/server/dashboard/queries";

describe("admin display helpers (format.ts)", () => {
  test("formatBytes handles empty, byte, KB, MB and GB values safely", () => {
    assert.equal(formatBytes(null), "0 B");
    assert.equal(formatBytes(undefined), "0 B");
    assert.equal(formatBytes(-50), "0 B");
    assert.equal(formatBytes(Number.NaN), "0 B");
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1024), "1 KB");
    assert.equal(formatBytes(250 * 1024), "250 KB");
    assert.equal(formatBytes(1024 * 1024), "1 MB");
    assert.equal(formatBytes(2.5 * 1024 * 1024), "2,5 MB");
    assert.equal(formatBytes(2 * 1024 * 1024 * 1024), "2 GB");
  });

  test("formatWib, describeDevice and activityLabel handle edge cases", () => {
    assert.equal(formatWib(null), "–");
    assert.match(formatWib(new Date("2026-11-24T03:15:00Z")), /WIB$/);
    assert.equal(describeDevice(null), "Perangkat tidak dikenal");
    assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0"), "Chrome · Windows");
    assert.equal(activityLabel("article.publish"), "Artikel diterbitkan");
    assert.equal(activityLabel("custom.unknown"), "custom.unknown");
  });
});

describe("dashboard counts & filter links", () => {
  test("empty database produces zero counts instead of nulls or NaNs", () => {
    const empty = computeDashboardCounts({
      statusGroups: [],
      scheduledCount: 0,
      trashedCount: 0,
      sectionGroups: [],
      authorGroups: [],
      mediaAggregate: { _count: { _all: 0 }, _sum: { sizeBytes: null } },
    });

    assert.deepEqual(empty.articles, {
      draf: 0,
      terjadwal: 0,
      terbit: 0,
      arsip: 0,
      sampah: 0,
      semua: 0,
      totalBaris: 0,
    });
    assert.deepEqual(empty.sections, { kanalActive: 0, kanalTotal: 0, rubrikActive: 0, rubrikTotal: 0 });
    assert.deepEqual(empty.authors, { active: 0, total: 0 });
    assert.deepEqual(empty.media, { count: 0, totalBytes: 0 });
  });

  test("terbit, terjadwal, draf, arsip and sampah partition articles with zero overlap", () => {
    const now = new Date("2026-11-25T00:00:00Z");
    const past = new Date("2026-11-20T10:00:00Z");
    const future = new Date("2026-11-26T10:00:00Z");

    // Representative sample covering every combination of status, publishedAt and deletedAt.
    const rows: Array<{ status: ArticleStatus; publishedAt: Date | null; deletedAt: Date | null }> = [
      { status: "DRAFT", publishedAt: null, deletedAt: null },
      { status: "DRAFT", publishedAt: null, deletedAt: null },
      { status: "PUBLISHED", publishedAt: past, deletedAt: null },
      { status: "PUBLISHED", publishedAt: now, deletedAt: null }, // publishedAt <= now → terbit
      { status: "PUBLISHED", publishedAt: future, deletedAt: null }, // publishedAt > now → terjadwal
      { status: "ARCHIVED", publishedAt: past, deletedAt: null },
      { status: "DRAFT", publishedAt: null, deletedAt: past }, // trashed draft → sampah only
      { status: "PUBLISHED", publishedAt: past, deletedAt: past }, // trashed published → sampah only
      { status: "PUBLISHED", publishedAt: future, deletedAt: past }, // trashed scheduled → sampah only
    ];

    // Ground truth classified row-by-row via articleState() from src/server/articles/status.ts.
    const expected = { draf: 0, terjadwal: 0, terbit: 0, arsip: 0, sampah: 0 };
    for (const r of rows) expected[articleState(r, now)]++;

    // Simulate the exact SQL groupBy/count inputs getDashboardOverview() receives.
    const nonDeleted = rows.filter((r) => r.deletedAt === null);
    const byStatus = new Map<ArticleStatus, number>();
    for (const r of nonDeleted) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    const statusGroups: RawStatusGroup[] = [...byStatus].map(([status, count]) => ({ status, _count: { _all: count } }));
    const scheduledCount = nonDeleted.filter((r) => r.status === "PUBLISHED" && r.publishedAt && r.publishedAt > now).length;
    const trashedCount = rows.filter((r) => r.deletedAt !== null).length;

    const result = computeDashboardCounts({
      statusGroups,
      scheduledCount,
      trashedCount,
      sectionGroups: [
        { kind: "KANAL", isActive: true, _count: { _all: 4 } },
        { kind: "KANAL", isActive: false, _count: { _all: 1 } },
        { kind: "RUBRIK", isActive: true, _count: { _all: 2 } },
      ],
      authorGroups: [
        { isActive: true, _count: { _all: 3 } },
        { isActive: false, _count: { _all: 1 } },
      ],
      mediaAggregate: { _count: { _all: 12 }, _sum: { sizeBytes: 3_145_728 } },
    });

    assert.equal(result.articles.draf, expected.draf);
    assert.equal(result.articles.terjadwal, expected.terjadwal);
    assert.equal(result.articles.terbit, expected.terbit);
    assert.equal(result.articles.arsip, expected.arsip);
    assert.equal(result.articles.sampah, expected.sampah);
    assert.equal(result.articles.semua, nonDeleted.length);
    assert.equal(result.articles.totalBaris, rows.length);
    assert.deepEqual(result.sections, { kanalActive: 4, kanalTotal: 5, rubrikActive: 2, rubrikTotal: 2 });
    assert.deepEqual(result.authors, { active: 3, total: 4 });
    assert.deepEqual(result.media, { count: 12, totalBytes: 3_145_728 });
  });

  test("every status filter parameter linked from the dashboard is supported by /admin/artikel", () => {
    const dashboardStatuses = ["terbit", "draf", "terjadwal", "arsip", "sampah"] as const;
    const supported = new Set(STATE_FILTERS.map((f) => f.value));
    for (const status of dashboardStatuses) {
      assert.equal(supported.has(status), true, `status=${status} must be in STATE_FILTERS`);
      assert.equal(stateFilter(status), status, `stateFilter("${status}") must not fall back to semua`);
    }
  });
});
