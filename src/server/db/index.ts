import "server-only";

import type { PrismaClient } from "@prisma/client";

import { createPrismaClient } from "./client";
import { runtimeDatabaseUrl } from "./url";

// The web app's database client (runtime role, DATABASE_URL). Created on first
// use, so `next build` never needs a database, and reused across hot reloads.
// DATABASE_URL is read tolerantly (unencoded password, "localhost"): see ./url.ts.

const globalForDb = globalThis as unknown as { sumenepDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForDb.sumenepDb) globalForDb.sumenepDb = createPrismaClient(runtimeDatabaseUrl());
  return globalForDb.sumenepDb;
}
