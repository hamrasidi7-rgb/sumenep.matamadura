import type { ArticleStatus, ArticleTemplate, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { clampPage, pageOffset, totalPages } from "@/lib/admin-pagination";
import { logActivity } from "@/server/activity-log";
import { articleState, publicWhere, STATE_LABEL, type ArticleState } from "@/server/articles/status";
import { mediaUrl } from "@/server/media/service";

import {
  ADMIN_HERO_PATH,
  buildHeroAdminHref,
  HERO_CANDIDATES_PER_PAGE,
  HERO_CLEAR_ACTION,
  HERO_HISTORY_ACTIONS,
  HERO_HISTORY_LIMIT,
  HERO_SET_ACTION,
  parseHeroFilters,
  type HeroListFilters,
  type HeroTemplateFilter,
} from "./constants";
import { parseHeroHistoryMeta, templateEditorialLabel } from "./slots";

export {
  ADMIN_HERO_PATH,
  buildHeroAdminHref,
  HERO_CANDIDATES_PER_PAGE,
  HERO_CLEAR_ACTION,
  HERO_HISTORY_ACTIONS,
  HERO_HISTORY_LIMIT,
  HERO_SET_ACTION,
  parseHeroFilters,
  type HeroListFilters,
  type HeroTemplateFilter,
};

// Layanan backend Modul Hero Utama (/admin/hero).
// Mengelola singleton `homepage_settings.hero_article_id` tanpa membuat tabel
// database baru dan tanpa menduplikasi atau mengubah baris artikel. Riwayat
// pergantian Hero dicatat dan dibaca langsung dari `activity_log`.

export interface HeroArticleCard {
  id: string;
  slug: string;
  title: string;
  standfirst: string;
  template: ArticleTemplate;
  templateLabel: string;
  kanalName: string | null;
  kanalSlug: string | null;
  rubrikName: string | null;
  rubrikSlug: string | null;
  sectionLabel: string;
  authorName: string;
  publishedAtIso: string | null;
  heroSrc: string | null;
  heroAlt: string;
  hideFromHomepage: boolean;
  state: ArticleState;
}

export interface HeroHistoryItem {
  id: string;
  action: typeof HERO_SET_ACTION | typeof HERO_CLEAR_ACTION;
  source: "admin-hero" | "admin-settings";
  createdAtIso: string;
  adminName: string | null;
  summary: string;
  heroArticleId: string | null;
  heroTitle: string | null;
  heroSlug: string | null;
  heroSection: string | null;
  heroTemplateLabel: string | null;
  previousHeroTitle: string | null;
  /** Status terkini artikel yang pernah dipilih sebagai Hero. */
  currentStatusLabel: string | null;
  isCurrentlyHero: boolean;
  canRestoreAsHero: boolean;
}

export interface HeroManagerData {
  cmsPublicEnabled: boolean;
  updatedAtIso: string | null;
  active: {
    configuredId: string | null;
    mode: "manual" | "auto";
    configuredArticle: HeroArticleCard | null;
    effectiveArticle: HeroArticleCard | null;
    /** Diisi jika hero_article_id manual menunjuk artikel yang kini tidak lagi layak publik. */
    configuredIneligibleReason: string | null;
  };
  filters: HeroListFilters;
  filterOptions: {
    kanal: { slug: string; name: string }[];
    rubrik: { slug: string; name: string }[];
  };
  candidates: {
    items: HeroArticleCard[];
    total: number;
    page: number;
    pages: number;
    perPage: number;
  };
  history: HeroHistoryItem[];
}

export interface HeroActor {
  adminId: number;
  ip?: string | null;
  userAgent?: string | null;
}

export type HeroMutationResult =
  | { ok: true; heroArticleId: string | null; unchanged?: boolean }
  | { ok: false; error: string };

const heroArticleIdSchema = z.uuid("ID artikel Hero Utama tidak valid.");

/**
 * Kriteria tunggal kandidat sah Hero Utama:
 * Terbit (PUBLISHED, publishedAt <= now, tidak di tempat sampah) DAN
 * tidak ditandai sembunyi dari beranda (hideFromHomepage = false).
 */
export function eligibleHeroWhere(now = new Date()): Prisma.ArticleWhereInput {
  return {
    AND: [publicWhere(now), { hideFromHomepage: false }],
  };
}

export function isArticleEligibleForHero(
  article: {
    status: ArticleStatus;
    publishedAt: Date | null;
    deletedAt: Date | null;
    hideFromHomepage: boolean;
  },
  now = new Date(),
): boolean {
  if (article.deletedAt) return false;
  if (article.status !== "PUBLISHED") return false;
  if (!article.publishedAt || article.publishedAt > now) return false;
  if (article.hideFromHomepage) return false;
  return true;
}

export function describeIneligibleReason(
  article: {
    status: ArticleStatus;
    publishedAt: Date | null;
    deletedAt: Date | null;
    hideFromHomepage: boolean;
  } | null,
  now = new Date(),
): string | null {
  if (!article) return "Artikel sudah dihapus permanen.";
  if (article.deletedAt) return "Artikel sedang berada di tempat sampah.";
  if (article.status === "ARCHIVED") return "Artikel berstatus Arsip.";
  if (article.status === "DRAFT") return "Artikel berstatus Draf (belum terbit).";
  if (!article.publishedAt || article.publishedAt > now) {
    return "Artikel masih berstatus Terjadwal untuk tayang mendatang.";
  }
  if (article.hideFromHomepage) {
    return "Artikel ditandai 'Sembunyikan dari beranda' sehingga tidak boleh menjadi Hero Utama.";
  }
  return null;
}

const HERO_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  standfirst: true,
  template: true,
  status: true,
  publishedAt: true,
  deletedAt: true,
  hideFromHomepage: true,
  kanal: { select: { slug: true, name: true } },
  rubrik: { select: { slug: true, name: true } },
  author: { select: { name: true } },
  heroMedia: { select: { storageKey: true, alt: true } },
} satisfies Prisma.ArticleSelect;

type HeroCardRow = Prisma.ArticleGetPayload<{ select: typeof HERO_CARD_SELECT }>;

function toHeroCard(row: HeroCardRow, now: Date): HeroArticleCard {
  const sectionLabel = row.rubrik?.name ?? row.kanal?.name ?? "Umum";
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    standfirst: row.standfirst,
    template: row.template,
    templateLabel: templateEditorialLabel(row.template),
    kanalName: row.kanal?.name ?? null,
    kanalSlug: row.kanal?.slug ?? null,
    rubrikName: row.rubrik?.name ?? null,
    rubrikSlug: row.rubrik?.slug ?? null,
    sectionLabel,
    authorName: row.author.name,
    publishedAtIso: row.publishedAt?.toISOString() ?? null,
    heroSrc: row.heroMedia ? mediaUrl(row.heroMedia.storageKey) : null,
    heroAlt: row.heroMedia?.alt || row.title,
    hideFromHomepage: row.hideFromHomepage,
    state: articleState(row, now),
  };
}

export interface HeroSnapshot {
  id: string;
  title: string;
  slug: string;
  section: string;
  template: ArticleTemplate;
}

export function toHeroSnapshot(article: {
  id: string;
  title: string;
  slug: string;
  template: ArticleTemplate;
  kanal?: { name: string } | null;
  rubrik?: { name: string } | null;
}): HeroSnapshot {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    section: article.rubrik?.name ?? article.kanal?.name ?? "Umum",
    template: article.template,
  };
}

export async function recordHeroChangeActivity(
  tx: Prisma.TransactionClient,
  opts: {
    previous: HeroSnapshot | null;
    next: HeroSnapshot | null;
    source: "admin-hero" | "admin-settings";
    actor: HeroActor;
  },
): Promise<void> {
  const { previous, next, source, actor } = opts;
  const action = next ? HERO_SET_ACTION : HERO_CLEAR_ACTION;
  const summary = next
    ? previous
      ? `Hero Utama diganti dari "${previous.title}" menjadi "${next.title}".`
      : `Hero Utama ditetapkan ke "${next.title}".`
    : previous
      ? `Hero Utama dikembalikan ke otomatis (sebelumnya "${previous.title}").`
      : "Hero Utama dikembalikan ke mode otomatis.";

  await logActivity(tx, {
    actor: "ADMIN",
    adminId: actor.adminId,
    action,
    entityType: "homepage_settings",
    entityId: "1",
    summary,
    meta: {
      source,
      heroArticleId: next?.id ?? null,
      heroTitle: next?.title ?? null,
      heroSlug: next?.slug ?? null,
      heroSection: next?.section ?? null,
      heroTemplate: next?.template ?? null,
      previousHeroArticleId: previous?.id ?? null,
      previousHeroTitle: previous?.title ?? null,
      previousHeroSlug: previous?.slug ?? null,
    },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}

function candidateWhere(filters: HeroListFilters, now: Date): Prisma.ArticleWhereInput {
  const and: Prisma.ArticleWhereInput[] = [eligibleHeroWhere(now)];
  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q } },
        { standfirst: { contains: filters.q } },
        { slug: { contains: filters.q.toLowerCase() } },
      ],
    });
  }
  if (filters.kanal) and.push({ kanal: { slug: filters.kanal } });
  if (filters.rubrik) and.push({ rubrik: { slug: filters.rubrik } });
  if (filters.template !== "semua") and.push({ template: filters.template });
  return { AND: and };
}

export async function getHeroManagerData(
  db: PrismaClient,
  filters: HeroListFilters,
  now = new Date(),
): Promise<HeroManagerData> {
  const where = candidateWhere(filters, now);

  // Wave 1 (3 query paralel, aman di bawah connectionLimit: 5 MariaDB)
  const [settingsRow, autoFallbackRow, sections] = await Promise.all([
    db.homepageSettings.findUnique({
      where: { id: 1 },
      select: {
        heroArticleId: true,
        updatedAt: true,
        heroArticle: { select: HERO_CARD_SELECT },
      },
    }),
    db.article.findFirst({
      where: eligibleHeroWhere(now),
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      select: HERO_CARD_SELECT,
    }),
    db.section.findMany({
      where: { isActive: true },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { kind: true, slug: true, name: true },
    }),
  ]);

  // Wave 2 (2 query paralel)
  const [totalCandidates, historyLogs] = await Promise.all([
    db.article.count({ where }),
    db.activityLog.findMany({
      where: { action: { in: [...HERO_HISTORY_ACTIONS] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HERO_HISTORY_LIMIT,
      include: { admin: { select: { name: true } } },
    }),
  ]);

  const pages = totalPages(totalCandidates, HERO_CANDIDATES_PER_PAGE);
  const safePage = clampPage(filters.page, pages);

  const parsedHistory = historyLogs.map((row) => ({
    row,
    meta: parseHeroHistoryMeta(row.meta),
  }));
  const historyArticleIds = [
    ...new Set(parsedHistory.map((item) => item.meta.heroArticleId).filter((id): id is string => Boolean(id))),
  ];

  // Wave 3 (maksimal 2 query paralel)
  const [candidateRows, historyArticleRows] = await Promise.all([
    totalCandidates === 0
      ? Promise.resolve<HeroCardRow[]>([])
      : db.article.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
          skip: pageOffset(safePage, HERO_CANDIDATES_PER_PAGE),
          take: HERO_CANDIDATES_PER_PAGE,
          select: HERO_CARD_SELECT,
        }),
    historyArticleIds.length === 0
      ? Promise.resolve([])
      : db.article.findMany({
          where: { id: { in: historyArticleIds } },
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            publishedAt: true,
            deletedAt: true,
            hideFromHomepage: true,
            template: true,
            kanal: { select: { name: true } },
            rubrik: { select: { name: true } },
          },
        }),
  ]);

  const configuredId = settingsRow?.heroArticleId ?? null;
  const configuredRow = settingsRow?.heroArticle ?? null;
  const configuredCard = configuredRow ? toHeroCard(configuredRow, now) : null;
  const configuredEligible = configuredRow ? isArticleEligibleForHero(configuredRow, now) : false;
  const configuredIneligibleReason =
    configuredId && !configuredEligible ? describeIneligibleReason(configuredRow, now) : null;

  const autoFallbackCard = autoFallbackRow ? toHeroCard(autoFallbackRow, now) : null;
  const effectiveArticle = configuredEligible && configuredCard ? configuredCard : autoFallbackCard;
  const mode: "manual" | "auto" = configuredId && configuredEligible ? "manual" : "auto";

  const historyArticleMap = new Map(historyArticleRows.map((a) => [a.id, a]));
  const history: HeroHistoryItem[] = parsedHistory.map(({ row, meta }) => {
    const liveArticle = meta.heroArticleId ? historyArticleMap.get(meta.heroArticleId) : undefined;
    const isHeroSet = row.action === HERO_SET_ACTION;
    let currentStatusLabel: string | null = null;
    let canRestoreAsHero = false;

    if (isHeroSet && meta.heroArticleId) {
      if (!liveArticle) {
        currentStatusLabel = "Dihapus permanen";
      } else if (isArticleEligibleForHero(liveArticle, now)) {
        currentStatusLabel = "Terbit";
        canRestoreAsHero = liveArticle.id !== configuredId;
      } else if (liveArticle.hideFromHomepage && !liveArticle.deletedAt && liveArticle.status === "PUBLISHED") {
        currentStatusLabel = "Tersembunyi dari beranda";
      } else {
        currentStatusLabel = STATE_LABEL[articleState(liveArticle, now)];
      }
    }

    return {
      id: row.id.toString(),
      action: isHeroSet ? HERO_SET_ACTION : HERO_CLEAR_ACTION,
      source: meta.source,
      createdAtIso: row.createdAt.toISOString(),
      adminName: row.admin?.name ?? null,
      summary: row.summary,
      heroArticleId: meta.heroArticleId,
      heroTitle: liveArticle?.title ?? meta.heroTitle,
      heroSlug: liveArticle?.slug ?? meta.heroSlug,
      heroSection: liveArticle?.rubrik?.name ?? liveArticle?.kanal?.name ?? meta.heroSection,
      heroTemplateLabel: meta.heroTemplate
        ? templateEditorialLabel(meta.heroTemplate)
        : liveArticle
          ? templateEditorialLabel(liveArticle.template)
          : null,
      previousHeroTitle: meta.previousHeroTitle,
      currentStatusLabel,
      isCurrentlyHero: Boolean(meta.heroArticleId && configuredId === meta.heroArticleId && configuredEligible),
      canRestoreAsHero,
    };
  });

  return {
    cmsPublicEnabled: process.env.CMS_PUBLIC_ARTICLES === "on",
    updatedAtIso: settingsRow?.updatedAt.toISOString() ?? null,
    active: {
      configuredId,
      mode,
      configuredArticle: configuredCard,
      effectiveArticle,
      configuredIneligibleReason,
    },
    filters: { ...filters, page: safePage },
    filterOptions: {
      kanal: sections.filter((s) => s.kind === "KANAL").map(({ slug, name }) => ({ slug, name })),
      rubrik: sections.filter((s) => s.kind === "RUBRIK").map(({ slug, name }) => ({ slug, name })),
    },
    candidates: {
      items: candidateRows.map((r) => toHeroCard(r, now)),
      total: totalCandidates,
      page: safePage,
      pages,
      perPage: HERO_CANDIDATES_PER_PAGE,
    },
    history,
  };
}

/**
 * Menetapkan satu artikel CMS yang sudah terbit sebagai Hero Utama aktif.
 * Tidak mengubah URL, slug, tanggal publikasi, kategori, status, ataupun
 * menduplikasi baris artikel.
 */
export async function setHomepageHero(
  db: PrismaClient,
  rawArticleId: string,
  actor: HeroActor,
  now = new Date(),
): Promise<HeroMutationResult> {
  const parsed = heroArticleIdSchema.safeParse(rawArticleId);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ID artikel tidak valid." };
  }
  const articleId = parsed.data;

  return db.$transaction(async (tx) => {
    const target = await tx.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        slug: true,
        template: true,
        status: true,
        publishedAt: true,
        deletedAt: true,
        hideFromHomepage: true,
        kanal: { select: { name: true } },
        rubrik: { select: { name: true } },
      },
    });

    if (!target) {
      return { ok: false, error: "Artikel tidak ditemukan." };
    }
    const reason = describeIneligibleReason(target, now);
    if (reason) {
      return { ok: false, error: reason };
    }

    const current = await tx.homepageSettings.findUnique({
      where: { id: 1 },
      select: {
        heroArticleId: true,
        heroArticle: {
          select: {
            id: true,
            title: true,
            slug: true,
            template: true,
            kanal: { select: { name: true } },
            rubrik: { select: { name: true } },
          },
        },
      },
    });

    if (current?.heroArticleId === target.id) {
      return { ok: true, heroArticleId: target.id, unchanged: true };
    }

    await tx.homepageSettings.upsert({
      where: { id: 1 },
      create: { id: 1, heroArticleId: target.id },
      update: { heroArticleId: target.id },
    });

    await recordHeroChangeActivity(tx, {
      previous: current?.heroArticle ? toHeroSnapshot(current.heroArticle) : null,
      next: toHeroSnapshot(target),
      source: "admin-hero",
      actor,
    });

    return { ok: true, heroArticleId: target.id };
  });
}

/**
 * Mengembalikan Hero Utama ke mode otomatis (artikel terbit terbaru).
 * Artikel Hero sebelumnya tetap utuh dan otomatis kembali ke posisi normalnya.
 */
export async function clearHomepageHero(
  db: PrismaClient,
  actor: HeroActor,
): Promise<HeroMutationResult> {
  return db.$transaction(async (tx) => {
    const current = await tx.homepageSettings.findUnique({
      where: { id: 1 },
      select: {
        heroArticleId: true,
        heroArticle: {
          select: {
            id: true,
            title: true,
            slug: true,
            template: true,
            kanal: { select: { name: true } },
            rubrik: { select: { name: true } },
          },
        },
      },
    });

    if (!current?.heroArticleId) {
      return { ok: true, heroArticleId: null, unchanged: true };
    }

    await tx.homepageSettings.upsert({
      where: { id: 1 },
      create: { id: 1, heroArticleId: null },
      update: { heroArticleId: null },
    });

    await recordHeroChangeActivity(tx, {
      previous: current.heroArticle ? toHeroSnapshot(current.heroArticle) : null,
      next: null,
      source: "admin-hero",
      actor,
    });

    return { ok: true, heroArticleId: null };
  });
}
