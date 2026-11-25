import type { MetadataRoute } from "next";

import { CMS_ARTICLES, getAuthors, getSections } from "@/lib/content";
import { buildSitemapEntries, type SitemapArticleInput } from "@/lib/seo-routing";
import { SITE } from "@/lib/site";
import { publicWhere } from "@/server/articles/status";
import { getDb } from "@/server/db";
import { configuredDatabaseParts } from "@/server/db/url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [kanals, rubriks, authors] = await Promise.all([
    getSections("kanal"),
    getSections("rubrik"),
    getAuthors(),
  ]);

  const articles: SitemapArticleInput[] = [];

  if (CMS_ARTICLES && configuredDatabaseParts(process.env)) {
    try {
      const dbRows = await getDb().article.findMany({
        where: publicWhere(),
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: 45_000,
        select: { slug: true, updatedAt: true, publishedAt: true },
      });
      for (const row of dbRows) {
        articles.push({ slug: row.slug, lastModified: row.updatedAt ?? row.publishedAt ?? undefined });
      }
    } catch {
      // Abaikan bila database belum terjangkau saat build.
    }
  }

  return buildSitemapEntries({
    baseUrl: SITE.url,
    kanalSlugs: kanals.map((s) => s.slug),
    rubrikSlugs: rubriks.map((s) => s.slug),
    authorSlugs: authors.map((a) => a.slug),
    articles,
  });
}
