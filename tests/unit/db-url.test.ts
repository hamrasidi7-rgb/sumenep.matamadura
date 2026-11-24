import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { poolConfig } from "@/server/db/client";
import { canonicalDatabaseUrl, cleanPanelValue, describeDatabaseConfig, effectiveHost, parseDatabaseUrl, runtimeDatabaseUrl } from "@/server/db/url";

// DATABASE_URL / DB_* as typed into a hosting panel (src/server/db/url.ts).

const ZWSP = String.fromCharCode(0x200b);
const BOM = String.fromCharCode(0xfeff);

describe("database settings from a hosting panel", () => {
  test("an unencoded password with @ # / ? : % survives, and localhost becomes 127.0.0.1", () => {
    const password = "Ab@#/?:%zz9:x";
    const url = runtimeDatabaseUrl({ DATABASE_URL: `mysql://u123456789_cms:${password}@localhost:3306/u123456789_sumenep` });
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
    assert.equal(canonicalDatabaseUrl(parts), "mysql://u%40ser:p%40ss%2Fword@db.contoh.id:3307/nama?ssl=true");
  });

  test("pasted quotes, spaces and the mariadb:// scheme are accepted; the port defaults to 3306", () => {
    const parts = parseDatabaseUrl(`  "mariadb://u1_a:rahasia@127.0.0.1/u1_db"  `);
    assert.equal(parts.password, "rahasia");
    assert.equal(parts.port, 3306);
    assert.equal(parts.database, "u1_db");
  });

  test("a configured host name is used as given: never silently swapped for a local address", () => {
    assert.equal(effectiveHost("srv123.hstgr.io"), "srv123.hstgr.io");
    assert.equal(effectiveHost("localhost"), "127.0.0.1");
    assert.equal(canonicalDatabaseUrl(parseDatabaseUrl("mysql://u:p@srv123.hstgr.io:3306/db")), "mysql://u:p@srv123.hstgr.io:3306/db");
    const env = { DB_HOST: "srv123.hstgr.io", DB_PORT: "3306", DB_USER: "u1_cms", DB_PASSWORD: "x", DB_NAME: "u1_sumenep" };
    assert.equal(runtimeDatabaseUrl(env), "mysql://u1_cms:x@srv123.hstgr.io:3306/u1_sumenep");
    assert.deepEqual(describeDatabaseConfig(env), { sumber: "DB_USER/DB_PASSWORD/DB_NAME", host: "diisi: nama server lain", port: 3306 });
    assert.deepEqual(describeDatabaseConfig({ DB_USER: "u", DB_PASSWORD: "x", DB_NAME: "d" }), {
      sumber: "DB_USER/DB_PASSWORD/DB_NAME",
      host: "tidak diisi, bawaan: 127.0.0.1 (server yang sama)",
      port: 3306,
    });
    assert.deepEqual(describeDatabaseConfig({}), { sumber: "belum diisi" });
  });

  test("without DATABASE_URL, Hostinger-style DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME are used", () => {
    const env = { DB_HOST: "localhost", DB_USER: "u123456789_cms", DB_PASSWORD: "Ab@#/9 x", DB_NAME: "u123456789_sumenep" };
    const url = runtimeDatabaseUrl(env);
    assert.equal(url, `mysql://u123456789_cms:${encodeURIComponent("Ab@#/9 x")}@127.0.0.1:3306/u123456789_sumenep`);
    assert.equal(poolConfig(url).password, "Ab@#/9 x");
    assert.equal(runtimeDatabaseUrl({ ...env, DB_PORT: "3307" }), url.replace(":3306/", ":3307/"));
    // DATABASE_URL wins when both are present; an incomplete set is not enough.
    assert.match(runtimeDatabaseUrl({ ...env, DATABASE_URL: "mysql://a:b@localhost/c" }), /^mysql:\/\/a:b@127\.0\.0\.1:3306\/c$/);
    assert.throws(() => runtimeDatabaseUrl({ DB_USER: "u", DB_NAME: "d" }), /DATABASE_URL belum diisi/);
  });

  test("paste artifacts are removed: surrounding quotes and invisible characters; default host 127.0.0.1", () => {
    const env = { DB_USER: '"u1_cms"', DB_PASSWORD: `${ZWSP}'Rahasia#1'${BOM}`, DB_NAME: ` u1_sumenep${ZWSP} ` };
    assert.equal(runtimeDatabaseUrl(env), `mysql://u1_cms:${encodeURIComponent("Rahasia#1")}@127.0.0.1:3306/u1_sumenep`);
    assert.equal(cleanPanelValue("'a'b'"), "a'b");
    assert.equal(cleanPanelValue("tanpa kutip"), "tanpa kutip");
  });

  test("a local socket (DB_SOCKET or ?socket=) replaces TCP for both the app pool and Prisma", () => {
    const env = { DB_USER: "u1_cms", DB_PASSWORD: "p@ss word", DB_NAME: "u1_sumenep", DB_SOCKET: "/var/lib/mysql/mysql.sock" };
    const url = runtimeDatabaseUrl(env);
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
      assert.throws(() => runtimeDatabaseUrl({ DATABASE_URL: value }), (error: Error) => {
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /JanganTampil/);
        return true;
      });
    }
  });
});
