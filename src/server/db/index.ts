import "server-only";

import type { PrismaClient } from "@prisma/client";

import { createPrismaClient, requireEnv } from "./client";

// The web app's database client (runtime role, DATABASE_URL). Created on first
// use, so `next build` never needs a database, and reused across hot reloads.

const globalForDb = globalThis as unknown as { sumenepDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForDb.sumenepDb) globalForDb.sumenepDb = createPrismaClient(requireEnv("DATABASE_URL"));
  return globalForDb.sumenepDb;
}
