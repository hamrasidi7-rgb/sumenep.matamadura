import type { MetadataRoute } from "next";

// Helper murni untuk mode indexing, robots.txt, dan sitemap.xml SUMENEP.
// Dirancang fail-closed: secara bawaan seluruh non-production / staging / preview
// tetap diblokir (Disallow: / dan noindex) agar situs pengembangan tidak terindeks.

const NON_PUBLIC_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** Memastikan URL situs adalah domain publik HTTPS (bukan localhost atau preview hostingersite.com). */
export function isHttpsPublicSiteUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || NON_PUBLIC_HOSTS.has(host)) return false;
    if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".hostingersite.com")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mengaktifkan mode indexing hanya bila NEXT_PUBLIC_SITE_ENV === "production"
 * DAN URL situs valid publik HTTPS. Mencegah kebocoran index pada staging/localhost.
 */
export function isProductionIndexing(siteEnv: string | undefined, siteUrl: string): boolean {
  return siteEnv?.trim() === "production" && isHttpsPublicSiteUrl(siteUrl);
}

export function buildRobotsConfig(isProduction: boolean, siteUrl: string): MetadataRoute.Robots {
  const cleanUrl = siteUrl.replace(/\/+$/, "");
  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/pratinjau/", "/cari"],
    },
    sitemap: `${cleanUrl}/sitemap.xml`,
    host: cleanUrl,
  };
}

export interface SitemapArticleInput {
  slug: string;
  lastModified?: Date;
}

export function buildSitemapEntries(input: {
  baseUrl: string;
  kanalSlugs: readonly string[];
  rubrikSlugs: readonly string[];
  authorSlugs: readonly string[];
  articles: readonly SitemapArticleInput[];
}): MetadataRoute.Sitemap {
  const base = input.baseUrl.replace(/\/+$/, "");
  const url = (path: string) => `${base}${path}`;

  let latestArticleDate: Date | undefined;
  const articleMap = new Map<string, Date | undefined>();
  for (const item of input.articles) {
    const slug = item.slug.trim();
    if (!slug) continue;
    const prev = articleMap.get(slug);
    const mod = item.lastModified;
    if (!articleMap.has(slug) || (mod && (!prev || mod > prev))) {
      articleMap.set(slug, mod);
    }
    if (mod && (!latestArticleDate || mod > latestArticleDate)) {
      latestArticleDate = mod;
    }
  }

  const entries: MetadataRoute.Sitemap = [
    {
      url: url("/"),
      ...(latestArticleDate ? { lastModified: latestArticleDate } : {}),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: url("/terbaru"),
      ...(latestArticleDate ? { lastModified: latestArticleDate } : {}),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: url("/pilihan"),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  for (const staticPath of [
    "/tentang-kami",
    "/kontak-redaksi",
    "/pedoman-media-siber",
    "/kebijakan-privasi",
  ]) {
    entries.push({ url: url(staticPath), changeFrequency: "monthly", priority: 0.4 });
  }

  for (const slug of new Set(input.kanalSlugs)) {
    entries.push({ url: url(`/kanal/${slug}`), changeFrequency: "daily", priority: 0.7 });
  }

  for (const slug of new Set(input.rubrikSlugs)) {
    entries.push({ url: url(`/rubrik/${slug}`), changeFrequency: "daily", priority: 0.7 });
  }

  for (const slug of new Set(input.authorSlugs)) {
    entries.push({ url: url(`/penulis/${slug}`), changeFrequency: "weekly", priority: 0.5 });
  }

  for (const [slug, lastModified] of articleMap.entries()) {
    entries.push({
      url: url(`/artikel/${slug}`),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return entries;
}
