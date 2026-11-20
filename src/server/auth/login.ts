import type { PrismaClient } from "@prisma/client";

import { logActivity } from "@/server/activity-log";
import { loginSchema } from "@/server/validation/auth";

import { dummyHash, isIpLimited, pruneAuthRecords, recentIpFailures, recordAttempt, registerWrongPassword } from "./attempts";
import { BusyError, enterIp, hashLimiter } from "./limiter";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { createSession, type RequestMeta } from "./sessions";
import { hashSessionToken, isWellFormedToken } from "./tokens";

// Login for the single Admin. Order of checks:
//   1. input (Zod)            → invalid_input   (field messages only, no account info)
//   2. per-IP failures (DB)   → rate_limited    (no password check at all)
//   3. per-IP parallel cap    → rate_limited
//   4. scrypt slot (limiter)  → rate_limited when the server is saturated
//   5. account locked         → locked          (dummy hash: same timing)
//   6. password               → bad_credentials (counts toward the 5-failure lockout)
// bad_credentials, locked and rate_limited are shown to the user as ONE message.

export type LoginFailure = "invalid_input" | "bad_credentials" | "locked" | "rate_limited";

export type LoginResult =
  | { ok: true; token: string; sessionId: string; expiresAt: Date }
  | { ok: false; reason: LoginFailure; fieldErrors?: Partial<Record<"email" | "password", string>> };

export interface LoginMeta extends RequestMeta {
  /** Cookie the browser already had: it is revoked so a planted session id never survives login. */
  previousToken?: string | null;
}

export async function attemptLogin(
  db: PrismaClient,
  input: { email: unknown; password: unknown },
  meta: LoginMeta,
  now = new Date(),
): Promise<LoginResult> {
  const attempt = (reason: "bad_credentials" | "locked" | "rate_limited" | "invalid_input", email: string) =>
    recordAttempt(db, { email, ip: meta.ip, reason, userAgent: meta.userAgent });

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    // Not stored: whatever was typed into a malformed email field (it is
    // sometimes the password) never reaches the database.
    await attempt("invalid_input", "");
    const fieldErrors: Partial<Record<"email" | "password", string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "email" || field === "password") && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { ok: false, reason: "invalid_input", fieldErrors };
  }
  const { email, password } = parsed.data;

  if (isIpLimited(await recentIpFailures(db, meta.ip, now))) {
    await attempt("rate_limited", email);
    return { ok: false, reason: "rate_limited" };
  }
  const release = enterIp(meta.ip);
  if (!release) {
    await attempt("rate_limited", email);
    return { ok: false, reason: "rate_limited" };
  }

  try {
    return await hashLimiter.run(async (): Promise<LoginResult> => {
      const admin = await db.adminUser.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, lockedUntil: true },
      });
      if (!admin) {
        await verifyPassword(password, await dummyHash());
        await attempt("bad_credentials", email);
        return { ok: false, reason: "bad_credentials" };
      }
      if (admin.lockedUntil && admin.lockedUntil > now) {
        await verifyPassword(password, await dummyHash());
        await attempt("locked", email);
        return { ok: false, reason: "locked" };
      }
      if (!(await verifyPassword(password, admin.passwordHash))) {
        await registerWrongPassword(db, meta, now);
        await attempt("bad_credentials", email);
        return { ok: false, reason: "bad_credentials" };
      }

      const rehash = needsRehash(admin.passwordHash) ? await hashPassword(password) : null;
      const session = await db.$transaction(async (tx) => {
        await tx.adminUser.update({
          where: { id: admin.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, ...(rehash ? { passwordHash: rehash } : {}) },
        });
        if (isWellFormedToken(meta.previousToken)) {
          await tx.adminSession.updateMany({
            where: { tokenHash: hashSessionToken(meta.previousToken), revokedAt: null },
            data: { revokedAt: now, revokedReason: "auth.login.replaced" },
          });
        }
        const created = await createSession(tx, meta, now);
        await logActivity(tx, {
          actor: "ADMIN",
          adminId: admin.id,
          action: "auth.login",
          entityType: "admin_session",
          entityId: created.sessionId,
          summary: "Login berhasil.",
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        await tx.loginAttempt.create({
          data: { email, ip: meta.ip, success: true, reason: "ok", userAgent: meta.userAgent?.slice(0, 400) ?? null },
        });
        return created;
      });
      await pruneAuthRecords(db, now);
      return { ok: true, ...session };
    });
  } catch (error) {
    if (error instanceof BusyError) {
      await attempt("rate_limited", email);
      return { ok: false, reason: "rate_limited" };
    }
    throw error;
  } finally {
    release();
  }
}
