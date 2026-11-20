import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { ZodError } from "zod";

import {
  AdminMissingError,
  changeAdminEmail,
  getAdminStatus,
  resetAdminPassword,
  revokeAllAdminSessions,
  unlockAdmin,
} from "@/server/admin/recover";
import { verifyPassword } from "@/server/auth/password";

import { connect, resetData, runScript } from "../helpers/db";
import { insertAdmin, insertSession, TEST_PASSWORD, TEST_PASSWORD_2 } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);
beforeEach(() => resetData(owner));

/** Admin locked out after 5 failures, with 2 active, 1 expired and 1 revoked session. */
async function lockedAdminWithSessions() {
  await insertAdmin(owner, TEST_PASSWORD);
  await owner.adminUser.update({
    where: { id: 1 },
    data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) },
  });
  const old = new Date(Date.now() - 10 * 3600_000);
  await insertSession(app, { token: "laptop" });
  await insertSession(app, { token: "ponsel" });
  await insertSession(app, { token: "kedaluwarsa", createdAt: old, lastSeenAt: old });
  await insertSession(app, { token: "sudah-dicabut", revoked: true });
}

const activeSessions = () => owner.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } });

describe("recovery functions", () => {
  test("refuse when there is no Admin yet", async () => {
    await assert.rejects(getAdminStatus(owner), AdminMissingError);
    await assert.rejects(resetAdminPassword(owner, TEST_PASSWORD_2), AdminMissingError);
    await assert.rejects(revokeAllAdminSessions(owner), AdminMissingError);
    await assert.rejects(unlockAdmin(owner), AdminMissingError);
  });

  test("status reports the account without secrets", async () => {
    await lockedAdminWithSessions();
    const status = await getAdminStatus(owner);
    assert.equal(status.email, "admin@sumenep.test");
    assert.equal(status.failedLoginCount, 5);
    assert.equal(status.activeSessions, 2);
    assert.doesNotMatch(JSON.stringify(status), /scrypt|passwordHash|tokenHash/);
  });

  test("reset password: old one stops working, lockout lifted, every active session revoked, logged", async () => {
    await lockedAdminWithSessions();
    const before = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    const { sessionsRevoked } = await resetAdminPassword(owner, TEST_PASSWORD_2);
    assert.equal(sessionsRevoked, 2);

    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD, admin.passwordHash), false);
    assert.equal(await verifyPassword(TEST_PASSWORD_2, admin.passwordHash), true);
    assert.equal(admin.failedLoginCount, 0);
    assert.equal(admin.lockedUntil, null);
    assert.ok(admin.passwordChangedAt > before.passwordChangedAt);
    assert.equal(await activeSessions(), 0);
    assert.equal(await owner.adminSession.count({ where: { revokedReason: "admin.recover.password_reset" } }), 2);

    const log = await owner.activityLog.findFirstOrThrow({ where: { action: "admin.recover.password_reset" } });
    assert.equal(log.actor, "CLI");
    assert.deepEqual(log.meta, { sessionsRevoked: 2 });
    assert.equal(await owner.adminUser.count(), 1, "still exactly one Admin");
  });

  test("reset password still applies the password policy", async () => {
    await insertAdmin(owner);
    await assert.rejects(resetAdminPassword(owner, "pendek"), ZodError);
  });

  test("revoke sessions only: password unchanged", async () => {
    await lockedAdminWithSessions();
    const { sessionsRevoked } = await revokeAllAdminSessions(owner);
    assert.equal(sessionsRevoked, 2);
    assert.equal(await activeSessions(), 0);
    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD, admin.passwordHash), true);
    assert.equal(await owner.activityLog.count({ where: { action: "admin.recover.sessions_revoked" } }), 1);
  });

  test("unlock only", async () => {
    await lockedAdminWithSessions();
    await unlockAdmin(owner);
    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(admin.failedLoginCount, 0);
    assert.equal(admin.lockedUntil, null);
    assert.equal(await activeSessions(), 2, "sessions untouched");
  });

  test("change login email (normalised and validated)", async () => {
    await insertAdmin(owner);
    assert.deepEqual(await changeAdminEmail(owner, "  Redaksi.Baru@Sumenep.TEST "), { email: "redaksi.baru@sumenep.test" });
    await assert.rejects(changeAdminEmail(owner, "bukan-email"), ZodError);
    const log = await owner.activityLog.findFirstOrThrow({ where: { action: "admin.recover.email_changed" } });
    assert.deepEqual(log.meta, { from: "admin@sumenep.test", to: "redaksi.baru@sumenep.test" });
  });
});

describe("npm run admin:recover (CLI)", () => {
  const script = "scripts/admin/recover.ts";

  test("status prints the account state and no secrets", async () => {
    await lockedAdminWithSessions();
    const run = runScript(script, ["status"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Email login\s+: admin@sumenep\.test/);
    assert.match(run.stdout, /Terkunci\s+: ya/);
    assert.match(run.stdout, /Sesi aktif\s+: 2/);
    assert.doesNotMatch(run.stdout, /scrypt|\$131072/);
  });

  test("reset-password without --yes in a non-interactive shell is refused and changes nothing", async () => {
    await lockedAdminWithSessions();
    const run = runScript(script, ["reset-password", "--password-stdin"], `${TEST_PASSWORD_2}\n`);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /--yes/);
    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD, admin.passwordHash), true);
    assert.equal(await activeSessions(), 2);
  });

  test("reset-password --yes resets, unlocks and revokes", async () => {
    await lockedAdminWithSessions();
    const run = runScript(script, ["reset-password", "--password-stdin", "--yes"], `${TEST_PASSWORD_2}\n`);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Sesi dicabut: 2/);
    assert.doesNotMatch(run.stdout + run.stderr, /pantai lombang/, "password never echoed");
    const admin = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD_2, admin.passwordHash), true);
    assert.equal(admin.lockedUntil, null);
    assert.equal(await activeSessions(), 0);
  });

  test("revoke-sessions --yes and unlock --yes", async () => {
    await lockedAdminWithSessions();
    assert.equal(runScript(script, ["revoke-sessions", "--yes"]).status, 0);
    assert.equal(await activeSessions(), 0);
    assert.equal(runScript(script, ["unlock", "--yes"]).status, 0);
    assert.equal((await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } })).lockedUntil, null);
  });

  test("unknown command or no Admin → exit code 2", async () => {
    assert.equal(runScript(script, ["hapus-admin"]).status, 2);
    const run = runScript(script, ["status"]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /admin:bootstrap/);
  });
});
