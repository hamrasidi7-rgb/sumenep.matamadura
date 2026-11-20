"use server";

import { redirect } from "next/navigation";

import { logActivity } from "@/server/activity-log";
import { attemptLogin } from "@/server/auth/login";
import { LOGIN_FAILED_MESSAGE } from "@/server/auth/messages";
import {
  assertSameOrigin,
  clearSessionCookie,
  getAdminSession,
  readSessionToken,
  requestMeta,
  requireAdmin,
  setSessionCookie,
} from "@/server/auth/next";
import { changePassword } from "@/server/auth/password-change";
import { safeNextPath } from "@/server/auth/redirect";
import { revokeAllSessions, revokeSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db";
import { formFields, sessionIdSchema } from "@/server/validation/auth";

// Server Actions of the CMS authentication. Each one, in this order:
//   1. assertSameOrigin()  – CSRF (Next.js lets requests without Origin through)
//   2. requireAdmin()      – session checked in the database (except login)
//   3. Zod validation of every field
// Return values carry only what the form displays — never tokens or hashes.

export interface LoginState {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  await assertSameOrigin();
  const fields = formFields(formData);
  const meta = await requestMeta();
  const result = await attemptLogin(
    getDb(),
    { email: fields.email, password: fields.password },
    { ...meta, previousToken: await readSessionToken() },
  );
  if (!result.ok) {
    return result.reason === "invalid_input" ? { fieldErrors: result.fieldErrors } : { error: LOGIN_FAILED_MESSAGE };
  }
  await setSessionCookie(result.token);
  redirect(safeNextPath(fields.next));
}

export async function logoutAction(): Promise<void> {
  await assertSameOrigin();
  const session = await getAdminSession();
  if (session) {
    const { ip, userAgent } = await requestMeta();
    await getDb().$transaction(async (tx) => {
      await revokeSession(tx, session.id, "auth.logout");
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: session.admin.id,
        action: "auth.logout",
        entityType: "admin_session",
        entityId: session.id,
        summary: "Logout.",
        ip,
        userAgent,
      });
    });
  }
  await clearSessionCookie();
  redirect("/admin/login?pesan=keluar");
}

export async function logoutEverywhereAction(): Promise<void> {
  await assertSameOrigin();
  const session = await requireAdmin();
  const { ip, userAgent } = await requestMeta();
  await getDb().$transaction(async (tx) => {
    const sessionsRevoked = await revokeAllSessions(tx, "auth.logout_all");
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: session.admin.id,
      action: "auth.logout_all",
      entityType: "admin_user",
      entityId: String(session.admin.id),
      summary: "Keluar dari semua perangkat.",
      meta: { sessionsRevoked },
      ip,
      userAgent,
    });
  });
  await clearSessionCookie();
  redirect("/admin/login?pesan=semua");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const session = await requireAdmin();
  const parsed = sessionIdSchema.safeParse(formData.get("sessionId"));
  if (!parsed.success) redirect("/admin/akun?status=sesi-tidak-valid");
  if (parsed.data === session.id) return logoutAction();

  const { ip, userAgent } = await requestMeta();
  const revoked = await getDb().$transaction(async (tx) => {
    const done = await revokeSession(tx, parsed.data, "auth.session_revoked");
    if (done) {
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: session.admin.id,
        action: "auth.session_revoked",
        entityType: "admin_session",
        entityId: parsed.data,
        summary: "Satu sesi lain dicabut.",
        ip,
        userAgent,
      });
    }
    return done;
  });
  redirect(revoked ? "/admin/akun?status=sesi-dicabut" : "/admin/akun?status=sesi-tidak-valid");
}

export interface PasswordState {
  error?: string;
  fieldErrors?: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
}

export async function changePasswordAction(_previous: PasswordState, formData: FormData): Promise<PasswordState> {
  await assertSameOrigin();
  await requireAdmin();
  const fields = formFields(formData);
  const result = await changePassword(
    getDb(),
    { currentPassword: fields.currentPassword, newPassword: fields.newPassword, confirmPassword: fields.confirmPassword },
    await requestMeta(),
  );
  if (!result.ok) {
    if (result.reason === "locked" || result.reason === "rate_limited") {
      return { error: "Terlalu banyak percobaan password yang salah. Coba lagi dalam 15 menit." };
    }
    return { fieldErrors: result.fieldErrors };
  }
  await setSessionCookie(result.token);
  redirect("/admin/akun?status=password-diganti");
}
