import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { connect, DBERR, rejects, resetData } from "../helpers/db";
import { insertAdmin, insertSession, sha256 } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);
before(async () => {
  await resetData(owner);
  await insertAdmin(owner);
});

describe("sessions (rules for the Fase 3 login)", () => {
  test("only the SHA-256 of the token is stored", async () => {
    const session = await insertSession(app, { token: "token-acak-1" });
    assert.equal(session.tokenHash, sha256("token-acak-1"));
    await rejects(
      app.adminSession.create({ data: { tokenHash: "token-mentah", expiresAt: new Date(Date.now() + 3600_000) } }),
      /admin_session_token_hash_sha256/,
    );
  });

  test("at most 8 hours after the last activity", async () => {
    await insertSession(app, { token: "tepat-8-jam", hours: 8 });
    await rejects(insertSession(app, { token: "sembilan-jam", hours: 9 }), DBERR.check, /admin_session_max_8_hours/);
    await rejects(insertSession(app, { token: "lewat-sedetik", hours: 8 + 1 / 3600 }), /admin_session_max_8_hours/);
  });

  test("extending an active session moves both timestamps together", async () => {
    const createdAt = new Date(Date.now() - 6 * 3600_000);
    const session = await insertSession(app, { token: "aktif", createdAt, lastSeenAt: createdAt });
    const now = new Date();
    await app.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + 8 * 3600_000) },
    });
    await rejects(
      app.adminSession.update({ where: { id: session.id }, data: { expiresAt: new Date(now.getTime() + 30 * 24 * 3600_000) } }),
      /admin_session_max_8_hours/,
    );
    const beforeCreation = new Date(createdAt.getTime() - 1000);
    await rejects(
      app.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: beforeCreation, expiresAt: new Date(beforeCreation.getTime() + 3600_000) },
      }),
      /admin_session_timeline/,
    );
  });
});

describe("login attempts", () => {
  test("reason is one of the known values and matches success", async () => {
    await app.loginAttempt.create({ data: { email: "x@y.z", ip: "203.0.113.5", success: false, reason: "bad_credentials" } });
    await app.loginAttempt.create({ data: { email: "x@y.z", ip: "203.0.113.5", success: true, reason: "ok" } });
    await rejects(app.loginAttempt.create({ data: { email: "x@y.z", success: false, reason: "ok" } }), /login_attempt_success_matches_reason/);
    await rejects(app.loginAttempt.create({ data: { email: "x@y.z", success: false, reason: "lupa" } }), /login_attempt_reason_known/);
  });
});
