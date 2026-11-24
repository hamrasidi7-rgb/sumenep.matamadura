import { slugify } from "@/lib/article-slug";
import type { MediaDto } from "@/server/media/service";

export const SITE_PUBLIC_HOST = "sumenep.matamaduranews.com";
export const SITE_PUBLIC_ORIGIN = `https://${SITE_PUBLIC_HOST}`;

/** Estimasi waktu baca standar redaksi (~200 kata per menit, minimal 1 menit bila ada teks). */
export function estimateReadingMinutes(wordCount: number): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export interface SeoPreviewSummary {
  displayTitle: string;
  displayDescription: string;
  articlePath: string;
  canonicalDisplay: string;
  ogImage: MediaDto | null;
  suggestedSlug: string;
  slugDivergesFromTitle: boolean;
}

export function buildSeoPreview(input: {
  title: string;
  slug: string;
  standfirst: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  heroMedia: MediaDto | null;
  ogMedia: MediaDto | null;
}): SeoPreviewSummary {
  const cleanTitle = input.title.trim();
  const cleanSlug = input.slug.trim();
  const suggestedSlug = slugify(cleanTitle);
  const articlePath = cleanSlug ? `/artikel/${cleanSlug}` : "/artikel/...";
  const customCanonical = input.canonicalUrl.trim();

  return {
    displayTitle: input.seoTitle.trim() || cleanTitle || "Judul artikel",
    displayDescription:
      input.seoDescription.trim() || input.standfirst.trim() || "Ringkasan meta description akan tampil di sini…",
    articlePath,
    canonicalDisplay: customCanonical || `${SITE_PUBLIC_ORIGIN}${articlePath}`,
    ogImage: input.ogMedia ?? input.heroMedia ?? null,
    suggestedSlug,
    slugDivergesFromTitle: Boolean(suggestedSlug && cleanSlug && suggestedSlug !== cleanSlug),
  };
}
