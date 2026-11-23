import "server-only";

import { unstable_cache, updateTag } from "next/cache";

import type { ArticleView } from "@/lib/content";
import { getDb } from "@/server/db";

import { publicArticleView, publicRedirectTarget, publicRelatedViews } from "./view";

// Public reads of CMS articles, through the Next.js data cache (design:
// docs/06-cache-seo.md). Pages that use them render dynamically — their HTML
// is never stored by the Hostinger CDN — while the database is asked at most
// once per CACHE_SECONDS per article, and immediately again after any change
// made in the CMS (updateTag in the Server Actions).
//
// A scheduled article shows up at the latest CACHE_SECONDS after its time.

export const ARTICLES_TAG = "articles";
const CACHE_SECONDS = Number(process.env.CMS_CACHE_SECONDS) || 60;
const options = { tags: [ARTICLES_TAG], revalidate: CACHE_SECONDS };

export const cachedPublicArticle = unstable_cache(
  async (slug: string): Promise<ArticleView | null> => publicArticleView(getDb(), slug),
  ["cms-public-article"],
  options,
);

export const cachedRedirectTarget = unstable_cache(
  async (slug: string): Promise<string | null> => publicRedirectTarget(getDb(), slug),
  ["cms-public-redirect"],
  options,
);

export const cachedRelated = unstable_cache(
  async (slug: string, kanal: string | null, rubrik: string | null, limit: number): Promise<ArticleView[]> =>
    publicRelatedViews(getDb(), { slug, kanal: kanal ?? undefined, rubrik: rubrik ?? undefined }, limit),
  ["cms-public-related"],
  options,
);

/** Call from every Server Action that changes what readers can see. */
export function refreshPublicArticles(): void {
  updateTag(ARTICLES_TAG);
}
