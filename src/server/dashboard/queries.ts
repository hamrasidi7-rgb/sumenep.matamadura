import type { ArticleStatus, PrismaClient, SectionKind } from "@prisma/client";

import { articleState, stateWhere, type ArticleState } from "@/server/articles/status";

// Query terpusat untuk Dashboard CMS (/admin).
//
// Dioptimalkan khusus untuk MariaDB Hostinger (connectionLimit = 5 di
// src/server/db/client.ts):
//   - Menggabungkan hitungan status artikel (DRAFT/ARCHIVED/PUBLISHED) dan
//     hitungan kanal/rubrik/penulis memakai GROUP BY berindeks.
//   - Menjalankan query dalam gelombang kecil (maks. 4 query paralel per batch)
//     sehingga tidak pernah membanjiri pool 5 koneksi.
//   - Melewati query daftar artikel terjadwal bila jumlah terjadwal = 0.

export interface DashboardArticleCounts extends Record<ArticleState, number> {
  /** Seluruh artikel di luar tempat sampah (terbit + terjadwal + draf + arsip). */
  semua: number;
  /** Seluruh baris di tabel article termasuk tempat sampah. */
  totalBaris: number;
}

export interface DashboardSectionCounts {
  kanalActive: number;
  kanalTotal: number;
  rubrikActive: number;
  rubrikTotal: number;
}

export interface DashboardAuthorCounts {
  active: number;
  total: number;
}

export interface DashboardMediaSummary {
  count: number;
  totalBytes: number;
}

export interface DashboardArticleItem {
  id: string;
  title: string;
  state: ArticleState;
  kanal: string | null;
  rubrik: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface DashboardActivityItem {
  id: bigint;
  action: string;
  summary: string;
  createdAt: Date;
}

export interface DashboardOverview {
  articles: DashboardArticleCounts;
  sections: DashboardSectionCounts;
  authors: DashboardAuthorCounts;
  media: DashboardMediaSummary;
  security: {
    failedLogins24h: number;
  };
  recent: DashboardArticleItem[];
  scheduled: DashboardArticleItem[];
  activity: DashboardActivityItem[];
}

export interface RawStatusGroup {
  status: ArticleStatus;
  _count: { _all: number };
}

export interface RawSectionGroup {
  kind: SectionKind;
  isActive: boolean;
  _count: { _all: number };
}

export interface RawAuthorGroup {
  isActive: boolean;
  _count: { _all: number };
}

/**
 * Menyusun angka kartu dashboard secara murni dari hasil agregat database.
 * Diekspor terpisah agar ketidak-tumpang-tindihan (non-overlap) status dapat
 * diuji langsung di unit test.
 *
 * Aturan partisi (identik dengan src/server/articles/status.ts + CHECK
 * article_published_needs_date di MariaDB):
 *   - sampah    = deletedAt IS NOT NULL
 *   - draf      = deletedAt IS NULL AND status = 'DRAFT'
 *   - arsip     = deletedAt IS NULL AND status = 'ARCHIVED'
 *   - terjadwal = deletedAt IS NULL AND status = 'PUBLISHED' AND publishedAt > now
 *   - terbit    = deletedAt IS NULL AND status = 'PUBLISHED' AND publishedAt <= now
 */
export function computeDashboardCounts(input: {
  statusGroups: readonly RawStatusGroup[];
  scheduledCount: number;
  trashedCount: number;
  sectionGroups: readonly RawSectionGroup[];
  authorGroups: readonly RawAuthorGroup[];
  mediaAggregate: { _count: { _all: number }; _sum: { sizeBytes: number | null } };
}): {
  articles: DashboardArticleCounts;
  sections: DashboardSectionCounts;
  authors: DashboardAuthorCounts;
  media: DashboardMediaSummary;
} {
  let draf = 0;
  let arsip = 0;
  let publishedTotal = 0;
  for (const row of input.statusGroups) {
    if (row.status === "DRAFT") draf += row._count._all;
    else if (row.status === "ARCHIVED") arsip += row._count._all;
    else if (row.status === "PUBLISHED") publishedTotal += row._count._all;
  }

  const terjadwal = Math.max(0, Math.min(input.scheduledCount, publishedTotal));
  const terbit = Math.max(0, publishedTotal - terjadwal);
  const sampah = Math.max(0, input.trashedCount);
  const semua = draf + terjadwal + terbit + arsip;

  let kanalActive = 0;
  let kanalTotal = 0;
  let rubrikActive = 0;
  let rubrikTotal = 0;
  for (const row of input.sectionGroups) {
    if (row.kind === "KANAL") {
      kanalTotal += row._count._all;
      if (row.isActive) kanalActive += row._count._all;
    } else if (row.kind === "RUBRIK") {
      rubrikTotal += row._count._all;
      if (row.isActive) rubrikActive += row._count._all;
    }
  }

  let authorsActive = 0;
  let authorsTotal = 0;
  for (const row of input.authorGroups) {
    authorsTotal += row._count._all;
    if (row.isActive) authorsActive += row._count._all;
  }

  const mediaCount = Math.max(0, input.mediaAggregate._count._all);
  const rawBytes = input.mediaAggregate._sum.sizeBytes;
  const mediaBytes = typeof rawBytes === "number" && Number.isFinite(rawBytes) && rawBytes > 0 ? rawBytes : 0;

  return {
    articles: {
      draf,
      terjadwal,
      terbit,
      arsip,
      sampah,
      semua,
      totalBaris: semua + sampah,
    },
    sections: {
      kanalActive,
      kanalTotal,
      rubrikActive,
      rubrikTotal,
    },
    authors: {
      active: authorsActive,
      total: authorsTotal,
    },
    media: {
      count: mediaCount,
      totalBytes: mediaBytes,
    },
  };
}

export async function getDashboardOverview(db: PrismaClient, now = new Date()): Promise<DashboardOverview> {
  const since24h = new Date(now.getTime() - 24 * 3600_000);

  // Batch 1 (4 query paralel — di bawah connectionLimit: 5).
  const [statusGroups, scheduledCount, trashedCount, sectionGroups] = await Promise.all([
    db.article.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.article.count({ where: stateWhere("terjadwal", now) }),
    db.article.count({ where: stateWhere("sampah", now) }),
    db.section.groupBy({
      by: ["kind", "isActive"],
      _count: { _all: true },
    }),
  ]);

  // Batch 2 (4 query paralel).
  const [mediaAggregate, authorGroups, failedLogins24h, activity] = await Promise.all([
    db.media.aggregate({
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    db.author.groupBy({
      by: ["isActive"],
      _count: { _all: true },
    }),
    db.loginAttempt.count({
      where: { success: false, createdAt: { gt: since24h } },
    }),
    db.activityLog.findMany({
      orderBy: { id: "desc" },
      take: 8,
      select: { id: true, action: true, summary: true, createdAt: true },
    }),
  ]);

  const counts = computeDashboardCounts({
    statusGroups,
    scheduledCount,
    trashedCount,
    sectionGroups,
    authorGroups,
    mediaAggregate,
  });

  const articleSelect = {
    id: true,
    title: true,
    status: true,
    publishedAt: true,
    deletedAt: true,
    updatedAt: true,
    kanal: { select: { name: true } },
    rubrik: { select: { name: true } },
  } as const;

  // Batch 3 (1 atau 2 query paralel; query terjadwal hanya dijalankan bila ada antrean).
  const [recentRows, scheduledRows] = await Promise.all([
    db.article.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: articleSelect,
    }),
    counts.articles.terjadwal > 0
      ? db.article.findMany({
          where: stateWhere("terjadwal", now),
          orderBy: { publishedAt: "asc" },
          take: 5,
          select: articleSelect,
        })
      : Promise.resolve([]),
  ]);

  const toItem = (row: (typeof recentRows)[number]): DashboardArticleItem => ({
    id: row.id,
    title: row.title,
    state: articleState(row, now),
    kanal: row.kanal?.name ?? null,
    rubrik: row.rubrik?.name ?? null,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  });

  return {
    ...counts,
    security: { failedLogins24h },
    recent: recentRows.map(toItem),
    scheduled: scheduledRows.map(toItem),
    activity,
  };
}
