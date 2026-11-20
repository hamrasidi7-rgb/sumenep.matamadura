import { Prisma } from "@prisma/client";

/** Unique / primary-key conflict (Prisma P2002, PostgreSQL 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
