import type { Prisma, PrismaClient } from "@prisma/client";

import { docMediaIds, type DocNode } from "@/lib/article-doc";
import { mediaByIds, type MediaDto } from "@/server/media/service";

import { articleState, stateWhere, type ArticleState, type StateFilter } from "./status";

// Read side of the CMS: the article list (search + filters + paging), the
// editor's data, and the small lookups the editor needs.

export const PAGE_SIZE = 20;

export interface ListFilters {
  q?: string;
  state?: StateFilter;
  kanal?: string;
  rubrik?: string;
  /** yyyy-mm-dd (WIB calendar days), inclusive */
  from?: string;
  to?: string;
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
        { title: { contains: q, mode: "insensitive" } },
        { standfirst: { contains: q, mode: "insensitive" } },
        { slug: { contains: q.toLowerCase() } },
        { bodyText: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ],
    });
  }
  if (filters.kanal) and.push({ kanal: { slug: filters.kanal } });
  if (filters.rubrik) and.push({ rubrik: { slug: filters.rubrik } });
  // "Tanggal" = publish date when there is one, otherwise the creation date.
  const range: Prisma.DateTimeFilter = {};
  if (filters.from && DAY.test(filters.from)) range.gte = wibDayStart(filters.from);
  if (filters.to && DAY.test(filters.to)) range.lt = new Date(wibDayStart(filters.to).getTime() + 24 * 3600_000);
  if (range.gte || range.lt) {
    and.push({ OR: [{ publishedAt: range }, { publishedAt: null, createdAt: range }] });
  }
  return { AND: and };
}

export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  state: ArticleState;
  kanal: string | null;
  rubrik: string | null;
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  heroSrc: string | null;
}

export async function listArticles(db: PrismaClient, filters: ListFilters, now = new Date()) {
  const where = listWhere(filters, now);
  const page = Math.max(1, Math.floor(filters.page ?? 1) || 1);
  const [total, rows, counts] = await Promise.all([
    db.article.count({ where }),
    db.article.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
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
    }),
    stateCounts(db, now),
  ]);
  const items: ArticleRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    state: articleState(r, now),
    kanal: r.kanal?.name ?? null,
    rubrik: r.rubrik?.name ?? null,
    author: r.author.name,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
    heroSrc: r.heroMedia ? `/media/${r.heroMedia.storageKey}` : null,
  }));
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), counts };
}

export async function stateCounts(db: PrismaClient, now = new Date()): Promise<Record<ArticleState, number>> {
  const [draf, terjadwal, terbit, arsip, sampah] = await Promise.all(
    (["draf", "terjadwal", "terbit", "arsip", "sampah"] as const).map((s) => db.article.count({ where: stateWhere(s, now) })),
  );
  return { draf, terjadwal, terbit, arsip, sampah };
}

/** Choices for the editor's selects. */
export async function editorOptions(db: PrismaClient) {
  const [sections, authors] = await Promise.all([
    db.section.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { id: true, kind: true, name: true, slug: true } }),
    db.author.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
  ]);
  return {
    kanal: sections.filter((s) => s.kind === "KANAL"),
    rubrik: sections.filter((s) => s.kind === "RUBRIK"),
    authors,
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
      tags: a.tags,
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
    where: { AND: [stateWhere("terbit", now), { title: { contains: term, mode: "insensitive" } }] },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { slug: true, title: true },
  });
  return rows;
}
