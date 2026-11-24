import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { poolConfig } from "@/server/db/client";
import { canonicalDatabaseUrl, effectiveHost, onHostinger, parseDatabaseUrl, runtimeDatabaseUrl } from "@/server/db/url";

// DATABASE_URL as typed into a hosting panel (src/server/db/url.ts).

describe("DATABASE_URL from a hosting panel", () => {
  test("an unencoded password with @ # / ? : % survives, and localhost becomes 127.0.0.1", () => {
    const password = "Ab@#/?:%zz9:x";
    const url = runtimeDatabaseUrl({ DATABASE_URL: `mysql://u123456789_cms:${password}@localhost:3306/u123456789_sumenep` }, false);
    assert.equal(url, `mysql://u123456789_cms:${encodeURIComponent(password)}@127.0.0.1:3306/u123456789_sumenep`);
    const config = poolConfig(url);
    assert.equal(config.password, password);
    assert.equal(config.user, "u123456789_cms");
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.database, "u123456789_sumenep");
  });

  test("an already encoded URL is read the same way", () => {
    const parts = parseDatabaseUrl("mysql://u%40ser:p%40ss%2Fword@db.contoh.id:3307/nama?ssl=true");
    assert.deepEqual(parts, { user: "u@ser", password: "p@ss/word", host: "db.contoh.id", port: 3307, database: "nama", ssl: true });
    assert.equal(canonicalDatabaseUrl(parts, false), "mysql://u%40ser:p%40ss%2Fword@db.contoh.id:3307/nama?ssl=true");
  });

  test("pasted quotes, spaces and the mariadb:// scheme are accepted; the port defaults to 3306", () => {
    const parts = parseDatabaseUrl(`  "mariadb://u1_a:rahasia@127.0.0.1/u1_db"  `);
    assert.equal(parts.password, "rahasia");
    assert.equal(parts.port, 3306);
    assert.equal(parts.database, "u1_db");
  });

  test("on Hostinger the server's own name means the local database; TLS is dropped for 127.0.0.1", () => {
    assert.equal(effectiveHost("srv123.hstgr.io", true), "127.0.0.1");
    assert.equal(effectiveHost("srv123.hstgr.io", false), "srv123.hstgr.io");
    const url = canonicalDatabaseUrl(parseDatabaseUrl("mysql://u:p@srv123.hstgr.io:3306/db?ssl=true"), true);
    assert.equal(url, "mysql://u:p@127.0.0.1:3306/db");
    assert.equal(onHostinger("/home/u123456789"), true);
    assert.equal(onHostinger("/home/ubuntu"), false);
    assert.equal(onHostinger("C:\\Users\\redaksi"), false);
  });

  test("without DATABASE_URL, Hostinger-style DB_HOST/DB_USER/DB_PASSWORD/DB_NAME are used", () => {
    const env = { DB_HOST: "localhost", DB_USER: "u123456789_cms", DB_PASSWORD: "Ab@#/9 x", DB_NAME: "u123456789_sumenep" };
    const url = runtimeDatabaseUrl(env, false);
    assert.equal(url, `mysql://u123456789_cms:${encodeURIComponent("Ab@#/9 x")}@127.0.0.1:3306/u123456789_sumenep`);
    assert.equal(poolConfig(url).password, "Ab@#/9 x");
    assert.equal(runtimeDatabaseUrl({ ...env, DB_HOST: "srv123.hstgr.io:3307" }, true), url.replace(":3306/", ":3307/"));
    // DATABASE_URL wins when both are present; an incomplete set is not enough.
    assert.match(runtimeDatabaseUrl({ ...env, DATABASE_URL: "mysql://a:b@localhost/c" }, false), /^mysql:\/\/a:b@127\.0\.0\.1:3306\/c$/);
    assert.throws(() => runtimeDatabaseUrl({ DB_USER: "u", DB_NAME: "d" }, false), /DATABASE_URL belum diisi/);
  });

  test("a local socket (DB_SOCKET or ?socket=) replaces TCP for both the app pool and Prisma", () => {
    const env = { DB_USER: "u1_cms", DB_PASSWORD: "p@ss word", DB_NAME: "u1_sumenep", DB_SOCKET: "/var/lib/mysql/mysql.sock" };
    const url = runtimeDatabaseUrl(env, true);
    assert.equal(url, `mysql://u1_cms:${encodeURIComponent("p@ss word")}@localhost/u1_sumenep?socket=/var/lib/mysql/mysql.sock`);
    const config = poolConfig(url);
    assert.equal(config.socketPath, "/var/lib/mysql/mysql.sock");
    assert.equal(config.password, "p@ss word");
    assert.equal(parseDatabaseUrl(url).socket, "/var/lib/mysql/mysql.sock");
    assert.equal(poolConfig("mysql://u:p@127.0.0.1:3306/db").socketPath, undefined);
  });

  test("broken or incomplete values are refused without echoing the password", () => {
    const secret = "JanganTampil#123";
    const cases: Array<[string, RegExp]> = [
      ["", /belum diisi/],
      [`postgresql://u:${secret}@localhost/db`, /mysql:\/\//],
      [`mysql://localhost/db`, /user dan password/],
      [`mysql://u:${secret}@localhost`, /nama database/],
      [`mysql://u:${secret}@local host/db`, /host\/database/],
    ];
    for (const [value, message] of cases) {
      assert.throws(() => runtimeDatabaseUrl({ DATABASE_URL: value }, false), (error: Error) => {
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /JanganTampil/);
        return true;
      });
    }
  });
});
