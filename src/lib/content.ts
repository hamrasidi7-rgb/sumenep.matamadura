import "server-only";

import { ARTICLES, AUTHORS, HOMEPAGE } from "@/content/seed";
import { SECTIONS } from "@/content/sections";
import type { Article, Author, EditorialNote, Section, SectionKind } from "@/content/types";
import { withHeadingIds } from "@/lib/article-utils";
import { DEFAULT_AUTHOR, resolvePublicAuthor } from "@/lib/author";
import { cachedPublicArticle, cachedRedirectTarget, cachedRelated } from "@/server/articles/public";
import {
  cachedPublicArticlesByAuthor,
  cachedPublicAuthor,
  cachedPublicAuthors,
} from "@/server/authors/public";
import { configuredDatabaseParts } from "@/server/db/url";

// Content adapter. Today it reads the demo seed; in Tahap 5 each function is
// re-implemented on top of the Payload Local API with the same signatures.
// Components import from here only — never from src/content/seed.ts.

export const CONTENT_SOURCE: "seed" | "cms" = "seed";

/**
 * Fase 4: with CMS_PUBLIC_ARTICLES=on, /artikel/[slug] first looks for a
 * PUBLISHED article in the CMS database (publish time reached, not archived,
 * not in the trash) and falls back to the demo seed. Lists (homepage, kanal,
 * rubrik, search) stay on the seed until the full integration in Fase 8.
 */
export const CMS_ARTICLES = process.env.CMS_PUBLIC_ARTICLES === "on";

/** Article with relations populated (what Payload returns with depth ≥ 1). */
export type ArticleView = Omit<Article, "author"> & {
  author: Author;
  /** Label shown above the title: the rubrik if any, else the kanal. */
  section?: Section;
};

const FALLBACK_AUTHOR: Author = DEFAULT_AUTHOR;

function toView(a: Article): ArticleView {
  const kind: SectionKind = a.rubrik ? "rubrik" : "kanal";
  const slug = a.rubrik ?? a.kanal;
  return {
    ...a,
    body: withHeadingIds(a.body),
    author: AUTHORS.find((x) => x.slug === a.author) ?? FALLBACK_AUTHOR,
    section: SECTIONS.find((s) => s.kind === kind && s.slug === slug),
  };
}

const byDateDesc = (a: Article, b: Article) => b.publishedAt.localeCompare(a.publishedAt);

export interface Paginated<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

function paginate<T>(all: T[], page: number, perPage: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return {
    items: all.slice((current - 1) * perPage, current * perPage),
    page: current,
    totalPages,
    total: all.length,
  };
}

export async function getSections(kind?: SectionKind): Promise<Section[]> {
  return kind ? SECTIONS.filter((s) => s.kind === kind) : SECTIONS;
}

export async function getSection(kind: SectionKind, slug: string): Promise<Section | null> {
  return SECTIONS.find((s) => s.kind === kind && s.slug === slug) ?? null;
}

export async function getAuthor(slug: string): Promise<Author | null> {
  if (CMS_ARTICLES && configuredDatabaseParts(process.env)) {
    const fromCms = await cachedPublicAuthor(slug);
    if (fromCms) return fromCms;
  }
  const seed = AUTHORS.find((a) => a.slug === slug);
  return seed ? resolvePublicAuthor(seed) : null;
}

export async function getAuthors(): Promise<Author[]> {
  const bySlug = new Map<string, Author>();
  for (const author of AUTHORS) {
    bySlug.set(author.slug, resolvePublicAuthor(author));
  }
  if (CMS_ARTICLES && configuredDatabaseParts(process.env)) {
    const fromCms = await cachedPublicAuthors();
    for (const author of fromCms) {
      bySlug.set(author.slug, author);
    }
  }
  return [...bySlug.values()];
}

const AUTHOR_ARCHIVE_PAGE_SIZE = 12;

export async function listAuthorArticles(slug: string, page = 1): Promise<Paginated<ArticleView>> {
  const safeRequestedPage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  if (!(CMS_ARTICLES && configuredDatabaseParts(process.env))) {
    return listArticles({ author: slug, page: safeRequestedPage });
  }

  const cmsItems = await cachedPublicArticlesByAuthor(slug);
  const seenSlugs = new Set(cmsItems.map((item) => item.slug));

  const seedItems: ArticleView[] = [];
  const firstSeedPage = await listArticles({ author: slug, page: 1 });
  for (const item of firstSeedPage.items) {
    if (!seenSlugs.has(item.slug)) seedItems.push(item);
  }
  for (let p = 2; p <= firstSeedPage.totalPages; p += 1) {
    const nextSeedPage = await listArticles({ author: slug, page: p });
    for (const item of nextSeedPage.items) {
      if (!seenSlugs.has(item.slug)) seedItems.push(item);
    }
  }

  const combined = [...cmsItems, ...seedItems].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  const total = combined.length;
  const totalPages = Math.max(1, Math.ceil(total / AUTHOR_ARCHIVE_PAGE_SIZE));
  const currentPage = Math.min(safeRequestedPage, totalPages);
  const offset = (currentPage - 1) * AUTHOR_ARCHIVE_PAGE_SIZE;

  return {
    items: combined.slice(offset, offset + AUTHOR_ARCHIVE_PAGE_SIZE),
    page: currentPage,
    totalPages,
    total,
  };
}

export async function getArticle(slug: string): Promise<ArticleView | null> {
  if (CMS_ARTICLES) {
    const fromCms = await cachedPublicArticle(slug);
    if (fromCms) return fromCms;
  }
  const a = ARTICLES.find((x) => x.slug === slug);
  return a ? toView(a) : null;
}

/** Current slug of a CMS article that used to live at `slug` (for a 301), if it is public. */
export async function getArticleRedirect(slug: string): Promise<string | null> {
  return CMS_ARTICLES ? cachedRedirectTarget(slug) : null;
}

export async function getAllArticleSlugs(): Promise<string[]> {
  return ARTICLES.map((a) => a.slug);
}

export async function listArticles(opts: {
  kind?: SectionKind;
  section?: string;
  author?: string;
  slugs?: readonly string[];
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<ArticleView>> {
  let all = [...ARTICLES].sort(byDateDesc);
  if (opts.kind && opts.section) {
    all = all.filter((a) => (opts.kind === "kanal" ? a.kanal : a.rubrik) === opts.section);
  }
  if (opts.author) all = all.filter((a) => a.author === opts.author);
  if (opts.slugs) {
    const order = opts.slugs;
    all = all.filter((a) => order.includes(a.slug)).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  }
  const page = paginate(all, opts.page ?? 1, opts.perPage ?? 10);
  return { ...page, items: page.items.map(toView) };
}

export async function searchArticles(q: string, page = 1): Promise<Paginated<ArticleView>> {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const hits = terms.length
    ? [...ARTICLES]
        .filter((a) => {
          const hay = `${a.title} ${a.standfirst} ${a.tags.join(" ")}`.toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
        .sort(byDateDesc)
    : [];
  const p = paginate(hits, page, 10);
  return { ...p, items: p.items.map(toView) };
}

export interface HomepageData {
  hero: ArticleView;
  featured: ArticleView[];
  latest: ArticleView[];
  editorialNote: EditorialNote;
}

export async function getHomepage(): Promise<HomepageData> {
  const sorted = [...ARTICLES].sort(byDateDesc);
  const hero = ARTICLES.find((a) => a.slug === HOMEPAGE.hero) ?? sorted[0];
  const featured = HOMEPAGE.featured
    .map((slug) => ARTICLES.find((a) => a.slug === slug))
    .filter((a): a is Article => Boolean(a));
  const shown = new Set([hero.slug, ...featured.map((a) => a.slug)]);
  const latest = sorted.filter((a) => !shown.has(a.slug)).slice(0, HOMEPAGE.latestCount);
  return {
    hero: toView(hero),
    featured: featured.map(toView),
    latest: latest.map(toView),
    editorialNote: HOMEPAGE.editorialNote,
  };
}

export async function getFeaturedSlugs(): Promise<readonly string[]> {
  return HOMEPAGE.featured;
}

/** Up to `limit` related articles: same kanal, then same rubrik, then latest. */
export async function getRelatedArticles(article: ArticleView, limit = 3): Promise<ArticleView[]> {
  if (CMS_ARTICLES && !ARTICLES.some((a) => a.slug === article.slug)) {
    return cachedRelated(article.slug, article.kanal ?? null, article.rubrik ?? null, limit);
  }
  const pool = [...ARTICLES].sort(byDateDesc).filter((a) => a.slug !== article.slug);
  const score = (a: Article) => (a.kanal && a.kanal === article.kanal ? 2 : 0) + (a.rubrik && a.rubrik === article.rubrik ? 1 : 0);
  return pool
    .map((a, i) => ({ a, s: score(a), i }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .slice(0, limit)
    .map(({ a }) => toView(a));
}
