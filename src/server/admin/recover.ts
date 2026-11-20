import type { PrismaClient } from "@prisma/client";

import { logActivity } from "@/server/activity-log";
import { hashPassword } from "@/server/auth/password";
import { adminEmailSchema, adminPasswordSchema } from "@/server/validation/admin";

// Recovery for the single Admin, run by an operator with database access
// (scripts/admin/recover.ts). There is no e-mail reset. Every action is
// written to the Activity Log with actor = CLI.

export class AdminMissingError extends Error {
  constructor() {
    super("Belum ada akun Admin. Jalankan admin:bootstrap terlebih dahulu.");
    this.name = "AdminMissingError";
  }
}

const ADMIN_ID = 1;

export interface AdminStatus {
  email: string;
  name: string;
  createdAt: Date;
  passwordChangedAt: Date;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  activeSessions: number;
}

async function requireAdmin(db: PrismaClient) {
  const admin = await db.adminUser.findUnique({ where: { id: ADMIN_ID } });
  if (!admin) throw new AdminMissingError();
  return admin;
}

/** Account state without any secret (no password hash, no session tokens). */
export async function getAdminStatus(db: PrismaClient, now = new Date()): Promise<AdminStatus> {
  const admin = await requireAdmin(db);
  const activeSessions = await db.adminSession.count({
    where: { adminId: ADMIN_ID, revokedAt: null, expiresAt: { gt: now } },
  });
  return {
    email: admin.email,
    name: admin.name,
    createdAt: admin.createdAt,
    passwordChangedAt: admin.passwordChangedAt,
    lastLoginAt: admin.lastLoginAt,
    failedLoginCount: admin.failedLoginCount,
    lockedUntil: admin.lockedUntil,
    activeSessions,
  };
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function revokeActiveSessions(tx: Tx, reason: string, now: Date): Promise<number> {
  const { count } = await tx.adminSession.updateMany({
    where: { adminId: ADMIN_ID, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count;
}

/** New password + unlock + every session revoked (old cookies stop working). */
export async function resetAdminPassword(db: PrismaClient, newPassword: string) {
  const password = adminPasswordSchema.parse(newPassword);
  await requireAdmin(db);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: ADMIN_ID },
      data: { passwordHash, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null },
    });
    const sessionsRevoked = await revokeActiveSessions(tx, "admin.recover.password_reset", now);
    await logActivity(tx, {
      actor: "CLI",
      adminId: ADMIN_ID,
      action: "admin.recover.password_reset",
      entityType: "admin_user",
      entityId: String(ADMIN_ID),
      summary: "Password Admin direset lewat CLI; semua sesi dicabut.",
      meta: { sessionsRevoked },
    });
    return { sessionsRevoked };
  });
}

/** Sign out everywhere, e.g. after a lost or stolen device. */
export async function revokeAllAdminSessions(db: PrismaClient) {
  await requireAdmin(db);
  const now = new Date();
  return db.$transaction(async (tx) => {
    const sessionsRevoked = await revokeActiveSessions(tx, "admin.recover.sessions_revoked", now);
    await logActivity(tx, {
      actor: "CLI",
      adminId: ADMIN_ID,
      action: "admin.recover.sessions_revoked",
      entityType: "admin_user",
      entityId: String(ADMIN_ID),
      summary: "Semua sesi Admin dicabut lewat CLI.",
      meta: { sessionsRevoked },
    });
    return { sessionsRevoked };
  });
}

/** Lift a temporary lockout (5 failed logins) before it expires. */
export async function unlockAdmin(db: PrismaClient) {
  const admin = await requireAdmin(db);
  return db.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: ADMIN_ID }, data: { failedLoginCount: 0, lockedUntil: null } });
    await logActivity(tx, {
      actor: "CLI",
      adminId: ADMIN_ID,
      action: "admin.recover.unlock",
      entityType: "admin_user",
      entityId: String(ADMIN_ID),
      summary: "Penguncian login Admin dibuka lewat CLI.",
      meta: { failedLoginCount: admin.failedLoginCount, wasLocked: Boolean(admin.lockedUntil && admin.lockedUntil > new Date()) },
    });
  });
}

/** Change the login e-mail (the account stays the same; there is only one). */
export async function changeAdminEmail(db: PrismaClient, newEmail: string) {
  const email = adminEmailSchema.parse(newEmail);
  const admin = await requireAdmin(db);
  return db.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: ADMIN_ID }, data: { email } });
    await logActivity(tx, {
      actor: "CLI",
      adminId: ADMIN_ID,
      action: "admin.recover.email_changed",
      entityType: "admin_user",
      entityId: String(ADMIN_ID),
      summary: "Email login Admin diubah lewat CLI.",
      meta: { from: admin.email, to: email },
    });
    return { email };
  });
}
