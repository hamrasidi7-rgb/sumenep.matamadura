import type { ActivityActor, Prisma, PrismaClient } from "@prisma/client";

// Append-only audit trail. Entries can only be inserted: the database rejects
// UPDATE/DELETE/TRUNCATE (trigger) and the app role lacks those privileges.
// created_at is always set by the database.

type Db = PrismaClient | Prisma.TransactionClient;

export interface ActivityEntry {
  actor: ActivityActor;
  /** Required when actor = "ADMIN". */
  adminId?: number | null;
  /** dotted lowercase, e.g. "admin.bootstrap", "article.publish" */
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  meta?: Prisma.InputJsonObject;
  ip?: string | null;
  userAgent?: string | null;
}

export async function logActivity(db: Db, entry: ActivityEntry): Promise<void> {
  await db.activityLog.create({
    data: {
      actor: entry.actor,
      adminId: entry.adminId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary ?? "",
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 400) : null,
    },
  });
}
