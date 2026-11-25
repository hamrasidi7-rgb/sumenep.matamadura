import type { Metadata } from "next";

import type { ArticleView } from "@/lib/content";

export interface SiteSocialDefaults {
  url: string;
  name: string;
  locale: string;
  description: string;
}

const MAX_SOCIAL_DESCRIPTION = 160;
const FALLBACK_OG_IMAGE = {
  src: "/og-default.png",
  width: 1200,
  height: 630,
};

/**
 * Menormalkan spasi/baris baru dan memangkas deskripsi sosial media hingga
 * maksimal `maxLength` karakter (bawaan 160) pada batas kata yang rapi.
 */
export function truncateSocialDescription(raw: string | null | undefined, maxLength = MAX_SOCIAL_DESCRIPTION): string {
  const clean = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;

  const limit = Math.max(1, maxLength - 1);
  const sliced = clean.slice(0, limit);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(limit * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[\s,.;:–—-]+$/u, "")}…`;
}

function toAbsoluteUrl(rawPath: string, siteUrl: string): string {
  try {
    return new URL(rawPath, siteUrl).toString();
  } catch {
    const base = siteUrl.replace(/\/+$/, "");
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    return `${base}${path}`;
  }
}

function imageMimeFromUrl(url: string): string | undefined {
  const lower = url.split(/[?#]/)[0].toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return undefined;
}

/**
 * Menyusun metadata SEO, Open Graph (WhatsApp/Facebook), dan Twitter Card (X)
 * untuk halaman detail artikel:
 * - Judul utama = judul artikel (atau override SEO title jika diisi)
 * - Deskripsi = ringkasan lead/standfirst (maksimal 160 karakter)
 * - Thumbnail = foto utama artikel (URL absolut, width/height/alt/type)
 */
export function buildArticleMetadata(article: ArticleView, site: SiteSocialDefaults): Metadata {
  const title = (article.seo?.title?.trim() || article.title).replace(/\s+/g, " ").trim();
  const rawDescription = article.seo?.description?.trim() || article.standfirst || site.description;
  const description = truncateSocialDescription(rawDescription, MAX_SOCIAL_DESCRIPTION);

  const canonicalPath = article.seo?.canonicalUrl?.trim() || `/artikel/${article.slug}`;
  const articleUrl = toAbsoluteUrl(canonicalPath, site.url);

  const chosenImage =
    article.seo?.ogImage && !article.seo.ogImage.src.endsWith(".svg")
      ? article.seo.ogImage
      : !article.hero.src.endsWith(".svg")
        ? article.hero
        : {
            src: FALLBACK_OG_IMAGE.src,
            width: FALLBACK_OG_IMAGE.width,
            height: FALLBACK_OG_IMAGE.height,
            alt: title,
          };

  const imageUrl = toAbsoluteUrl(chosenImage.src, site.url);
  const imageAlt = chosenImage.alt?.trim() || title;
  const imageType = imageMimeFromUrl(imageUrl);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "article",
      url: articleUrl,
      siteName: site.name,
      locale: site.locale,
      title,
      description,
      publishedTime: article.publishedAt,
      ...(article.updatedAt ? { modifiedTime: article.updatedAt } : {}),
      authors: [article.author.name],
      ...(article.section ? { section: article.section.name } : {}),
      ...(article.tags.length > 0 ? { tags: article.tags } : {}),
      images: [
        {
          url: imageUrl,
          secureUrl: imageUrl.startsWith("https://") ? imageUrl : undefined,
          width: chosenImage.width,
          height: chosenImage.height,
          alt: imageAlt,
          ...(imageType ? { type: imageType } : {}),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl, alt: imageAlt }],
    },
  };
}
