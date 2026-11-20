import "server-only";

import { ARTICLES, AUTHORS, HOMEPAGE } from "@/content/seed";
import { SECTIONS } from "@/content/sections";
import type { Article, Author, EditorialNote, Section, SectionKind } from "@/content/types";

// Content adapter. Today it reads the demo seed; in Tahap 5 each function is
// re-implemented on top of the Payload Local API with the same signatures.
// Components import from here only — never from src/content/seed.ts.

export const CONTENT_SOURCE: "seed" | "cms" = "seed";

/** Article with relations populated (what Payload returns with depth ≥ 1). */
export type ArticleView = Omit<Article, "author"> & {
  author: Author;
  /** Label shown above the title: the rubrik if any, else the kanal. */
  section?: Section;
};

const FALLBACK_AUTHOR: Author = { slug: "redaksi", name: "Redaksi", role: "Redaksi" };

function toView(a: Article): ArticleView {
  const kind: SectionKind = a.rubrik ? "rubrik" : "kanal";
  const slug = a.rubrik ?? a.kanal;
  return {
    ...a,
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
  return AUTHORS.find((a) => a.slug === slug) ?? null;
}

export async function getAuthors(): Promise<Author[]> {
  return AUTHORS;
}

export async function getArticle(slug: string): Promise<ArticleView | null> {
  const a = ARTICLES.find((x) => x.slug === slug);
  return a ? toView(a) : null;
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
