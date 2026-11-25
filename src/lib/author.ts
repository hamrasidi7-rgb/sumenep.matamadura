import type { Article, Author, Section } from "@/content/types";

/**
 * Fallback official newsroom author when a legacy or incomplete record has no
 * resolved author profile. Matches the seeded "redaksi" profile.
 */
export const DEFAULT_AUTHOR: Author = {
  slug: "redaksi",
  name: "Redaksi SUMENEP",
  role: "Tim Redaksi",
  bio: "Tim redaksi SUMENEP – Mata Madura menulis catatan, berita, dan perspektif tentang Sumenep dari daratan hingga kepulauan.",
};

/**
 * Normalizes an author record for public display, guaranteeing consistent
 * fallback identity without mutating intentional empty bios on named authors.
 */
export function resolvePublicAuthor(author?: Partial<Author> | null): Author {
  const rawName = author?.name?.trim() ?? "";
  const rawSlug = author?.slug?.trim() ?? "";
  if (!rawName) return DEFAULT_AUTHOR;

  const slug = rawSlug || DEFAULT_AUTHOR.slug;
  const role = author?.role?.trim() || (slug === DEFAULT_AUTHOR.slug ? DEFAULT_AUTHOR.role : "Penulis");
  const bio = author?.bio?.trim();
  const avatar = author?.avatar?.src ? author.avatar : undefined;

  return {
    slug,
    name: rawName,
    role,
    ...(bio ? { bio } : {}),
    ...(avatar ? { avatar } : {}),
  };
}

/** Single-letter monogram shown when no profile photo is uploaded. */
export function authorInitial(name?: string | null): string {
  const clean = name?.trim() ?? "";
  if (!clean) return "R";
  const withoutPrefix = clean.replace(/^Redaksi\s+/i, "").trim();
  const source = withoutPrefix || clean;
  return source.charAt(0).toUpperCase() || "R";
}

/**
 * Structured NewsArticle JSON-LD consistent with the article page,
 * Author Box, OpenGraph metadata, and admin SEO preview.
 */
export function buildArticleJsonLd(
  article: Pick<Article, "slug" | "title" | "standfirst" | "publishedAt" | "updatedAt" | "hero" | "seo"> & {
    author: Author;
    section?: Section | null;
  },
  siteUrl: string,
  siteName: string,
) {
  const baseUrl = siteUrl.replace(/\/+$/, "");
  const author = resolvePublicAuthor(article.author);
  const articleUrl = `${baseUrl}/artikel/${article.slug}`;
  const rawHero = article.seo?.ogImage?.src ?? article.hero?.src;
  const imageUrl = rawHero ? (rawHero.startsWith("http") ? rawHero : `${baseUrl}${rawHero}`) : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.seo?.title ?? article.title,
    description: article.seo?.description ?? article.standfirst,
    url: articleUrl,
    mainEntityOfPage: articleUrl,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    ...(article.section ? { articleSection: article.section.name } : {}),
    ...(imageUrl ? { image: [imageUrl] } : {}),
    author: {
      "@type": author.slug === "redaksi" ? "Organization" : "Person",
      name: author.name,
      url: `${baseUrl}/penulis/${author.slug}`,
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: baseUrl,
    },
  };
}

export function serializeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
