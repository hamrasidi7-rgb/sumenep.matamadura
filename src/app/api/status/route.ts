import { IS_PRODUCTION_SITE, SITE } from "@/lib/site";
import { describeDatabaseConfig } from "@/server/db/url";
import { setupStatus } from "@/server/deploy/status";

export const dynamic = "force-dynamic";

const presence = (name: string) => {
  const value = process.env[name];
  return value === undefined ? "tidak ada" : value.trim() === "" ? "kosong" : "ada";
};

// Public, value-free status: which build is live, indexing mode, how the start-up
// setup went (src/server/deploy/auto-setup.ts), and which configuration variable NAMES
// the running app can see (never their values), so a deploy can be checked from outside.
export function GET() {
  const related = Object.keys(process.env)
    .filter((name) => /^(?:DATABASE|DB|MYSQL|ADMIN|NEXT_PUBLIC_SITE_)(?:_|$)/.test(name) && name !== "DB_SOCKET")
    .sort();
  return Response.json(
    {
      build: process.env.SUMENEP_BUILD ?? "tidak diketahui",
      indexing: {
        mode: IS_PRODUCTION_SITE ? "production" : "staging",
        robots: IS_PRODUCTION_SITE ? "allow-public" : "disallow-all",
        siteUrl: SITE.url,
      },
      setup: setupStatus(),
      database: describeDatabaseConfig(),
      variabel: {
        DATABASE_URL: presence("DATABASE_URL"),
        ADMIN_EMAIL: presence("ADMIN_EMAIL"),
        ADMIN_PASSWORD: presence("ADMIN_PASSWORD"),
        NEXT_PUBLIC_SITE_ENV: presence("NEXT_PUBLIC_SITE_ENV"),
        NEXT_PUBLIC_SITE_URL: presence("NEXT_PUBLIC_SITE_URL"),
        namaTerkaitYangTerlihat: related,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
