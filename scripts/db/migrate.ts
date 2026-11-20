// Apply pending migrations (prisma migrate deploy), then the runtime-role grants
// and UTC session settings (scripts/db/grants.ts). The same command for
// development, test and — after approval — production:
//
//   npm run db:migrate                               uses .env
//   npm run db:migrate -- --env-file .env.production.local --yes
//
// It never creates migrations and never resets data. To create a migration in
// development: npm run db:migrate:dev -- --name <change>
import { parseArgs } from "node:util";

import { requireEnv } from "../../src/server/db/client";
import { runBin } from "../lib/bin";
import { confirmTarget, loadEnv, Refusal, runCli } from "../lib/cli";
import { finalizeDatabase } from "./grants";

const { values } = parseArgs({
  options: { "env-file": { type: "string" }, yes: { type: "boolean", default: false } },
});

void runCli(async () => {
  loadEnv(values["env-file"]);
  const directUrl = requireEnv("DIRECT_URL");
  const databaseUrl = requireEnv("DATABASE_URL");
  const appRole = process.env.DB_APP_ROLE;
  if (!appRole) throw new Refusal("DB_APP_ROLE belum diisi (nama role runtime aplikasi).");
  await confirmTarget(directUrl, "menjalankan migrasi", values.yes);

  // The child gets our environment; Prisma does not override it with .env.
  const status = runBin("prisma", ["migrate", "deploy"]);
  if (status !== 0) throw new Error(`prisma migrate deploy gagal (exit ${status}).`);

  console.log(await finalizeDatabase({ directUrl, databaseUrl, appRole }));
});
