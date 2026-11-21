import type { ArticleStatus, Prisma } from "@prisma/client";

// What an article IS for readers and editors, derived from status +
// published_at + deleted_at (no extra column). One definition shared by the
// list labels, the list filter (database) and the public queries.
// Adapted from Busacare lib/status-artikel.ts (draft / terjadwal / terbit),
// extended with arsip and sampah.

export type ArticleState = "draf" | "terjadwal" | "terbit" | "arsip" | "sampah";
export type StateFilter = ArticleState | "semua";

export const STATE_LABEL: Record<ArticleState, string> = {
  draf: "Draf",
  terjadwal: "Terjadwal",
  terbit: "Terbit",
  arsip: "Arsip",
  sampah: "Tempat sampah",
};

export const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "draf", label: "Draf" },
  { value: "terjadwal", label: "Terjadwal" },
  { value: "terbit", label: "Terbit" },
  { value: "arsip", label: "Arsip" },
  { value: "sampah", label: "Tempat sampah" },
];

export function stateFilter(value: unknown): StateFilter {
  return STATE_FILTERS.some((f) => f.value === value) ? (value as StateFilter) : "semua";
}

export function articleState(
  article: { status: ArticleStatus; publishedAt: Date | null; deletedAt: Date | null },
  now = new Date(),
): ArticleState {
  if (article.deletedAt) return "sampah";
  if (article.status === "ARCHIVED") return "arsip";
  if (article.status === "DRAFT") return "draf";
  return article.publishedAt && article.publishedAt > now ? "terjadwal" : "terbit";
}

/** The same rules as a Prisma filter. "semua" = everything except the trash. */
export function stateWhere(state: StateFilter, now = new Date()): Prisma.ArticleWhereInput {
  switch (state) {
    case "sampah":
      return { deletedAt: { not: null } };
    case "arsip":
      return { deletedAt: null, status: "ARCHIVED" };
    case "draf":
      return { deletedAt: null, status: "DRAFT" };
    case "terjadwal":
      return { deletedAt: null, status: "PUBLISHED", publishedAt: { gt: now } };
    case "terbit":
      return { deletedAt: null, status: "PUBLISHED", publishedAt: { lte: now } };
    default:
      return { deletedAt: null };
  }
}

/** Visible to the public: published, publish time reached, not archived, not in the trash. */
export function publicWhere(now = new Date()): Prisma.ArticleWhereInput {
  return stateWhere("terbit", now);
}
