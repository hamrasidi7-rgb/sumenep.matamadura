import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { describeTarget, splitSchema } from "@/server/db/client";
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
  const url = "postgresql://sumenep_app:rahasia%2Fsekali@db.contoh.id:5432/sumenep_cms?schema=cms&sslmode=require";

  test("?schema= goes to the adapter, other parameters stay", () => {
    const { connectionString, schema } = splitSchema(url);
    assert.equal(schema, "cms");
    assert.doesNotMatch(connectionString, /schema=/);
    assert.match(connectionString, /sslmode=require/);
  });

  test("target descriptions never contain credentials", () => {
    const target = describeTarget(url);
    assert.deepEqual(target, { host: "db.contoh.id:5432", database: "sumenep_cms", isLocal: false });
    assert.doesNotMatch(JSON.stringify(target), /rahasia|sumenep_app/);
    assert.equal(describeTarget("postgresql://u:p@127.0.0.1:54329/x").isLocal, true);
  });

  test("generated Prisma Client has no native query engine", () => {
    const dir = path.resolve("node_modules/.prisma/client");
    const files = fs.readdirSync(dir);
    assert.ok(files.includes("query_compiler_bg.wasm"), "WebAssembly query compiler present");
    assert.deepEqual(files.filter((f) => f.endsWith(".node")), [], "no platform-specific .node engine");
  });
});
