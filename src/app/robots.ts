import type { MetadataRoute } from "next";

import { buildRobotsConfig } from "@/lib/seo-routing";
import { IS_PRODUCTION_SITE, SITE } from "@/lib/site";

// Staging (default fail-closed) blocks every crawler.
// Production opens public pages while disallowing admin, preview, internal APIs, and search.
export default function robots(): MetadataRoute.Robots {
  return buildRobotsConfig(IS_PRODUCTION_SITE, SITE.url);
}
