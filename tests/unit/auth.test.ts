import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { getClientIp, UNKNOWN_IP } from "@/server/auth/client-ip";
import { SESSION_TOKEN_PATTERN, sessionCookieName, sessionCookieOptions } from "@/server/auth/cookie";
import { BusyError, enterIp, Semaphore } from "@/server/auth/limiter";
import { checkSameOrigin } from "@/server/auth/origin";
import { safeNextPath } from "@/server/auth/redirect";
import { generateSessionToken, hashSessionToken, isWellFormedToken } from "@/server/auth/tokens";
import { changePasswordSchema, loginSchema } from "@/server/validation/auth";

const headers = (values: Record<string, string>) => new Headers(values);

function withNodeEnv<T>(value: string, run: () => T): T {
  const previous = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", value);
  try {
    return run();
  } finally {
    Reflect.set(process.env, "NODE_ENV", previous);
  }
}

describe("session cookie", () => {
  test("production: __Host- prefix, httpOnly, Secure, SameSite=Lax, Path=/, 8 hours", () => {
    withNodeEnv("production", () => {
      assert.equal(sessionCookieName(), "__Host-sumenep_admin");
      assert.deepEqual(sessionCookieOptions(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 8 * 3600 });
    });
  });

  test("development: plain name without Secure, so http://localhost works", () => {
    withNodeEnv("development", () => {
      assert.equal(sessionCookieName(), "sumenep_admin_dev");
      assert.equal(sessionCookieOptions().secure, false);
      assert.equal(sessionCookieOptions().httpOnly, true);
    });
  });
});

describe("session tokens", () => {
  test("32 random bytes as 43 base64url characters; only the SHA-256 is stored", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));
    assert.equal(tokens.size, 200);
    for (const token of tokens) {
      assert.match(token, SESSION_TOKEN_PATTERN);
      assert.match(hashSessionToken(token), /^[0-9a-f]{64}$/);
    }
    const token = generateSessionToken();
    assert.equal(hashSessionToken(token), hashSessionToken(token));
    assert.notEqual(hashSessionToken(token), token);
  });

  test("anything that is not a token is rejected before the database", () => {
    const token = generateSessionToken();
    for (const bad of [undefined, null, "", token.slice(1), `${token}A`, `${token.slice(0, 42)}=`, "' OR 1=1 --".padEnd(43, "x"), "a".repeat(64)]) {
      assert.equal(isWellFormedToken(bad), false, String(bad));
    }
    assert.equal(isWellFormedToken(token), true);
  });
});

describe("Origin check (CSRF)", () => {
  const site = { host: "sumenep.matamaduranews.com" };

  test("same origin passes", () => {
    assert.deepEqual(checkSameOrigin(headers({ ...site, origin: "https://sumenep.matamaduranews.com", "sec-fetch-site": "same-origin" })), { ok: true });
    assert.deepEqual(checkSameOrigin(headers({ host: "localhost:3301", origin: "http://localhost:3301" })), { ok: true });
  });

  test("missing, null, malformed or foreign Origin is refused", () => {
    assert.equal(checkSameOrigin(headers(site)).ok, false);
    assert.deepEqual(checkSameOrigin(headers({ ...site, origin: "null" })), { ok: false, reason: "missing-origin" });
    assert.deepEqual(checkSameOrigin(headers({ ...site, origin: "::nope" })), { ok: false, reason: "bad-origin" });
    assert.deepEqual(checkSameOrigin(headers({ ...site, origin: "https://evil.example" })), { ok: false, reason: "cross-origin" });
  });

  test("the parent site (same-site, different origin) is refused too", () => {
    assert.deepEqual(checkSameOrigin(headers({ ...site, origin: "https://matamaduranews.com" })), { ok: false, reason: "cross-origin" });
    assert.deepEqual(
      checkSameOrigin(headers({ ...site, origin: "https://sumenep.matamaduranews.com", "sec-fetch-site": "same-site" })),
      { ok: false, reason: "cross-site-fetch" },
    );
  });

  test("x-forwarded-host and ADMIN_ALLOWED_HOSTS are honoured", () => {
    const proxied = headers({ host: "127.0.0.1:3000", "x-forwarded-host": "sumenep.matamaduranews.com", origin: "https://sumenep.matamaduranews.com" });
    assert.equal(checkSameOrigin(proxied).ok, true);
    const internal = headers({ host: "127.0.0.1:3000", origin: "https://sumenep.matamaduranews.com" });
    assert.equal(checkSameOrigin(internal, "").ok, false);
    assert.equal(checkSameOrigin(internal, " Sumenep.MataMaduraNews.com ").ok, true);
  });
});

describe("client IP", () => {
  test("default: the last X-Forwarded-For entry (the one our proxy added)", () => {
    assert.equal(getClientIp(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), {}), "203.0.113.9");
    assert.equal(getClientIp(headers({ "x-forwarded-for": "::ffff:198.51.100.4" }), {}), "198.51.100.4");
    assert.equal(getClientIp(headers({ "x-forwarded-for": "198.51.100.4:51234" }), {}), "198.51.100.4");
    assert.equal(getClientIp(headers({ "x-forwarded-for": "[2001:db8::1]:443" }), {}), "2001:db8::1");
  });

  test("TRUSTED_PROXY_COUNT and CLIENT_IP_HEADER", () => {
    const h = headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.2", "x-real-ip": "198.51.100.77" });
    assert.equal(getClientIp(h, { TRUSTED_PROXY_COUNT: "2" }), "203.0.113.9");
    assert.equal(getClientIp(h, { CLIENT_IP_HEADER: "x-real-ip" }), "198.51.100.77");
  });

  test("garbage never becomes an IP", () => {
    assert.equal(getClientIp(headers({ "x-forwarded-for": "<script>, evil" }), {}), UNKNOWN_IP);
    assert.equal(getClientIp(headers({}), {}), UNKNOWN_IP);
  });
});

describe("redirect after login", () => {
  test("only CMS paths are accepted (no open redirect)", () => {
    assert.equal(safeNextPath("/admin/akun"), "/admin/akun");
    assert.equal(safeNextPath("/admin?tab=sesi"), "/admin?tab=sesi");
    for (const bad of ["//evil.example", "https://evil.example/admin", "/admin//evil.example", "/admin/../x", "/administrator", "/admin\\evil", "/admin/login", "/", 42, undefined]) {
      assert.equal(safeNextPath(bad), "/admin", String(bad));
    }
  });
});

describe("in-process limits", () => {
  test("semaphore: never more than max at once; a full queue is refused", async () => {
    const semaphore = new Semaphore(2, 3);
    let active = 0;
    let peak = 0;
    const task = () =>
      semaphore.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active--;
        return true;
      });
    const results = await Promise.allSettled(Array.from({ length: 7 }, task));
    assert.equal(peak, 2);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    for (const r of results.filter((r) => r.status === "rejected")) assert.ok((r as PromiseRejectedResult).reason instanceof BusyError);
    assert.deepEqual(semaphore.stats, { active: 0, waiting: 0 });
  });

  test("per-IP slots are capped and released", () => {
    const a = enterIp("192.0.2.1", 2);
    const b = enterIp("192.0.2.1", 2);
    assert.ok(a && b);
    assert.equal(enterIp("192.0.2.1", 2), null);
    assert.ok(enterIp("192.0.2.2", 2), "another IP is independent");
    a();
    a(); // releasing twice is harmless
    assert.ok(enterIp("192.0.2.1", 2));
  });
});

describe("auth input (zod)", () => {
  test("login: normalised email, bounded password", () => {
    assert.deepEqual(loginSchema.parse({ email: " Admin@Sumenep.TEST ", password: "x" }), { email: "admin@sumenep.test", password: "x" });
    assert.equal(loginSchema.safeParse({ email: "admin@sumenep.test", password: "" }).success, false);
    assert.equal(loginSchema.safeParse({ email: "admin@sumenep.test", password: "x".repeat(257) }).success, false);
    assert.equal(loginSchema.safeParse({ email: ["a@b.co"], password: "x" }).success, false);
  });

  test("password change: policy, confirmation, must differ", () => {
    const base = { currentPassword: "lama panjang sekali 1", newPassword: "baru panjang sekali 22", confirmPassword: "baru panjang sekali 22" };
    assert.equal(changePasswordSchema.safeParse(base).success, true);
    const issue = (input: object) => changePasswordSchema.safeParse(input).error?.issues[0]?.message ?? "";
    assert.match(issue({ ...base, confirmPassword: "lain" }), /tidak sama/);
    assert.match(issue({ ...base, newPassword: base.currentPassword, confirmPassword: base.currentPassword }), /berbeda/);
    assert.match(issue({ ...base, newPassword: "pendek", confirmPassword: "pendek" }), /minimal 15/);
  });
});
