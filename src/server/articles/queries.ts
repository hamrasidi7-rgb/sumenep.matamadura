import type { Prisma, PrismaClient } from "@prisma/client";

import {
  clampPage,
  DEFAULT_PER_PAGE,
  pageOffset,
  parsePerPage,
  totalPages,
  type ArticleSort,
} from "@/lib/admin-pagination";
import { docMediaIds, type DocNode } from "@/lib/article-doc";
import { mediaByIds, mediaUrl, type MediaDto } from "@/server/media/service";

import { articleState, stateWhere, type ArticleState, type StateFilter } from "./status";
import { toTags } from "./tags";

// Read side of the CMS: the article list (search + filters + paging), the
// editor's data, and the small lookups the editor needs.

export const PAGE_SIZE = DEFAULT_PER_PAGE;

export interface ListFilters {
  q?: string;
  state?: StateFilter;
  kanal?: string;
  rubrik?: string;
  author?: string;
  /** yyyy-mm-dd (WIB calendar days), inclusive */
  from?: string;
  to?: string;
  sort?: ArticleSort;
  perPage?: number;
  page?: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar day in WIB → UTC instant (start of that day in Asia/Jakarta). */
function wibDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`);
}

export function listWhere(filters: ListFilters, now = new Date()): Prisma.ArticleWhereInput {
  const and: Prisma.ArticleWhereInput[] = [stateWhere(filters.state ?? "semua", now)];
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    and.push({
      OR: [
        // Case-insensitive: the columns use the utf8mb4_unicode_ci collation.
        { title: { contains: q } },
        { standfirst: { contains: q } },
        { slug: { contains: q.toLowerCase() } },
        { bodyText: { contains: q } },
        { tags: { array_contains: [q] } },
      ],
    });
  }
  if (filters.kanal) and.push({ kanal: { slug: filters.kanal } });
  if (filters.rubrik) and.push({ rubrik: { slug: filters.rubrik } });
  if (filters.author) and.push({ author: { slug: filters.author } });
  // "Tanggal" = publish date when there is one, otherwise the creation date.
  const range: Prisma.DateTimeFilter = {};
  if (filters.from && DAY.test(filters.from)) range.gte = wibDayStart(filters.from);
  if (filters.to && DAY.test(filters.to)) range.lt = new Date(wibDayStart(filters.to).getTime() + 24 * 3600_000);
  if (range.gte || range.lt) {
    and.push({ OR: [{ publishedAt: range }, { publishedAt: null, createdAt: range }] });
  }
  return { AND: and };
}

function listOrderBy(sort?: ArticleSort): Prisma.ArticleOrderByWithRelationInput[] {
  if (sort === "terbit") return [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }];
  if (sort === "jadwal") return [{ publishedAt: "asc" }, { updatedAt: "desc" }, { id: "desc" }];
  return [{ updatedAt: "desc" }, { id: "desc" }];
}

export interface ArticleRow {
  id: string;
  version: number;
  title: string;
  standfirst: string;
  slug: string;
  state: ArticleState;
  everPublished: boolean;
  kanal: string | null;
  rubrik: string | null;
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  heroSrc: string | null;
}

export async function listArticles(db: PrismaClient, filters: ListFilters, now = new Date()) {
  const where = listWhere(filters, now);
  const perPage = parsePerPage(filters.perPage);
  // Batasi maksimal 4 query paralel agar tetap aman di bawah connectionLimit: 5 MariaDB Hostinger.
  const [total, counts] = await Promise.all([db.article.count({ where }), stateCounts(db, now)]);
  const pages = totalPages(total, perPage);
  const page = clampPage(filters.page, pages);
  const rows =
    total === 0
      ? []
      : await db.article.findMany({
          where,
          orderBy: listOrderBy(filters.sort),
          skip: pageOffset(page, perPage),
          take: perPage,
          select: {
            id: true,
            version: true,
            title: true,
            standfirst: true,
            slug: true,
            status: true,
            publishedAt: true,
            deletedAt: true,
            updatedAt: true,
            kanal: { select: { name: true } },
            rubrik: { select: { name: true } },
            author: { select: { name: true } },
            heroMedia: { select: { storageKey: true } },
          },
        });
  const items: ArticleRow[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    standfirst: r.standfirst,
    slug: r.slug,
    state: articleState(r, now),
    everPublished: r.publishedAt !== null,
    kanal: r.kanal?.name ?? null,
    rubrik: r.rubrik?.name ?? null,
    author: r.author.name,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
    heroSrc: r.heroMedia ? mediaUrl(r.heroMedia.storageKey) : null,
  }));
  return { items, total, page, pages, perPage, counts };
}

export async function stateCounts(db: PrismaClient, now = new Date()): Promise<Record<ArticleState, number>> {
  const [statusGroups, terjadwal, sampah] = await Promise.all([
    db.article.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    db.article.count({ where: stateWhere("terjadwal", now) }),
    db.article.count({ where: stateWhere("sampah", now) }),
  ]);
  let draf = 0;
  let arsip = 0;
  let publishedTotal = 0;
  for (const row of statusGroups) {
    if (row.status === "DRAFT") draf += row._count._all;
    else if (row.status === "ARCHIVED") arsip += row._count._all;
    else if (row.status === "PUBLISHED") publishedTotal += row._count._all;
  }
  const scheduledCount = Math.max(0, Math.min(terjadwal, publishedTotal));
  return {
    draf,
    terjadwal: scheduledCount,
    terbit: Math.max(0, publishedTotal - scheduledCount),
    arsip,
    sampah,
  };
}

export interface EditorOptionsParams {
  includeAuthorId?: string;
  includeUsedAuthors?: boolean;
}

/** Choices for the editor's selects. */
export async function editorOptions(db: PrismaClient, opts: EditorOptionsParams = {}) {
  const authorWhere: Prisma.AuthorWhereInput = opts.includeUsedAuthors
    ? { OR: [{ isActive: true }, { articles: { some: {} } }] }
    : opts.includeAuthorId
      ? { OR: [{ isActive: true }, { id: opts.includeAuthorId }] }
      : { isActive: true };
  const [sections, authors] = await Promise.all([
    db.section.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { id: true, kind: true, name: true, slug: true } }),
    db.author.findMany({
      where: authorWhere,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, isActive: true },
    }),
  ]);
  return {
    kanal: sections.filter((s) => s.kind === "KANAL"),
    rubrik: sections.filter((s) => s.kind === "RUBRIK"),
    authors: authors.map((a) => ({
      id: a.id,
      name: a.isActive ? a.name : `${a.name} (nonaktif)`,
      slug: a.slug,
    })),
  };
}

export interface EditableArticle {
  id: string;
  version: number;
  state: ArticleState;
  status: string;
  title: string;
  slug: string;
  standfirst: string;
  template: "STANDARD" | "FEATURE" | "SPOTLIGHT";
  body: DocNode;
  authorId: string;
  kanalId: string | null;
  rubrikId: string | null;
  heroMediaId: string | null;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogMediaId: string | null;
  hideFromHomepage: boolean;
  publishedAt: string | null;
  updatedAt: string;
  everPublished: boolean;
}

export async function articleForEditor(db: PrismaClient, id: string, now = new Date()): Promise<{ article: EditableArticle; media: Record<string, MediaDto> } | null> {
  const a = await db.article.findUnique({ where: { id } });
  if (!a) return null;
  const body = (a.body && typeof a.body === "object" ? a.body : { type: "doc", content: [] }) as unknown as DocNode;
  const { body: bodyIds, gallery } = docMediaIds(body);
  const media = await mediaByIds(db, [...bodyIds, ...gallery, a.heroMediaId ?? "", a.ogMediaId ?? ""]);
  return {
    article: {
      id: a.id,
      version: a.version,
      state: articleState(a, now),
      status: a.status,
      title: a.title,
      slug: a.slug,
      standfirst: a.standfirst,
      template: a.template,
      body,
      authorId: a.authorId,
      kanalId: a.kanalId,
      rubrikId: a.rubrikId,
      heroMediaId: a.heroMediaId,
      tags: toTags(a.tags),
      seoTitle: a.seoTitle ?? "",
      seoDescription: a.seoDescription ?? "",
      canonicalUrl: a.canonicalUrl ?? "",
      ogMediaId: a.ogMediaId,
      hideFromHomepage: a.hideFromHomepage,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
      everPublished: a.publishedAt !== null,
    },
    media: Object.fromEntries(media),
  };
}

/** Published articles for the link dialog (internal links point at live URLs only). */
export async function searchPublishedForLink(db: PrismaClient, q: string, now = new Date()) {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  const rows = await db.article.findMany({
    where: { AND: [stateWhere("terbit", now), { title: { contains: term } }] },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { slug: true, title: true },
  });
  return rows;
}
