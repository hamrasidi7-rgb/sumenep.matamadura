import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { revokeAllAdminSessions } from "@/server/admin/recover";
import { EXTEND_AFTER_MS, SESSION_TTL_MS } from "@/server/auth/config";
import { attemptLogin } from "@/server/auth/login";
import { verifyPassword } from "@/server/auth/password";
import { changePassword } from "@/server/auth/password-change";
import { findValidSession, listActiveSessions, revokeAllSessions, revokeSession } from "@/server/auth/sessions";

import { connect, resetData } from "../helpers/db";
import { insertAdmin, TEST_PASSWORD, TEST_PASSWORD_2 } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);

const META = { ip: "203.0.113.5", userAgent: "Mozilla/5.0 Firefox/141.0" };

async function newSession(now?: Date) {
  const result = await attemptLogin(app, { email: "admin@sumenep.test", password: TEST_PASSWORD }, META, now);
  assert.ok(result.ok);
  return result;
}

beforeEach(async () => {
  await resetData(owner);
  await insertAdmin(owner, TEST_PASSWORD);
});

describe("session validation", () => {
  test("a valid cookie gives the Admin, without any secret", async () => {
    const { token } = await newSession();
    const session = await findValidSession(app, token);
    assert.ok(session);
    assert.deepEqual(Object.keys(session.admin).sort(), ["email", "id", "lastLoginAt", "name"]);
    assert.doesNotMatch(JSON.stringify(session), /scrypt|tokenHash|passwordHash/);
  });

  test("tampered, foreign or malformed cookies are rejected", async () => {
    const { token } = await newSession();
    const flipped = token.slice(0, 10) + (token[10] === "A" ? "B" : "A") + token.slice(11);
    for (const bad of [flipped, token.slice(0, 42), token + "x", token.toUpperCase(), "A".repeat(43), "", undefined, "admin=1", `${token};admin=1`]) {
      assert.equal(await findValidSession(app, bad), null, String(bad).slice(0, 20));
    }
    assert.ok(await findValidSession(app, token), "the genuine cookie still works");
  });

  test("expired after 8 hours without activity", async () => {
    const start = new Date();
    const { token } = await newSession(start);
    const justBefore = new Date(start.getTime() + SESSION_TTL_MS - 1000);
    assert.ok(await findValidSession(app, token, { now: justBefore, extend: false }));
    const after8h = new Date(start.getTime() + SESSION_TTL_MS + 1000);
    assert.equal(await findValidSession(app, token, { now: after8h }), null);
  });

  test("valid activity slides the 8 hours forward (at most every 5 minutes); prefetches do not", async () => {
    const start = new Date();
    const { token, sessionId } = await newSession(start);
    const row = () => owner.adminSession.findUniqueOrThrow({ where: { id: sessionId } });

    await findValidSession(app, token, { now: new Date(start.getTime() + 2 * 60_000) });
    assert.equal((await row()).lastSeenAt.getTime(), start.getTime(), "under 5 minutes: no write");

    const prefetch = new Date(start.getTime() + 6 * 60_000);
    await findValidSession(app, token, { now: prefetch, extend: false });
    assert.equal((await row()).lastSeenAt.getTime(), start.getTime(), "prefetch is not activity");

    const active = new Date(start.getTime() + EXTEND_AFTER_MS + 60_000);
    await findValidSession(app, token, { now: active });
    const extended = await row();
    assert.equal(extended.lastSeenAt.getTime(), active.getTime());
    assert.equal(extended.expiresAt.getTime(), active.getTime() + SESSION_TTL_MS);

    // still alive 8 hours after login, because it was used
    assert.ok(await findValidSession(app, token, { now: new Date(start.getTime() + SESSION_TTL_MS + 60_000), extend: false }));
  });

  test("a session older than the last password change is refused", async () => {
    const { token } = await newSession();
    await owner.adminUser.update({ where: { id: 1 }, data: { passwordChangedAt: new Date(Date.now() + 1000) } });
    assert.equal(await findValidSession(app, token), null);
  });
});

describe("logout and revocation", () => {
  test("logout revokes the session in the database", async () => {
    const { token, sessionId } = await newSession();
    assert.equal(await revokeSession(app, sessionId, "auth.logout"), true);
    assert.equal(await findValidSession(app, token), null);
    assert.equal(await revokeSession(app, sessionId, "auth.logout"), false, "already revoked");
    assert.equal((await owner.adminSession.findUniqueOrThrow({ where: { id: sessionId } })).revokedReason, "auth.logout");
  });

  test("revoking one other session leaves the current one", async () => {
    const laptop = await newSession();
    const phone = await newSession();
    await revokeSession(app, phone.sessionId, "auth.session_revoked");
    assert.ok(await findValidSession(app, laptop.token));
    assert.equal(await findValidSession(app, phone.token), null);
    assert.deepEqual(
      (await listActiveSessions(app)).map((s) => s.id),
      [laptop.sessionId],
    );
  });

  test("log out of every device", async () => {
    // one after another: three parallel logins from one IP would hit the 2-in-flight cap
    const sessions = [await newSession(), await newSession(), await newSession()];
    assert.equal(await revokeAllSessions(app, "auth.logout_all"), 3);
    for (const s of sessions) assert.equal(await findValidSession(app, s.token), null);
    assert.equal((await listActiveSessions(app)).length, 0);
  });

  test("the operator CLI (admin:recover revoke-sessions) ends sessions too", async () => {
    const { token } = await newSession();
    await revokeAllAdminSessions(owner);
    assert.equal(await findValidSession(app, token), null);
  });
});

describe("password change", () => {
  const change = (input: Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>) =>
    changePassword(app, { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD_2, confirmPassword: TEST_PASSWORD_2, ...input }, META);

  test("success: new password, every old session revoked, this device gets a new session", async () => {
    const current = await newSession();
    const other = await newSession();
    const result = await change({});
    assert.ok(result.ok);
    assert.equal(result.sessionsRevoked, 2);
    assert.equal(await findValidSession(app, current.token), null, "old cookie of this device is dead");
    assert.equal(await findValidSession(app, other.token), null, "other device is logged out");
    assert.ok(await findValidSession(app, result.token), "new session works");

    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD, admin.passwordHash), false);
    assert.equal(await verifyPassword(TEST_PASSWORD_2, admin.passwordHash), true);
    const log = await owner.activityLog.findFirstOrThrow({ where: { action: "auth.password_changed" } });
    assert.deepEqual(log.meta, { sessionsRevoked: 2 });

    assert.equal((await attemptLogin(app, { email: "admin@sumenep.test", password: TEST_PASSWORD }, META)).ok, false);
    assert.equal((await attemptLogin(app, { email: "admin@sumenep.test", password: TEST_PASSWORD_2 }, META)).ok, true);
  });

  test("wrong current password is refused and counts toward the lockout", async () => {
    const result = await change({ currentPassword: "salah salah salah salah" });
    assert.ok(!result.ok);
    assert.equal(result.reason, "wrong_password");
    assert.equal((await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } })).failedLoginCount, 1);
  });

  test("policy, confirmation and 'must differ' are enforced on the server", async () => {
    for (const [input, field] of [
      [{ newPassword: "pendek", confirmPassword: "pendek" }, "newPassword"],
      [{ confirmPassword: "berbeda dari yang baru 9" }, "confirmPassword"],
      [{ newPassword: TEST_PASSWORD, confirmPassword: TEST_PASSWORD }, "newPassword"],
    ] as const) {
      const result = await change(input);
      assert.ok(!result.ok && result.reason === "invalid_input" && result.fieldErrors?.[field], JSON.stringify(input));
    }
    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD, admin.passwordHash), true, "nothing changed");
  });

  test("refused while the account is locked", async () => {
    await owner.adminUser.update({ where: { id: 1 }, data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    const result = await change({});
    assert.ok(!result.ok);
    assert.equal(result.reason, "locked");
  });
});

describe("one role, one account", () => {
  test("no role column and no second credential table exist", async () => {
    const roleColumns = await owner.$queryRaw<Array<{ col: string }>>`
      SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(COLUMN_NAME) LIKE '%role%'`;
    assert.deepEqual(roleColumns.map((r) => r.col), ["author.role"], "only the editorial job title of an author profile");
    const passwordColumns = await owner.$queryRaw<Array<{ col: string }>>`
      SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND (LOWER(COLUMN_NAME) LIKE '%password%' OR LOWER(COLUMN_NAME) LIKE '%token%')`;
    assert.deepEqual(passwordColumns.map((r) => r.col).sort(), ["admin_session.token_hash", "admin_user.password_changed_at", "admin_user.password_hash"]);
  });
});
