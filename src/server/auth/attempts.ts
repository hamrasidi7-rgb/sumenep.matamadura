import type { PrismaClient } from "@prisma/client";

import { logActivity } from "@/server/activity-log";

import { AUTH, IP_WINDOW_MS, LOCKOUT_MS } from "./config";
import { hashPassword } from "./password";

// Shared by login and password change: every wrong password counts toward the
// same per-IP limit and the same account lockout.

export type AttemptReason = "ok" | "bad_credentials" | "locked" | "rate_limited" | "invalid_input";

export async function recordAttempt(
  db: PrismaClient,
  entry: { email: string; ip: string; reason: AttemptReason; userAgent?: string | null },
): Promise<void> {
  await db.loginAttempt.create({
    data: {
      email: entry.email.slice(0, 254),
      ip: entry.ip,
      success: entry.reason === "ok",
      reason: entry.reason,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 400) : null,
    },
  });
}

/** Failed attempts from this IP inside the window (rate-limited ones are not counted again). */
export async function recentIpFailures(db: PrismaClient, ip: string, now = new Date()): Promise<number> {
  return db.loginAttempt.count({
    where: {
      ip,
      success: false,
      reason: { not: "rate_limited" },
      createdAt: { gt: new Date(now.getTime() - IP_WINDOW_MS) },
    },
  });
}

export function isIpLimited(failures: number): boolean {
  return failures >= AUTH.ipMaxFailures;
}

/**
 * One more wrong password for the Admin. The row is locked (SELECT … FOR UPDATE)
 * so parallel attempts cannot skip the count. The 5th consecutive failure locks
 * the account for 15 minutes; an expired lock starts the count again.
 */
export async function registerWrongPassword(
  db: PrismaClient,
  meta: { ip: string; userAgent?: string | null },
  now = new Date(),
): Promise<{ lockedNow: boolean; lockedUntil: Date | null }> {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ failed: number; locked_until: Date | null }>>`
      SELECT failed_login_count AS failed, locked_until FROM admin_user WHERE id = 1 FOR UPDATE`;
    if (!row) return { lockedNow: false, lockedUntil: null };
    const lockExpired = row.locked_until !== null && row.locked_until <= now;
    const failed = (lockExpired ? 0 : row.failed) + 1;
    const lockedNow = failed >= AUTH.lockoutThreshold;
    const lockedUntil = lockedNow ? new Date(now.getTime() + LOCKOUT_MS) : lockExpired ? null : row.locked_until;
    await tx.adminUser.update({
      where: { id: 1 },
      data: { failedLoginCount: Math.min(failed, AUTH.lockoutThreshold), lockedUntil },
    });
    if (lockedNow) {
      await logActivity(tx, {
        actor: "SYSTEM",
        action: "auth.lockout",
        entityType: "admin_user",
        entityId: "1",
        summary: `Login dikunci ${AUTH.lockoutMinutes} menit setelah ${AUTH.lockoutThreshold} kali password salah.`,
        meta: { until: lockedUntil?.toISOString() ?? null },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return { lockedNow, lockedUntil };
  });
}

let dummy: Promise<string> | undefined;

/**
 * A real scrypt hash of a random value. Verifying against it when the email is
 * unknown or the account is locked makes those answers take as long as a
 * wrong password, so response time does not reveal the Admin's email.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(`dummy-${Math.random()}-${Date.now()}`);
  return dummy;
}

/** Old attempts and ended sessions are not kept forever. */
export async function pruneAuthRecords(db: PrismaClient, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - AUTH.retentionDays * 24 * 3600_000);
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await db.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
}
