// Initial data: 5 kanal + 5 rubrik (src/content/sections.ts) and the Catatan
// Sumenep homepage band. Safe to run again: only missing rows are created.
//
//   npm run db:seed [-- --env-file <path>] [-- --yes]
import { parseArgs } from "node:util";

import type { PrismaClient } from "@prisma/client";

import { createPrismaClient, requireEnv } from "../../src/server/db/client";
import { seedInitialData } from "../../src/server/seed";
import { confirmTarget, loadEnv, runCli } from "../lib/cli";

const { values } = parseArgs({
  options: { "env-file": { type: "string" }, yes: { type: "boolean", default: false } },
});

let db: PrismaClient | undefined;

void runCli(
  async () => {
    loadEnv(values["env-file"]);
    const url = requireEnv("DIRECT_URL");
    await confirmTarget(url, "mengisi data awal", values.yes);
    db = createPrismaClient(url, { max: 1 });
    const result = await seedInitialData(db);
    const [kanal, rubrik] = await Promise.all([
      db.section.count({ where: { kind: "KANAL" } }),
      db.section.count({ where: { kind: "RUBRIK" } }),
    ]);
    console.log(
      `Seed selesai: ${result.sectionsCreated} kanal/rubrik baru` +
        `${result.homepageRubricCreated ? ", band Catatan Sumenep dipasang" : ""}. ` +
        `Total: ${kanal} kanal, ${rubrik} rubrik.`,
    );
  },
  async () => {
    await db?.$disconnect();
  },
);
