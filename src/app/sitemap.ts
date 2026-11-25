import type { MetadataRoute } from "next";

import { CMS_ARTICLES, getAllArticleSlugs, getAuthors, getSections } from "@/lib/content";
import { buildSitemapEntries, type SitemapArticleInput } from "@/lib/seo-routing";
import { SITE } from "@/lib/site";
import { publicWhere } from "@/server/articles/status";
import { getDb } from "@/server/db";
import { configuredDatabaseParts } from "@/server/db/url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [kanals, rubriks, authors, seedSlugs] = await Promise.all([
    getSections("kanal"),
    getSections("rubrik"),
    getAuthors(),
    getAllArticleSlugs(),
  ]);

  const articles: SitemapArticleInput[] = [];

  if (CMS_ARTICLES && configuredDatabaseParts(process.env)) {
    const dbRows = await getDb().article.findMany({
      where: publicWhere(),
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 45_000,
      select: { slug: true, updatedAt: true, publishedAt: true },
    });
    for (const row of dbRows) {
      articles.push({ slug: row.slug, lastModified: row.updatedAt ?? row.publishedAt ?? undefined });
    }
  }

  for (const slug of seedSlugs) {
    articles.push({ slug });
  }

  return buildSitemapEntries({
    baseUrl: SITE.url,
    kanalSlugs: kanals.map((s) => s.slug),
    rubrikSlugs: rubriks.map((s) => s.slug),
    authorSlugs: authors.map((a) => a.slug),
    articles,
  });
}
