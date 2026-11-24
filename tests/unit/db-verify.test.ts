import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { expectedTriggers, triggerStatements } from "../../scripts/db/triggers";
import { readExpectedObjects, tlsStatus } from "../../scripts/db/verify";

describe("db:verify — objek yang diharapkan dari SQL migrasi", () => {
  const expected = readExpectedObjects();

  test("membaca semua migrasi MariaDB, 17 tabel, 42 CHECK (sama dengan versi PostgreSQL)", () => {
    assert.deepEqual(expected.migrations, ["20261124020000_init", "20261124020100_integrity_rules"]);
    assert.equal(expected.tables.length, 17);
    assert.equal(expected.checks.length, 42);
  });

  test("aturan inti ikut diperiksa", () => {
    assert.ok(expected.checks.includes("admin_user_single_admin"));
    assert.ok(expected.checks.includes("activity_log_meta_object"));
    assert.ok(expected.tables.includes("activity_log"));
  });

  test("migrasi Prisma tidak memuat trigger (host tanpa SUPER menolak CREATE TRIGGER)", () => {
    for (const name of expected.migrations) {
      const sql = fs.readFileSync(path.join("prisma", "migrations", name, "migration.sql"), "utf8");
      assert.doesNotMatch(sql, /^\s*CREATE TRIGGER/im, name);
    }
  });
});

describe("db:triggers — trigger penjaga opsional", () => {
  test("11 trigger, hanya menolak atau mencap waktu (tidak menulis tabel lain)", () => {
    const names = expectedTriggers();
    assert.equal(names.length, 11);
    assert.ok(names.includes("activity_log_append_only_update"));
    assert.ok(names.includes("activity_log_append_only_delete"));
    assert.ok(names.includes("admin_user_no_delete"));
    for (const sql of triggerStatements().filter((s) => s.startsWith("CREATE TRIGGER"))) {
      assert.doesNotMatch(sql, /(INSERT INTO|UPDATE `|DELETE FROM)/i, sql.slice(0, 60));
    }
  });
});

describe("db:verify — TLS dari connection string", () => {
  test("database lokal tidak wajib TLS", () => {
    assert.equal(tlsStatus("mysql://u:p@127.0.0.1:33069/db").status, "ok");
    assert.equal(tlsStatus("mysql://u:p@localhost/db").status, "ok");
  });

  test("remote: ssl=true lolos, tanpa TLS diperingatkan", () => {
    const host = "mysql://u:p@srv123.hstgr.io:3306/u123_sumenep";
    assert.equal(tlsStatus(`${host}?ssl=true`).status, "ok");
    assert.equal(tlsStatus(host).status, "warn");
  });

  test("detail tidak memuat kredensial", () => {
    const detail = tlsStatus("mysql://user:rahasia@db.example.com/x").detail;
    assert.ok(!detail.includes("rahasia"));
  });
});
