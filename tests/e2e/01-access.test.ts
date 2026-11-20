import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { generateSessionToken } from "@/server/auth/tokens";

import { closeAll, http, mintSession, owner } from "./helpers";

after(closeAll);

describe("without login", () => {
  test("CMS pages redirect to the login page (with the address to return to)", async () => {
    const dashboard = await http("/admin");
    assert.equal(dashboard.status, 307);
    assert.equal(new URL(dashboard.headers.get("location")!, "http://x").pathname, "/admin/login");

    const account = await http("/admin/akun?tab=sesi");
    assert.equal(account.status, 307);
    const target = new URL(account.headers.get("location")!, "http://x");
    assert.equal(target.pathname, "/admin/login");
    assert.equal(target.searchParams.get("next"), "/admin/akun?tab=sesi");

    assert.equal((await http("/admin/tidak-ada")).status, 307);
  });

  test("API answers 401 JSON", async () => {
    const response = await http("/api/admin/me");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal((await http("/api/admin/logout", { method: "POST", headers: { origin: new URL(process.env.E2E_BASE_URL!).origin } })).status, 401);
  });

  test("the login page renders (200) with a strict, nonce-based CSP and noindex", async () => {
    const response = await http("/admin/login");
    assert.equal(response.status, 200);
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, `nonce in CSP: ${csp}`);
    for (const part of ["default-src 'self'", "'strict-dynamic'", "frame-ancestors 'none'", "form-action 'self'", "object-src 'none'"]) {
      assert.ok(csp.includes(part), part);
    }
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const html = await response.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow/);
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    assert.ok(scripts.length > 0);
    for (const tag of scripts) assert.ok(tag.includes(`nonce="${nonce}"`), `script without nonce: ${tag.slice(0, 80)}`);
  });
});

describe("cookie manipulation", () => {
  test("garbage, forged and tampered cookies never get in", async () => {
    const genuine = await mintSession();
    const tampered = genuine.slice(0, 20) + (genuine[20] === "A" ? "B" : "A") + genuine.slice(21);
    for (const value of ["admin", "1", "true", "' OR '1'='1", generateSessionToken(), tampered, genuine.slice(0, 42), `${genuine}x`]) {
      const api = await http("/api/admin/me", { session: value });
      assert.equal(api.status, 401, `api with ${value.slice(0, 12)}…`);
      const page = await http("/admin", { session: value });
      assert.equal(page.status, 307, `page with ${value.slice(0, 12)}…`);
      assert.match(page.headers.get("location") ?? "", /\/admin\/login/);
    }
    // a cookie under another name (e.g. without the __Host- prefix) is ignored
    assert.equal((await http("/api/admin/me", { cookieHeader: `sumenep_admin_dev=${genuine}` })).status, 401);
    assert.equal((await http("/api/admin/me", { session: genuine })).status, 200, "the genuine cookie still works");
  });

  test("a well-formed but unknown cookie ends on the login page with 'sesi berakhir'", async () => {
    const page = await http("/admin", { session: generateSessionToken() });
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/admin\/login\?pesan=berakhir/);
  });
});

describe("with a valid session", () => {
  test("dashboard and API answer; the API never exposes secrets", async () => {
    const session = await mintSession();
    const dashboard = await http("/admin", { session });
    assert.equal(dashboard.status, 200);
    assert.match((await dashboard.text()).replaceAll("<!-- -->", ""), /Selamat datang, Admin Uji/);

    const me = await http("/api/admin/me", { session });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.deepEqual(body.admin, { email: "admin.uji@sumenep.test", name: "Admin Uji", role: "ADMIN" });
    assert.doesNotMatch(JSON.stringify(body), /scrypt|tokenHash|passwordHash/);
    assert.ok(!JSON.stringify(body).includes(session), "the token is not echoed");
  });

  test("the login page sends a logged-in Admin to the dashboard once (no loop)", async () => {
    const session = await mintSession();
    const login = await http("/admin/login", { session });
    assert.equal(login.status, 307);
    assert.equal(new URL(login.headers.get("location")!, "http://x").pathname, "/admin");
    assert.equal((await http("/admin", { session })).status, 200);
  });

  test("no way to create another account; still exactly one Admin", async () => {
    const session = await mintSession();
    for (const path of ["/admin/daftar", "/admin/register", "/admin/pengguna/baru"]) {
      assert.equal((await http(path, { session })).status, 404, path);
    }
    const origin = new URL(process.env.E2E_BASE_URL!).origin;
    for (const path of ["/api/admin/users", "/api/admin/admins", "/api/admin/register"]) {
      const response = await http(path, { method: "POST", session, headers: { origin, "content-type": "application/json" }, body: "{}" });
      assert.ok([404, 405].includes(response.status), `${path} → ${response.status}`);
    }
    assert.equal(await owner.adminUser.count(), 1);
  });
});

describe("public site is untouched", () => {
  test("the homepage gets none of the CMS headers", async () => {
    const response = await http("/");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.equal(response.headers.getSetCookie().length, 0);
  });
});
