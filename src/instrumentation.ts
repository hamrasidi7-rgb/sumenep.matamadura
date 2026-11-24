// Next.js calls register() once when a server starts. In production (`next start`,
// not during `next build`) it starts the SUMENEP setup in the background:
// database tables, initial data, the Admin from ADMIN_EMAIL/ADMIN_PASSWORD, and
// the media folder (src/server/deploy/auto-setup.ts). The result is on /api/status.
// SUMENEP_AUTO_SETUP=off switches it off (the E2E runner does).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const enabled =
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PHASE !== "phase-production-build" &&
      (process.env.SUMENEP_AUTO_SETUP ?? "").trim().toLowerCase() !== "off";
    if (enabled) {
      const { runAutoSetup } = await import("./server/deploy/auto-setup");
      void runAutoSetup();
    }
  }
}
