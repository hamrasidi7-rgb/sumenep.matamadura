import { setupStatus } from "@/server/deploy/status";

export const dynamic = "force-dynamic";

const presence = (name: string) => {
  const value = process.env[name];
  return value === undefined ? "tidak ada" : value.trim() === "" ? "kosong" : "ada";
};

// Public, value-free status: which build is live, how the start-up setup went
// (src/server/deploy/auto-setup.ts), and which configuration variable NAMES the
// running app can see (never their values), so a deploy can be checked from outside.
export function GET() {
  const related = Object.keys(process.env)
    .filter((name) => /^(?:DATABASE|DB|MYSQL|ADMIN)(?:_|$)/.test(name))
    .sort();
  return Response.json(
    {
      build: process.env.SUMENEP_BUILD ?? "tidak diketahui",
      setup: setupStatus(),
      variabel: {
        DATABASE_URL: presence("DATABASE_URL"),
        ADMIN_EMAIL: presence("ADMIN_EMAIL"),
        ADMIN_PASSWORD: presence("ADMIN_PASSWORD"),
        namaTerkaitYangTerlihat: related,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
