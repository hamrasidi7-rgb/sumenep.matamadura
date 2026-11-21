import type { Prisma, PrismaClient } from "@prisma/client";

import { slugCandidate, slugify } from "@/lib/article-slug";

export { isValidSlug, MAX_SLUG, slugCandidate, slugify } from "@/lib/article-slug";

// Slugs: creation, uniqueness (live slugs AND history) and length.
// Adapted from Busacare lib/slug-artikel.ts — slugify, kandidatSlug,
// slugDipakaiArtikelLain, slugBebas. What is NOT ported: terapkanSlugBaru.
// In SUMENEP the database itself records old slugs (trigger
// article_slug_history, Fase 2), so the application only has to pick a free
// slug; the history row appears in the same transaction automatically.
//
// Rule kept from Busacare: a slug that still redirects for ANOTHER article is
// not free — a new article never hijacks an old URL. The same article may take
// its own old slug back (the trigger then removes it from the history).

type Db = PrismaClient | Prisma.TransactionClient;

/** Taken by another article — as its live slug or as one of its old slugs? */
export async function slugTakenByOther(db: Db, slug: string, articleId?: string): Promise<boolean> {
  const live = await db.article.findFirst({
    where: { slug, ...(articleId ? { id: { not: articleId } } : {}) },
    select: { id: true },
  });
  if (live) return true;
  const old = await db.articleSlugHistory.findUnique({ where: { slug }, select: { articleId: true } });
  return Boolean(old && old.articleId !== articleId);
}

/** First free slug for `base`: "judul", "judul-2", "judul-3", … */
export async function freeSlug(db: Db, base: string, articleId?: string): Promise<string> {
  const root = slugify(base) || "artikel";
  for (let n = 1; n <= 200; n++) {
    const candidate = slugCandidate(root, n);
    if (!(await slugTakenByOther(db, candidate, articleId))) return candidate;
  }
  throw new Error("Tidak menemukan slug yang bebas setelah 200 percobaan.");
}
