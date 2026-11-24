import { setupStatus } from "@/server/deploy/status";

export const dynamic = "force-dynamic";

// Public, value-free status: which build is live and how the start-up setup went
// (src/server/deploy/auto-setup.ts), so a deploy can be checked from outside.
export function GET() {
  return Response.json(
    { build: process.env.SUMENEP_BUILD ?? "tidak diketahui", setup: setupStatus() },
    { headers: { "cache-control": "no-store" } },
  );
}
