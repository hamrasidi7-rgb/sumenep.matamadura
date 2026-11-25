import type { Prisma, PrismaClient } from "@prisma/client";

import type { ArticleTemplate, MediaAsset, Section, SectionKind } from "@/content/types";
import { resolvePublicAuthor } from "@/lib/author";
import type { ArticleView, Paginated } from "@/lib/content";
import { publicWhere } from "@/server/articles/status";
import { toTags } from "@/server/articles/tags";
import { toMediaAsset, toMediaDto } from "@/server/media/service";

import { eligibleHeroWhere } from "./hero";
import {
  clampLatestCount,
  DEFAULT_LATEST_COUNT,
  resolveHomepageSlots,
  type HomepageRubricConfig,
  type HomepageSlotArticle,
  type ResolvedHomepageSlots,
} from "./slots";

// Kueri baca publik CMS (beranda, arsip kanal/rubrik, tulisan pilihan, daftar seksi).
// Dipisahkan dari `server-only` & `unstable_cache` agar bisa diuji langsung di tests/db.

const MEDIA_SELECT = {
  id: true,
  storageKey: true,
  width: true,
  height: true,
  alt: true,
  caption: true,
  credit: true,
} as const;

const DEFAULT_HERO_MEDIA: MediaAsset = {
  src: "/demo/senja-perahu.webp",
  width: 1200,
  height: 750,
  alt: "Ilustrasi SUMENEP – Mata Madura",
};

const TEMPLATE_MAP: Record<string, ArticleTemplate> = {
  STANDARD: "standard",
  FEATURE: "feature",
  SPOTLIGHT: "spotlight",
};

const PUBLIC_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  standfirst: true,
  template: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  tags: true,
  isDemo: true,
  kanalId: true,
  rubrikId: true,
  author: {
    select: {
      slug: true,
      name: true,
      role: true,
      bio: true,
      avatar: { select: MEDIA_SELECT },
    },
  },
  kanal: {
    select: {
      id: true,
      slug: true,
      kind: true,
      name: true,
      description: true,
    },
  },
  rubrik: {
    select: {
      id: true,
      slug: true,
      kind: true,
      name: true,
      description: true,
    },
  },
  heroMedia: { select: MEDIA_SELECT },
} satisfies Prisma.ArticleSelect;

type PublicCardRow = Prisma.ArticleGetPayload<{ select: typeof PUBLIC_CARD_SELECT }>;

function toSection(
  row: { slug: string; kind: "KANAL" | "RUBRIK"; name: string; description: string } | null,
): Section | undefined {
  if (!row) return undefined;
  return {
    slug: row.slug,
    kind: row.kind === "KANAL" ? "kanal" : "rubrik",
    name: row.name,
    description: row.description,
  };
}

function toCardView(row: PublicCardRow, now: Date): ArticleView {
  return {
    slug: row.slug,
    title: row.title,
    standfirst: row.standfirst,
    ...(row.kanal ? { kanal: row.kanal.slug } : {}),
    ...(row.rubrik ? { rubrik: row.rubrik.slug } : {}),
    author: resolvePublicAuthor({
      slug: row.author.slug,
      name: row.author.name,
      role: row.author.role,
      bio: row.author.bio ?? undefined,
      avatar: row.author.avatar ? toMediaAsset(toMediaDto(row.author.avatar)) : undefined,
    }),
    section: toSection(row.rubrik) ?? toSection(row.kanal),
    publishedAt: (row.publishedAt ?? now).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: row.readingMinutes,
    template: TEMPLATE_MAP[row.template] ?? "standard",
    hero: row.heroMedia ? toMediaAsset(toMediaDto(row.heroMedia)) : DEFAULT_HERO_MEDIA,
    body: [],
    tags: toTags(row.tags),
    isDemo: row.isDemo,
  };
}

function toSlotArticle(row: PublicCardRow, now: Date): HomepageSlotArticle {
  return {
    id: row.id,
    slug: row.slug,
    kanalSlug: row.kanal?.slug ?? null,
    rubrikId: row.rubrikId ?? null,
    rubrikSlug: row.rubrik?.slug ?? null,
    template: TEMPLATE_MAP[row.template] ?? "standard",
    view: toCardView(row, now),
  };
}

function sortByPublishedDesc(a: PublicCardRow, b: PublicCardRow): number {
  const pubDiff = (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  if (pubDiff !== 0) return pubDiff;
  const updDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
  if (updDiff !== 0) return updDiff;
  return b.id.localeCompare(a.id);
}

/**
 * Membaca data beranda CMS secara utuh (Hero Utama, Tulisan Pilihan, Kelompok
 * Rubrik termasuk Catatan Sumenep/Opini, dan Alur Berita Terbaru).
 * Mengembalikan `null` jika database belum memiliki 1 pun artikel terbit yang layak.
 */
export async function publicHomepageData(
  db: PrismaClient,
  now = new Date(),
): Promise<ResolvedHomepageSlots | null> {
  // Wave 1 (3 query paralel, di bawah batas connectionLimit: 5 MariaDB)
  const [settingsRow, featuredRows, rubricRows] = await Promise.all([
    db.homepageSettings.findUnique({
      where: { id: 1 },
      select: { heroArticleId: true, latestCount: true },
    }),
    db.homepageFeatured.findMany({
      orderBy: { position: "asc" },
      select: { articleId: true },
    }),
    db.homepageRubric.findMany({
      orderBy: { position: "asc" },
      include: {
        section: {
          select: {
            id: true,
            slug: true,
            kind: true,
            name: true,
            description: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  const configuredHeroId = settingsRow?.heroArticleId ?? null;
  const latestCount = clampLatestCount(settingsRow?.latestCount ?? DEFAULT_LATEST_COUNT);
  const featuredIds = featuredRows.map((r) => r.articleId);
  const activeRubricConfigs: HomepageRubricConfig[] = rubricRows
    .filter((r) => r.section.isActive && r.section.kind === "RUBRIK")
    .map((r) => ({
      section: {
        id: r.section.id,
        slug: r.section.slug,
        kind: "rubrik",
        name: r.section.name,
        description: r.section.description,
      },
      itemCount: r.itemCount,
    }));

  const pinnedIds = [...new Set([...(configuredHeroId ? [configuredHeroId] : []), ...featuredIds])];
  const rubricSectionIds = activeRubricConfigs.map((c) => c.section.id);
  const baseWhere = eligibleHeroWhere(now);
  const baseOrder: Prisma.ArticleOrderByWithRelationInput[] = [
    { publishedAt: "desc" },
    { updatedAt: "desc" },
    { id: "desc" },
  ];

  // Wave 2 (maksimal 3 query paralel): pool terbaru + pinned older Hero/Featured + pool rubrik terpasang
  const [recentPool, pinnedPool, rubricPool] = await Promise.all([
    db.article.findMany({
      where: baseWhere,
      orderBy: baseOrder,
      take: Math.max(latestCount + 30, 50),
      select: PUBLIC_CARD_SELECT,
    }),
    pinnedIds.length > 0
      ? db.article.findMany({
          where: { AND: [baseWhere, { id: { in: pinnedIds } }] },
          select: PUBLIC_CARD_SELECT,
        })
      : Promise.resolve<PublicCardRow[]>([]),
    rubricSectionIds.length > 0
      ? db.article.findMany({
          where: { AND: [baseWhere, { rubrikId: { in: rubricSectionIds } }] },
          orderBy: baseOrder,
          take: Math.max(activeRubricConfigs.reduce((sum, c) => sum + c.itemCount, 0) + 12, 24),
          select: PUBLIC_CARD_SELECT,
        })
      : Promise.resolve<PublicCardRow[]>([]),
  ]);

  const mergedMap = new Map<string, PublicCardRow>();
  for (const row of [...recentPool, ...pinnedPool, ...rubricPool]) {
    mergedMap.set(row.id, row);
  }
  const eligibleRows = [...mergedMap.values()].sort(sortByPublishedDesc);
  if (eligibleRows.length === 0) return null;

  return resolveHomepageSlots({
    configuredHeroId,
    featuredIds,
    rubricConfigs: activeRubricConfigs,
    latestCount,
    eligibleArticles: eligibleRows.map((row) => toSlotArticle(row, now)),
  });
}

export async function publicSectionsList(db: PrismaClient, kind?: SectionKind): Promise<Section[]> {
  const rows = await db.section.findMany({
    where: {
      isActive: true,
      ...(kind ? { kind: kind === "kanal" ? "KANAL" : "RUBRIK" } : {}),
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { slug: true, kind: true, name: true, description: true },
  });
  return rows.map((row) => ({
    slug: row.slug,
    kind: row.kind === "KANAL" ? "kanal" : "rubrik",
    name: row.name,
    description: row.description,
  }));
}

export async function publicSectionBySlug(
  db: PrismaClient,
  kind: SectionKind,
  slug: string,
): Promise<Section | null> {
  const row = await db.section.findFirst({
    where: {
      kind: kind === "kanal" ? "KANAL" : "RUBRIK",
      slug,
      isActive: true,
    },
    select: { slug: true, kind: true, name: true, description: true },
  });
  return row ? toSection(row) ?? null : null;
}

export async function publicFeaturedSlugs(db: PrismaClient, now = new Date()): Promise<string[]> {
  const rows = await db.homepageFeatured.findMany({
    orderBy: { position: "asc" },
    select: {
      article: {
        select: { slug: true, status: true, publishedAt: true, deletedAt: true, hideFromHomepage: true },
      },
    },
  });
  return rows
    .filter(
      (r) =>
        !r.article.deletedAt &&
        r.article.status === "PUBLISHED" &&
        r.article.publishedAt !== null &&
        r.article.publishedAt <= now &&
        !r.article.hideFromHomepage,
    )
    .map((r) => r.article.slug);
}

export interface PublicArticleListOptions {
  kind?: SectionKind;
  section?: string;
  author?: string;
  slugs?: readonly string[];
  page?: number;
  perPage?: number;
}

export async function publicArticleList(
  db: PrismaClient,
  opts: PublicArticleListOptions = {},
  now = new Date(),
): Promise<Paginated<ArticleView>> {
  const perPage = Math.max(1, Math.min(50, Math.floor(opts.perPage ?? 10) || 10));
  const requestedPage = Math.max(1, Math.floor(opts.page ?? 1) || 1);

  if (opts.slugs) {
    if (opts.slugs.length === 0) {
      return { items: [], page: 1, totalPages: 1, total: 0 };
    }
    const rows = await db.article.findMany({
      where: { AND: [publicWhere(now), { slug: { in: [...opts.slugs] } }] },
      select: PUBLIC_CARD_SELECT,
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const ordered = opts.slugs
      .map((slug) => bySlug.get(slug))
      .filter((r): r is PublicCardRow => Boolean(r));
    const total = ordered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(requestedPage, totalPages);
    const slice = ordered.slice((current - 1) * perPage, current * perPage);
    return {
      items: slice.map((r) => toCardView(r, now)),
      page: current,
      totalPages,
      total,
    };
  }

  const and: Prisma.ArticleWhereInput[] = [publicWhere(now)];
  if (opts.kind && opts.section) {
    and.push(opts.kind === "kanal" ? { kanal: { slug: opts.section } } : { rubrik: { slug: opts.section } });
  }
  if (opts.author) {
    and.push({ author: { slug: opts.author } });
  }
  const where: Prisma.ArticleWhereInput = { AND: and };

  const total = await db.article.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(requestedPage, totalPages);
  const rows =
    total === 0
      ? []
      : await db.article.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
          skip: (current - 1) * perPage,
          take: perPage,
          select: PUBLIC_CARD_SELECT,
        });

  return {
    items: rows.map((r) => toCardView(r, now)),
    page: current,
    totalPages,
    total,
  };
}
