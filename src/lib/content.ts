import "server-only";

import { SECTIONS } from "@/content/sections";
import type { Article, Author, EditorialNote, Section, SectionKind } from "@/content/types";
import { cachedPublicArticle, cachedRedirectTarget, cachedRelated } from "@/server/articles/public";
import {
  cachedPublicArticlesByAuthor,
  cachedPublicAuthor,
  cachedPublicAuthors,
} from "@/server/authors/public";
import { configuredDatabaseParts } from "@/server/db/url";
import {
  cachedPublicArticleList,
  cachedPublicFeaturedSlugs,
  cachedPublicHomepage,
  cachedPublicSearch,
  cachedPublicSection,
  cachedPublicSections,
  cachedSelectedHero,
  cachedSelectedHeroArticle,
  cachedSelectedHeroAuthor,
} from "@/server/homepage/public";
import type { HomepageRubricBand } from "@/server/homepage/slots";

// Content adapter publik SUMENEP – Mata Madura.
// Seluruh konten artikel, penulis, pencarian, dan kurasi beranda dibaca dari
// database CMS MariaDB (tanpa konten contoh / demo).

export const CONTENT_SOURCE: "seed" | "cms" = "cms";

/**
 * Aktif secara bawaan untuk membaca konten CMS publik dari database.
 * Hanya nonaktif bila `CMS_PUBLIC_ARTICLES=off` secara eksplisit di environment
 * (dalam mode terkunci tersebut, hanya 1 Hero Utama pilihan redaksi yang tetap
 * dapat dibaca).
 */
export const CMS_ARTICLES = process.env.CMS_PUBLIC_ARTICLES !== "off";

const DEFAULT_EDITORIAL_NOTE: EditorialNote = {
  title: "Catatan Sumenep",
  description: "Gagasan, pengamatan, dan cerita tentang Sumenep lebih dekat dan lebih utuh.",
  href: "/rubrik/catatan-sumenep",
};

/** Article with relations populated for public templates. */
export type ArticleView = Omit<Article, "author"> & {
  author: Author;
  /** Label shown above the title: the rubrik if any, else the kanal. */
  section?: Section;
};

export interface Paginated<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

const EMPTY_PAGE: Paginated<ArticleView> = {
  items: [],
  page: 1,
  totalPages: 1,
  total: 0,
};

const AUTHOR_ARCHIVE_PAGE_SIZE = 12;

function hasDatabase(): boolean {
  return Boolean(configuredDatabaseParts(process.env));
}

export async function getSections(kind?: SectionKind): Promise<Section[]> {
  if (CMS_ARTICLES && hasDatabase()) {
    try {
      const fromCms = await cachedPublicSections(kind);
      if (fromCms.length > 0) return fromCms;
    } catch {
      // Fallback ke struktur kanal/rubrik bawaan bila database belum siap (mis. saat build).
    }
  }
  return kind ? SECTIONS.filter((s) => s.kind === kind) : SECTIONS;
}

export async function getSection(kind: SectionKind, slug: string): Promise<Section | null> {
  if (CMS_ARTICLES && hasDatabase()) {
    try {
      const fromCms = await cachedPublicSection(kind, slug);
      if (fromCms) return fromCms;
    } catch {
      // Fallback ke struktur seksi bawaan.
    }
  }
  return SECTIONS.find((s) => s.kind === kind && s.slug === slug) ?? null;
}

export async function getAuthor(slug: string): Promise<Author | null> {
  if (!hasDatabase()) return null;
  try {
    if (CMS_ARTICLES) {
      return await cachedPublicAuthor(slug);
    }
    const heroAuthor = await cachedSelectedHeroAuthor(slug);
    return heroAuthor?.author ?? null;
  } catch {
    return null;
  }
}

export async function getAuthors(): Promise<Author[]> {
  if (!(CMS_ARTICLES && hasDatabase())) return [];
  try {
    return await cachedPublicAuthors();
  } catch {
    return [];
  }
}

export async function listAuthorArticles(slug: string, page = 1): Promise<Paginated<ArticleView>> {
  const safeRequestedPage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  if (!hasDatabase()) return EMPTY_PAGE;

  try {
    let items: ArticleView[] = [];
    if (CMS_ARTICLES) {
      items = await cachedPublicArticlesByAuthor(slug);
    } else {
      const heroAuthor = await cachedSelectedHeroAuthor(slug);
      if (heroAuthor) items = [heroAuthor.heroArticle];
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / AUTHOR_ARCHIVE_PAGE_SIZE));
    const currentPage = Math.min(safeRequestedPage, totalPages);
    const offset = (currentPage - 1) * AUTHOR_ARCHIVE_PAGE_SIZE;

    return {
      items: items.slice(offset, offset + AUTHOR_ARCHIVE_PAGE_SIZE),
      page: currentPage,
      totalPages,
      total,
    };
  } catch {
    return EMPTY_PAGE;
  }
}

export async function getArticle(slug: string): Promise<ArticleView | null> {
  if (!hasDatabase()) return null;
  try {
    if (CMS_ARTICLES) {
      return await cachedPublicArticle(slug);
    }
    return await cachedSelectedHeroArticle(slug);
  } catch {
    return null;
  }
}

/** Current slug of a CMS article that used to live at `slug` (for a 301), if it is public. */
export async function getArticleRedirect(slug: string): Promise<string | null> {
  if (!(CMS_ARTICLES && hasDatabase())) return null;
  try {
    return await cachedRedirectTarget(slug);
  } catch {
    return null;
  }
}

export async function getAllArticleSlugs(): Promise<string[]> {
  return [];
}

export async function listArticles(opts: {
  kind?: SectionKind;
  section?: string;
  author?: string;
  slugs?: readonly string[];
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<ArticleView>> {
  if (!(CMS_ARTICLES && hasDatabase())) return EMPTY_PAGE;
  try {
    const pageNum = opts.page ?? 1;
    const perPage = opts.perPage ?? 10;
    const slugsKey = opts.slugs ? opts.slugs.join(",") : "";
    return await cachedPublicArticleList(
      opts.kind ?? "",
      opts.section ?? "",
      opts.author ?? "",
      slugsKey,
      pageNum,
      perPage,
    );
  } catch {
    return EMPTY_PAGE;
  }
}

export async function searchArticles(q: string, page = 1): Promise<Paginated<ArticleView>> {
  const clean = q.trim();
  if (!clean || !(CMS_ARTICLES && hasDatabase())) return EMPTY_PAGE;
  try {
    return await cachedPublicSearch(clean, Math.max(1, Math.floor(page) || 1), 10);
  } catch {
    return EMPTY_PAGE;
  }
}

export interface HomepageData {
  hero: ArticleView | null;
  featured: ArticleView[];
  latest: ArticleView[];
  editorialNote: EditorialNote;
  catatanArticles: ArticleView[];
  rubricBands: HomepageRubricBand[];
}

export async function getHomepage(): Promise<HomepageData> {
  if (hasDatabase()) {
    try {
      if (CMS_ARTICLES) {
        const cmsHome = await cachedPublicHomepage();
        if (cmsHome) {
          return {
            hero: cmsHome.hero,
            featured: cmsHome.featured,
            latest: cmsHome.latest,
            editorialNote: DEFAULT_EDITORIAL_NOTE,
            catatanArticles: cmsHome.catatanArticles,
            rubricBands: cmsHome.rubricBands,
          };
        }
      } else {
        const selectedHero = await cachedSelectedHero();
        if (selectedHero) {
          return {
            hero: selectedHero,
            featured: [],
            latest: [],
            editorialNote: DEFAULT_EDITORIAL_NOTE,
            catatanArticles: [],
            rubricBands: [],
          };
        }
      }
    } catch {
      // Jatuh kembali ke beranda kosong yang aman bila database belum terjangkau.
    }
  }

  return {
    hero: null,
    featured: [],
    latest: [],
    editorialNote: DEFAULT_EDITORIAL_NOTE,
    catatanArticles: [],
    rubricBands: [],
  };
}

export async function getFeaturedSlugs(): Promise<readonly string[]> {
  if (!(CMS_ARTICLES && hasDatabase())) return [];
  try {
    return await cachedPublicFeaturedSlugs();
  } catch {
    return [];
  }
}

/** Up to `limit` related articles: same kanal, then same rubrik, then latest. */
export async function getRelatedArticles(article: ArticleView, limit = 3): Promise<ArticleView[]> {
  if (!(CMS_ARTICLES && hasDatabase())) return [];
  try {
    return await cachedRelated(article.slug, article.kanal ?? null, article.rubrik ?? null, limit);
  } catch {
    return [];
  }
}
