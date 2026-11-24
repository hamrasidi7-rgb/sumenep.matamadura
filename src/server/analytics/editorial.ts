import type { ArticleTemplate, PrismaClient } from "@prisma/client";

import { publicWhere, stateWhere } from "@/server/articles/status";

// Kueri analitik redaksi SUMENEP (/admin/statistik) — Fase 8.
// Menggunakan data operasional nyata di MariaDB (status tidak tumpang tindih lewat
// stateWhere/publicWhere) + antrean terjadwal + distribusi kanal/rubrik/penulis/template.
// Maksimal 4 kueri per wave untuk connectionLimit: 5 MariaDB Hostinger.

const DAYS_WINDOW = 28;

export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD (WIB)
  current: number;
  previous: number;
}

export interface CountBreakdownRow {
  id: string;
  label: string;
  slug: string;
  sublabel?: string;
  isActive?: boolean;
  count: number;
  href: string;
}

export interface TemplateBreakdownRow {
  template: ArticleTemplate;
  label: string;
  count: number;
}

export interface ScheduledPreviewRow {
  id: string;
  title: string;
  slug: string;
  kanalName: string;
  publishedAt: Date;
}

export interface EditorialAnalyticsData {
  totals: {
    publishedTotal: number;
    publishedLast28Days: number;
    publishedPrev28Days: number;
    scheduled: number;
    drafts: number;
    archived: number;
  };
  dailySeries: DailyTrendPoint[];
  kanalBreakdown: CountBreakdownRow[];
  rubrikBreakdown: CountBreakdownRow[];
  authorBreakdown: CountBreakdownRow[];
  templateBreakdown: TemplateBreakdownRow[];
  seoReadiness: {
    missingSeoDescription: number;
    missingCustomOgMedia: number;
  };
  upcomingScheduled: ScheduledPreviewRow[];
}

const TEMPLATE_LABELS: Record<ArticleTemplate, string> = {
  STANDARD: "Berita",
  FEATURE: "Feature",
  SPOTLIGHT: "Sorotan",
};

const WIB_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toWibDateKey(instant: Date): string {
  return WIB_FORMATTER.format(instant);
}

function shiftWibDateKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

export function buildDailySeries28d(
  publishedInstants: Date[],
  now = new Date(),
): {
  series: DailyTrendPoint[];
  currentTotal: number;
  previousTotal: number;
  windowStartUtc: Date;
} {
  const todayWib = toWibDateKey(now);
  const currentDays = Array.from({ length: DAYS_WINDOW }, (_, idx) =>
    shiftWibDateKey(todayWib, -(DAYS_WINDOW - 1) + idx),
  );
  const previousDays = Array.from({ length: DAYS_WINDOW }, (_, idx) =>
    shiftWibDateKey(todayWib, -(DAYS_WINDOW * 2 - 1) + idx),
  );

  const counts = new Map<string, number>();
  for (const instant of publishedInstants) {
    const key = toWibDateKey(instant);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let currentTotal = 0;
  let previousTotal = 0;
  const series: DailyTrendPoint[] = currentDays.map((date, idx) => {
    const curr = counts.get(date) ?? 0;
    const prev = counts.get(previousDays[idx]) ?? 0;
    currentTotal += curr;
    previousTotal += prev;
    return { date, current: curr, previous: prev };
  });

  const earliestKey = previousDays[0];
  const windowStartUtc = new Date(`${earliestKey}T00:00:00+07:00`);

  return { series, currentTotal, previousTotal, windowStartUtc };
}

const PCT_FORMATTER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export function formatPeriodDelta(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? "Baru pada periode ini" : "Sama dengan periode sebelumnya";
  }
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0 ? "Naik" : pct < 0 ? "Turun" : "Tetap";
  return `${direction} ${PCT_FORMATTER.format(Math.abs(pct))}% dari 28 hari sebelumnya`;
}

export async function getEditorialAnalytics(
  db: PrismaClient,
  now = new Date(),
): Promise<EditorialAnalyticsData> {
  const { windowStartUtc } = buildDailySeries28d([], now);

  // Wave 1 (4 kueri)
  const [recentPublishedRows, publishedTotal, scheduled, drafts] = await Promise.all([
    db.article.findMany({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        publishedAt: { gte: windowStartUtc, lte: now },
      },
      select: { publishedAt: true },
    }),
    db.article.count({ where: stateWhere("terbit", now) }),
    db.article.count({ where: stateWhere("terjadwal", now) }),
    db.article.count({ where: stateWhere("draf", now) }),
  ]);

  // Wave 2 (4 kueri)
  const [kanalGroups, rubrikGroups, authorGroups, templateGroups] = await Promise.all([
    db.article.groupBy({ by: ["kanalId"], where: publicWhere(now), _count: { _all: true } }),
    db.article.groupBy({
      by: ["rubrikId"],
      where: { ...publicWhere(now), rubrikId: { not: null } },
      _count: { _all: true },
    }),
    db.article.groupBy({ by: ["authorId"], where: publicWhere(now), _count: { _all: true } }),
    db.article.groupBy({ by: ["template"], where: publicWhere(now), _count: { _all: true } }),
  ]);

  // Wave 3 (4 kueri)
  const [sections, authors, missingSeoDescription, upcomingRows] = await Promise.all([
    db.section.findMany({
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, kind: true, name: true, slug: true, isActive: true },
    }),
    db.author.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, role: true, isActive: true },
    }),
    db.article.count({
      where: {
        ...publicWhere(now),
        OR: [{ seoDescription: null }, { seoDescription: "" }],
      },
    }),
    db.article.findMany({
      where: stateWhere("terjadwal", now),
      orderBy: { publishedAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        kanal: { select: { name: true } },
      },
    }),
  ]);

  // Wave 4 (2 kueri)
  const [missingCustomOgMedia, archived] = await Promise.all([
    db.article.count({ where: { ...publicWhere(now), ogMediaId: null } }),
    db.article.count({ where: stateWhere("arsip", now) }),
  ]);

  const daily = buildDailySeries28d(
    recentPublishedRows
      .map((r) => r.publishedAt)
      .filter((d): d is Date => d instanceof Date),
    now,
  );

  const kanalCountMap = new Map(kanalGroups.map((g) => [g.kanalId, g._count._all]));
  const rubrikCountMap = new Map(
    rubrikGroups.filter((g) => g.rubrikId).map((g) => [g.rubrikId!, g._count._all]),
  );
  const authorCountMap = new Map(authorGroups.map((g) => [g.authorId, g._count._all]));
  const templateCountMap = new Map(templateGroups.map((g) => [g.template, g._count._all]));

  const kanalBreakdown: CountBreakdownRow[] = sections
    .filter((s) => s.kind === "KANAL")
    .map((s) => ({
      id: s.id,
      label: s.name,
      slug: s.slug,
      isActive: s.isActive,
      count: kanalCountMap.get(s.id) ?? 0,
      href: `/admin/artikel?status=terbit&kanal=${encodeURIComponent(s.slug)}`,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id-ID"));

  const rubrikBreakdown: CountBreakdownRow[] = sections
    .filter((s) => s.kind === "RUBRIK")
    .map((s) => ({
      id: s.id,
      label: s.name,
      slug: s.slug,
      isActive: s.isActive,
      count: rubrikCountMap.get(s.id) ?? 0,
      href: `/admin/artikel?status=terbit&rubrik=${encodeURIComponent(s.slug)}`,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id-ID"));

  const authorBreakdown: CountBreakdownRow[] = authors
    .map((a) => ({
      id: a.id,
      label: a.name,
      slug: a.slug,
      sublabel: a.role,
      isActive: a.isActive,
      count: authorCountMap.get(a.id) ?? 0,
      href: `/admin/artikel?status=terbit&penulis=${encodeURIComponent(a.slug)}`,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id-ID"));

  const templateBreakdown: TemplateBreakdownRow[] = (["STANDARD", "FEATURE", "SPOTLIGHT"] as const).map(
    (template) => ({
      template,
      label: TEMPLATE_LABELS[template],
      count: templateCountMap.get(template) ?? 0,
    }),
  );

  return {
    totals: {
      publishedTotal,
      publishedLast28Days: daily.currentTotal,
      publishedPrev28Days: daily.previousTotal,
      scheduled,
      drafts,
      archived,
    },
    dailySeries: daily.series,
    kanalBreakdown,
    rubrikBreakdown,
    authorBreakdown,
    templateBreakdown,
    seoReadiness: {
      missingSeoDescription,
      missingCustomOgMedia,
    },
    upcomingScheduled: upcomingRows
      .filter((r): r is typeof r & { publishedAt: Date } => r.publishedAt instanceof Date)
      .map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        kanalName: r.kanal?.name ?? "Tanpa kanal",
        publishedAt: r.publishedAt,
      })),
  };
}
