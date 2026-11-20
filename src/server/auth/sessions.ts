import type { PrismaClient } from "@prisma/client";

import { EXTEND_AFTER_MS, SESSION_TTL_MS } from "./config";
import { generateSessionToken, hashSessionToken, isWellFormedToken } from "./tokens";

// Database sessions for the single Admin. Framework-free (tested directly);
// src/server/auth/next.ts connects them to cookies and requests.

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const ADMIN_ID = 1;

export interface ValidSession {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  admin: { id: number; email: string; name: string; lastLoginAt: Date | null };
}

export interface RequestMeta {
  ip: string;
  userAgent?: string | null;
}

/** New session for the Admin. Returns the raw token for the cookie — it is never stored. */
export async function createSession(db: Db, meta: RequestMeta, now = new Date()) {
  const token = generateSessionToken();
  const session = await db.adminSession.create({
    data: {
      adminId: ADMIN_ID,
      tokenHash: hashSessionToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      ip: meta.ip,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 400) : null,
    },
    select: { id: true, expiresAt: true },
  });
  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

/**
 * The session for this cookie value, or null when it is malformed, unknown,
 * revoked, expired, or older than the last password change. With `extend`, valid
 * activity slides the 8-hour window forward (at most once every 5 minutes).
 */
export async function findValidSession(
  db: PrismaClient,
  token: string | undefined | null,
  options: { now?: Date; extend?: boolean } = {},
): Promise<ValidSession | null> {
  if (!isWellFormedToken(token)) return null;
  const now = options.now ?? new Date();
  const row = await db.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { admin: { select: { id: true, email: true, name: true, lastLoginAt: true, passwordChangedAt: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  if (row.createdAt < row.admin.passwordChangedAt) return null; // belt and braces: a password change revokes it anyway

  let { lastSeenAt, expiresAt } = row;
  if (options.extend !== false && now.getTime() - lastSeenAt.getTime() >= EXTEND_AFTER_MS) {
    const nextExpiry = new Date(now.getTime() + SESSION_TTL_MS);
    const { count } = await db.adminSession.updateMany({
      where: { id: row.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastSeenAt: now, expiresAt: nextExpiry },
    });
    if (count === 0) return null; // revoked in the meantime
    lastSeenAt = now;
    expiresAt = nextExpiry;
  }
  const { passwordChangedAt: _ignored, ...admin } = row.admin;
  return { id: row.id, createdAt: row.createdAt, lastSeenAt, expiresAt, admin };
}

export async function revokeSession(db: Db, sessionId: string, reason: string, now = new Date()): Promise<boolean> {
  const { count } = await db.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count > 0;
}

/** Revoke every active session (optionally keeping one). Returns how many were revoked. */
export async function revokeAllSessions(db: Db, reason: string, options: { exceptId?: string; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const { count } = await db.adminSession.updateMany({
    where: {
      adminId: ADMIN_ID,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(options.exceptId ? { id: { not: options.exceptId } } : {}),
    },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count;
}

export interface SessionSummary {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export function listActiveSessions(db: PrismaClient, now = new Date()): Promise<SessionSummary[]> {
  return db.adminSession.findMany({
    where: { adminId: ADMIN_ID, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true },
  });
}
