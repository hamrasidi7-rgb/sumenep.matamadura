import type { PrismaClient } from "@prisma/client";

import { logActivity } from "@/server/activity-log";
import { changePasswordSchema } from "@/server/validation/auth";

import { dummyHash, isIpLimited, recentIpFailures, recordAttempt, registerWrongPassword } from "./attempts";
import { BusyError, hashLimiter } from "./limiter";
import { hashPassword, verifyPassword } from "./password";
import { createSession, revokeAllSessions, type RequestMeta } from "./sessions";

// Password change from the CMS (logged-in Admin). The current password is
// required and counts toward the same lockout as login. On success EVERY
// session is revoked — other devices are signed out — and this device gets a
// brand-new session (new token), so a stolen old cookie stops working too.

type Field = "currentPassword" | "newPassword" | "confirmPassword";

export type ChangePasswordResult =
  | { ok: true; token: string; sessionId: string; expiresAt: Date; sessionsRevoked: number }
  | { ok: false; reason: "invalid_input" | "wrong_password" | "locked" | "rate_limited"; fieldErrors?: Partial<Record<Field, string>> };

export async function changePassword(
  db: PrismaClient,
  input: Record<Field, unknown>,
  meta: RequestMeta,
  now = new Date(),
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<Field, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { ok: false, reason: "invalid_input", fieldErrors };
  }
  const { currentPassword, newPassword } = parsed.data;

  const admin = await db.adminUser.findUniqueOrThrow({ where: { id: 1 }, select: { email: true } });
  if (isIpLimited(await recentIpFailures(db, meta.ip, now))) {
    await recordAttempt(db, { email: admin.email, ip: meta.ip, reason: "rate_limited", userAgent: meta.userAgent });
    return { ok: false, reason: "rate_limited" };
  }

  try {
    return await hashLimiter.run(async (): Promise<ChangePasswordResult> => {
      const row = await db.adminUser.findUniqueOrThrow({ where: { id: 1 }, select: { passwordHash: true, lockedUntil: true } });
      if (row.lockedUntil && row.lockedUntil > now) {
        await verifyPassword(currentPassword, await dummyHash());
        await recordAttempt(db, { email: admin.email, ip: meta.ip, reason: "locked", userAgent: meta.userAgent });
        return { ok: false, reason: "locked" };
      }
      if (!(await verifyPassword(currentPassword, row.passwordHash))) {
        await registerWrongPassword(db, meta, now);
        await recordAttempt(db, { email: admin.email, ip: meta.ip, reason: "bad_credentials", userAgent: meta.userAgent });
        return { ok: false, reason: "wrong_password", fieldErrors: { currentPassword: "Password saat ini salah." } };
      }

      const passwordHash = await hashPassword(newPassword);
      return db.$transaction(async (tx) => {
        await tx.adminUser.update({
          where: { id: 1 },
          data: { passwordHash, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null },
        });
        const sessionsRevoked = await revokeAllSessions(tx, "auth.password_changed", { now });
        const session = await createSession(tx, meta, now);
        await logActivity(tx, {
          actor: "ADMIN",
          adminId: 1,
          action: "auth.password_changed",
          entityType: "admin_user",
          entityId: "1",
          summary: "Password Admin diganti; semua sesi lama dicabut.",
          meta: { sessionsRevoked },
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        return { ok: true as const, ...session, sessionsRevoked };
      });
    });
  } catch (error) {
    if (error instanceof BusyError) return { ok: false, reason: "rate_limited" };
    throw error;
  }
}
