import { createHash } from "node:crypto";

import type { PrismaClient, SectionKind } from "@prisma/client";

import { hashPassword } from "@/server/auth/password";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** A valid test password (≥ 15 characters). Test databases only. */
export const TEST_PASSWORD = "uji garam kalianget 2026";
export const TEST_PASSWORD_2 = "uji pantai lombang 2027!";

export function makeAuthor(db: PrismaClient, slug = "redaksi") {
  return db.author.create({ data: { slug, name: "Redaksi", role: "Redaksi" } });
}

export function makeMedia(db: PrismaClient, name = "foto-uji") {
  return db.media.create({
    data: {
      storageKey: `media/2026/11/${name}.webp`,
      originalName: `${name}.jpg`,
      mimeType: "image/webp",
      sizeBytes: 123_456,
      width: 1600,
      height: 1067,
      sha256: sha256(name),
      alt: "Foto uji",
    },
  });
}

export function findSection(db: PrismaClient, kind: SectionKind, slug: string) {
  return db.section.findUniqueOrThrow({ where: { kind_slug: { kind, slug } } });
}

/** Admin row written directly (owner), for tests that are not about bootstrap. */
export async function insertAdmin(owner: PrismaClient, password = TEST_PASSWORD) {
  return owner.adminUser.create({
    data: { email: "admin@sumenep.test", name: "Admin Uji", passwordHash: await hashPassword(password) },
  });
}

/** Session row as the Fase 3 login flow will create it (token hash only). */
export function insertSession(
  db: PrismaClient,
  options: { token: string; lastSeenAt?: Date; createdAt?: Date; hours?: number; revoked?: boolean },
) {
  const lastSeenAt = options.lastSeenAt ?? new Date();
  const createdAt = options.createdAt ?? lastSeenAt;
  return db.adminSession.create({
    data: {
      tokenHash: sha256(options.token),
      createdAt,
      lastSeenAt,
      expiresAt: new Date(lastSeenAt.getTime() + (options.hours ?? 8) * 3600_000),
      revokedAt: options.revoked ? new Date() : null,
    },
  });
}
