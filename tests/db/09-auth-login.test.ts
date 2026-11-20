import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { AUTH, SESSION_TTL_MS } from "@/server/auth/config";
import { attemptLogin, type LoginResult } from "@/server/auth/login";
import { findValidSession } from "@/server/auth/sessions";
import { hashSessionToken } from "@/server/auth/tokens";

import { connect, resetData } from "../helpers/db";
import { escapeRegExp, insertAdmin, TEST_PASSWORD } from "../helpers/fixtures";

// Login rules, run with the RUNTIME role (what the web app uses), so the tests
// also prove that role has exactly the rights login needs.

const { owner, app, close } = connect();
after(close);

const EMAIL = "admin@sumenep.test";
const WRONG = "bukan password yang benar";
const UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537.36";
const ip = (n: number) => `203.0.113.${n}`;

const login = (password: string, from = ip(1), now?: Date, email = EMAIL) =>
  attemptLogin(app, { email, password }, { ip: from, userAgent: UA }, now);

const reasonOf = (result: LoginResult) => (result.ok ? "ok" : result.reason);
const adminRow = () => owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });

beforeEach(async () => {
  await resetData(owner);
  await insertAdmin(owner, TEST_PASSWORD);
});

describe("login: correct password", () => {
  test("creates a session; the token is returned once and only its hash is stored", async () => {
    const before = Date.now();
    const result = await login(TEST_PASSWORD);
    assert.ok(result.ok);
    assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);

    const session = await owner.adminSession.findUniqueOrThrow({ where: { id: result.sessionId } });
    assert.equal(session.tokenHash, hashSessionToken(result.token));
    assert.notEqual(session.tokenHash, result.token);
    assert.ok(Math.abs(session.expiresAt.getTime() - (before + SESSION_TTL_MS)) < 60_000, "expires 8 hours after login");
    assert.equal(session.ip, ip(1));

    const everything = JSON.stringify(
      await Promise.all([owner.adminSession.findMany(), owner.activityLog.findMany(), owner.loginAttempt.findMany(), owner.adminUser.findMany()]),
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
    );
    assert.doesNotMatch(everything, new RegExp(result.token), "raw session token is stored nowhere");
    assert.doesNotMatch(everything, new RegExp(escapeRegExp(TEST_PASSWORD)), "raw password is stored nowhere");

    assert.ok((await adminRow()).lastLoginAt);
    assert.equal(await owner.activityLog.count({ where: { action: "auth.login", actor: "ADMIN" } }), 1);
    assert.equal(await owner.loginAttempt.count({ where: { success: true, reason: "ok" } }), 1);
    assert.ok(await findValidSession(app, result.token));
  });

  test("a cookie the browser already had is revoked at login (no session fixation)", async () => {
    const first = await login(TEST_PASSWORD);
    assert.ok(first.ok);
    const second = await attemptLogin(app, { email: EMAIL, password: TEST_PASSWORD }, { ip: ip(1), previousToken: first.token });
    assert.ok(second.ok);
    assert.equal(await findValidSession(app, first.token), null);
    assert.ok(await findValidSession(app, second.token));
    const replaced = await owner.adminSession.findUniqueOrThrow({ where: { id: first.sessionId } });
    assert.equal(replaced.revokedReason, "auth.login.replaced");
  });
});

describe("login: failures", () => {
  test("wrong password and unknown email get the same answer; only the real account counts", async () => {
    assert.equal(reasonOf(await login(WRONG)), "bad_credentials");
    assert.equal((await adminRow()).failedLoginCount, 1);
    assert.equal(reasonOf(await login(TEST_PASSWORD, ip(1), undefined, "orang.lain@sumenep.test")), "bad_credentials");
    assert.equal((await adminRow()).failedLoginCount, 1, "unknown email does not touch the Admin");
    assert.equal(await owner.adminSession.count(), 0);
    assert.equal(await owner.loginAttempt.count({ where: { reason: "bad_credentials" } }), 2);
  });

  test("invalid input is refused with field messages and recorded", async () => {
    const empty = await attemptLogin(app, { email: "", password: "" }, { ip: ip(1) });
    assert.equal(reasonOf(empty), "invalid_input");
    assert.ok(!empty.ok && empty.fieldErrors?.email && empty.fieldErrors?.password);
    assert.equal(reasonOf(await attemptLogin(app, { email: "bukan-email", password: "x" }, { ip: ip(1) })), "invalid_input");
    assert.equal(reasonOf(await attemptLogin(app, { email: EMAIL, password: "x".repeat(257) }, { ip: ip(1) })), "invalid_input");
    assert.equal(reasonOf(await attemptLogin(app, { email: { $ne: "" }, password: ["x"] }, { ip: ip(1) })), "invalid_input");
    assert.equal(await owner.loginAttempt.count({ where: { reason: "invalid_input" } }), 4);
    assert.equal(await owner.loginAttempt.count({ where: { reason: "invalid_input", email: { not: "" } } }), 0, "malformed input (sometimes a password) is not stored");
    assert.equal((await adminRow()).failedLoginCount, 0);
  });
});

describe("lockout after 5 wrong passwords", () => {
  test("the 5th failure locks for 15 minutes; the right password is refused while locked", async () => {
    for (let i = 0; i < AUTH.lockoutThreshold; i++) assert.equal(reasonOf(await login(WRONG, ip(10 + i))), "bad_credentials");
    const locked = await adminRow();
    assert.equal(locked.failedLoginCount, 5);
    assert.ok(locked.lockedUntil && Math.abs(locked.lockedUntil.getTime() - (Date.now() + 15 * 60_000)) < 60_000);
    assert.equal(await owner.activityLog.count({ where: { action: "auth.lockout" } }), 1);

    assert.equal(reasonOf(await login(TEST_PASSWORD, ip(20))), "locked");
    assert.equal(await owner.adminSession.count(), 0);
    assert.equal(await owner.loginAttempt.count({ where: { reason: "locked" } }), 1);
  });

  test("after the lock expires the right password works and the count resets", async () => {
    for (let i = 0; i < AUTH.lockoutThreshold; i++) await login(WRONG, ip(10 + i));
    const { lockedUntil } = await adminRow();
    const later = new Date(lockedUntil!.getTime() + 1000);
    const result = await login(TEST_PASSWORD, ip(30), later);
    assert.ok(result.ok);
    const admin = await adminRow();
    assert.equal(admin.failedLoginCount, 0);
    assert.equal(admin.lockedUntil, null);
  });

  test("an expired lock starts counting from zero again", async () => {
    for (let i = 0; i < AUTH.lockoutThreshold; i++) await login(WRONG, ip(10 + i));
    const { lockedUntil } = await adminRow();
    const later = new Date(lockedUntil!.getTime() + 1000);
    assert.equal(reasonOf(await login(WRONG, ip(31), later)), "bad_credentials");
    const admin = await adminRow();
    assert.equal(admin.failedLoginCount, 1);
    assert.equal(admin.lockedUntil, null);
  });

  test("a burst of 30 parallel guesses: account locked, scrypt queue bounded, no session", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => login(`tebakan-${i}-xxxxxxxxxx`, ip(100 + i))));
    const reasons = results.map(reasonOf);
    assert.ok(!reasons.includes("ok"));
    assert.ok(reasons.filter((r) => r === "bad_credentials").length <= AUTH.lockoutThreshold + 1);
    assert.ok(reasons.includes("locked") || reasons.includes("rate_limited"));
    const admin = await adminRow();
    assert.equal(admin.failedLoginCount, AUTH.lockoutThreshold);
    assert.ok(admin.lockedUntil && admin.lockedUntil > new Date());
    assert.equal(await owner.adminSession.count(), 0);
  });
});

describe("per-IP rate limiting", () => {
  test("10 failures from one IP block that IP, even with the right password; other IPs still log in", async () => {
    const attacker = ip(66);
    for (let i = 0; i < AUTH.ipMaxFailures; i++) {
      // unknown emails: the Admin account itself is never locked by this
      assert.equal(reasonOf(await login(WRONG, attacker, undefined, `tamu${i}@contoh.id`)), "bad_credentials");
    }
    assert.equal(reasonOf(await login(TEST_PASSWORD, attacker)), "rate_limited");
    assert.equal(await owner.loginAttempt.count({ where: { ip: attacker, reason: "rate_limited" } }), 1);
    assert.ok((await login(TEST_PASSWORD, ip(67))).ok, "a different IP is not affected");
    assert.equal((await adminRow()).failedLoginCount, 0);

    const later = new Date(Date.now() + 16 * 60_000);
    assert.ok((await login(TEST_PASSWORD, attacker, later)).ok, "the IP is free again after the 15-minute window");
  });

  test("at most 2 parallel logins per IP", async () => {
    const results = await Promise.all([login(WRONG, ip(77)), login(WRONG, ip(77)), login(WRONG, ip(77))]);
    assert.deepEqual(results.map(reasonOf).sort(), ["bad_credentials", "bad_credentials", "rate_limited"]);
  });
});
