import type { MetadataRoute } from "next";

import { IS_PRODUCTION_SITE, SITE } from "@/lib/site";

// Staging (default) blocks every crawler. Full sitemap/RSS arrive in Tahap 7.
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_SITE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cari"] },
    host: SITE.url,
  };
}
