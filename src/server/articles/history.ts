import type { ArticleStatus, Prisma } from "@prisma/client";

// Slug history and status history of an article, written in the same
// transaction as the article change. PostgreSQL did this with AFTER triggers;
// a MariaDB user on shared hosting usually cannot create triggers, so the
// application records it. Every article write goes through
// src/server/articles/service.ts (createArticle and bump()), which calls these.
//
// Same rules as the PostgreSQL triggers:
//   - a slug that becomes live (new article, or renamed back) stops redirecting;
//   - a renamed article keeps its old slug as a redirect (301 to the new slug);
//   - every status an article enters is recorded (NULL → DRAFT on creation).

type Tx = Prisma.TransactionClient;

export interface TrackedState {
  slug: string;
  status: ArticleStatus;
}

/**
 * Current slug and status, with the row locked until the transaction ends, so
 * the "before" state recorded in the history is exactly what the update replaced.
 */
export async function lockArticleState(tx: Tx, id: string): Promise<TrackedState | null> {
  const rows = await tx.$queryRaw<TrackedState[]>`SELECT slug, status FROM article WHERE id = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

export async function recordArticleCreated(tx: Tx, article: { id: string } & TrackedState): Promise<void> {
  await tx.articleSlugHistory.deleteMany({ where: { slug: article.slug } });
  await tx.articleStatusChange.create({ data: { articleId: article.id, fromStatus: null, toStatus: article.status } });
}

export async function recordArticleChanged(tx: Tx, articleId: string, before: TrackedState, after: TrackedState): Promise<void> {
  if (after.slug !== before.slug) {
    await tx.articleSlugHistory.deleteMany({ where: { slug: after.slug } });
    await tx.articleSlugHistory.upsert({
      where: { slug: before.slug },
      create: { slug: before.slug, articleId },
      update: { articleId, createdAt: new Date() },
    });
  }
  if (after.status !== before.status) {
    await tx.articleStatusChange.create({ data: { articleId, fromStatus: before.status, toStatus: after.status } });
  }
}
