import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { describeTarget, poolConfig, SESSION_SETUP_SQL } from "@/server/db/client";
import {
  adminBootstrapSchema,
  adminEmailSchema,
  adminNameSchema,
  adminPasswordSchema,
  firstIssue,
} from "@/server/validation/admin";
import { sectionInputSchema, slugSchema } from "@/server/validation/common";

describe("admin input (zod)", () => {
  test("email is trimmed, lowercased and validated", () => {
    assert.equal(adminEmailSchema.parse("  Redaksi@MataMaduraNews.COM "), "redaksi@matamaduranews.com");
    for (const bad of ["", "redaksi", "redaksi@", "@contoh.id", "a b@contoh.id", `${"a".repeat(250)}@contoh.id`]) {
      assert.equal(adminEmailSchema.safeParse(bad).success, false, bad);
    }
  });

  test("name is trimmed and required", () => {
    assert.equal(adminNameSchema.parse("  Redaksi Sumenep "), "Redaksi Sumenep");
    assert.equal(adminNameSchema.safeParse("   ").success, false);
    assert.equal(adminNameSchema.safeParse("x".repeat(121)).success, false);
  });

  test("password policy: 15–256 characters, no edge spaces, not uniform", () => {
    assert.equal(adminPasswordSchema.safeParse("garam pulau kangean 2026").success, true);
    const cases: Array<[string, RegExp]> = [
      ["pendek-sekali", /minimal 15/],
      ["x".repeat(257), /maksimal 256/],
      [" garam pulau kangean", /spasi/],
      ["garam pulau kangean ", /spasi/],
      ["aaaaaaaaaaaaaaaaaaaa", /seragam/],
    ];
    for (const [value, message] of cases) {
      const result = adminPasswordSchema.safeParse(value);
      assert.equal(result.success, false, value);
      assert.match(firstIssue(result.error!), message);
    }
  });

  test("bootstrap input rejects unknown shapes", () => {
    assert.equal(adminBootstrapSchema.safeParse({ email: "a@b.co", name: "A" }).success, false);
    assert.equal(adminBootstrapSchema.safeParse(null).success, false);
  });
});

describe("slugs and sections (zod)", () => {
  test("slug rule matches the database CHECK", () => {
    for (const ok of ["catatan-sumenep", "pendidikan", "orang-sumenep-2026", "a1"]) {
      assert.equal(slugSchema().safeParse(ok).success, true, ok);
    }
    for (const bad of ["Catatan", "catatan sumenep", "-awal", "akhir-", "dua--strip", "ä", ""]) {
      assert.equal(slugSchema().safeParse(bad).success, false, bad);
    }
    assert.equal(slugSchema(10).safeParse("sebelas-kar").success, false);
  });

  test("section input fills defaults", () => {
    assert.deepEqual(sectionInputSchema.parse({ kind: "RUBRIK", slug: "suara-kepulauan", name: " Suara Kepulauan " }), {
      kind: "RUBRIK",
      slug: "suara-kepulauan",
      name: "Suara Kepulauan",
      description: "",
      sortOrder: 0,
    });
    assert.equal(sectionInputSchema.safeParse({ kind: "TAG", slug: "x", name: "X" }).success, false);
  });
});

describe("database client helpers", () => {
  const url = "mysql://sumenep_app:rahasia%2Fsekali@db.contoh.id:3306/sumenep_cms?ssl=true";

  test("mysql:// URL → mariadb pool settings (decoded password, UTC sessions, TLS on request)", () => {
    const config = poolConfig(url, { max: 3 });
    assert.equal(config.host, "db.contoh.id");
    assert.equal(config.port, 3306);
    assert.equal(config.user, "sumenep_app");
    assert.equal(config.password, "rahasia/sekali");
    assert.equal(config.database, "sumenep_cms");
    assert.equal(config.connectionLimit, 3);
    assert.equal(config.initSql, SESSION_SETUP_SQL);
    assert.ok(SESSION_SETUP_SQL.startsWith("SET time_zone = '+00:00'"));
    // MariaDB-only executable comment: snapshot isolation off on 11.6.2+, ignored by older servers.
    assert.ok(SESSION_SETUP_SQL.includes("/*M!110602 , innodb_snapshot_isolation = OFF */"));
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    assert.equal(poolConfig("mysql://u:p@localhost/x").ssl, undefined);
    assert.equal(poolConfig("mysql://u:p@localhost/x").port, 3306);
  });

  test("only mysql:// connection strings are accepted", () => {
    assert.throws(() => poolConfig("postgresql://u:p@localhost/x"), /diawali mysql:/);
    assert.throws(() => poolConfig("mysql://u:p@localhost/"), /Nama database/);
  });

  test("target descriptions never contain credentials", () => {
    const target = describeTarget(url);
    assert.deepEqual(target, { host: "db.contoh.id:3306", database: "sumenep_cms", isLocal: false });
    assert.doesNotMatch(JSON.stringify(target), /rahasia|sumenep_app/);
    assert.equal(describeTarget("mysql://u:p@127.0.0.1:33069/x").isLocal, true);
  });

  test("generated Prisma Client has no native query engine", () => {
    const dir = path.resolve("node_modules/.prisma/client");
    const files = fs.readdirSync(dir);
    assert.ok(files.includes("query_compiler_bg.wasm"), "WebAssembly query compiler present");
    assert.deepEqual(files.filter((f) => f.endsWith(".node")), [], "no platform-specific .node engine");
  });
});
