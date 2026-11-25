import "server-only";

import { unstable_cache } from "next/cache";

import type { Section, SectionKind } from "@/content/types";
import type { ArticleView, Paginated } from "@/lib/content";
import { ARTICLES_TAG } from "@/server/articles/public";
import { getDb } from "@/server/db";

import {
  publicArticleList,
  publicFeaturedSlugs,
  publicHomepageData,
  publicSectionBySlug,
  publicSectionsList,
  type PublicArticleListOptions,
} from "./queries";
import type { ResolvedHomepageSlots } from "./slots";

// Pembacaan publik beranda & daftar CMS melalui Next.js data cache bertag
// `articles`. Setiap perubahan di /admin/hero, /admin/pengaturan, atau
// /admin/artikel langsung memanggil `refreshPublicArticles()` sehingga cache
// terinvalidasi seketika.

const CACHE_SECONDS = Number(process.env.CMS_CACHE_SECONDS) || 60;
const options = { tags: [ARTICLES_TAG], revalidate: CACHE_SECONDS };

export const cachedPublicHomepage = unstable_cache(
  async (): Promise<ResolvedHomepageSlots | null> => publicHomepageData(getDb()),
  ["cms-public-homepage"],
  options,
);

export const cachedPublicSections = unstable_cache(
  async (kind?: SectionKind): Promise<Section[]> => publicSectionsList(getDb(), kind),
  ["cms-public-sections"],
  options,
);

export const cachedPublicSection = unstable_cache(
  async (kind: SectionKind, slug: string): Promise<Section | null> => publicSectionBySlug(getDb(), kind, slug),
  ["cms-public-section"],
  options,
);

export const cachedPublicFeaturedSlugs = unstable_cache(
  async (): Promise<string[]> => publicFeaturedSlugs(getDb()),
  ["cms-public-featured-slugs"],
  options,
);

export const cachedPublicArticleList = unstable_cache(
  async (
    kind: SectionKind | "",
    section: string,
    author: string,
    slugsKey: string,
    page: number,
    perPage: number,
  ): Promise<Paginated<ArticleView>> => {
    const opts: PublicArticleListOptions = {
      ...(kind ? { kind } : {}),
      ...(section ? { section } : {}),
      ...(author ? { author } : {}),
      ...(slugsKey ? { slugs: slugsKey.split(",") } : {}),
      page,
      perPage,
    };
    return publicArticleList(getDb(), opts);
  },
  ["cms-public-article-list"],
  options,
);
