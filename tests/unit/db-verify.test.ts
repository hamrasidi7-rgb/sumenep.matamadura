import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readExpectedObjects, tlsStatus } from "../../scripts/db/verify";

describe("db:verify — objek yang diharapkan dari SQL migrasi", () => {
  const expected = readExpectedObjects();

  test("membaca semua migrasi, 17 tabel, 42 CHECK, 7 trigger", () => {
    assert.deepEqual(expected.migrations, ["20261120193912_init", "20261120194038_integrity_rules"]);
    assert.equal(expected.tables.length, 17);
    assert.equal(expected.checks.length, 42);
    assert.equal(expected.triggers.length, 7);
  });

  test("aturan inti ikut diperiksa", () => {
    assert.ok(expected.checks.includes("admin_user_single_admin"));
    assert.ok(expected.triggers.includes("activity_log_append_only"));
    assert.ok(expected.triggers.includes("activity_log_stamp"));
    assert.ok(expected.tables.includes("activity_log"));
  });
});

describe("db:verify — TLS dari connection string", () => {
  test("database lokal tidak wajib TLS", () => {
    assert.equal(tlsStatus("postgresql://u:p@127.0.0.1:54329/db").status, "ok");
  });

  test("remote: verify-full lolos, require diperingatkan, tanpa sslmode gagal", () => {
    const host = "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb";
    assert.equal(tlsStatus(`${host}?sslmode=verify-full&schema=public`).status, "ok");
    assert.equal(tlsStatus(`${host}?sslmode=require`).status, "warn");
    assert.equal(tlsStatus(host).status, "fail");
    assert.equal(tlsStatus(`${host}?sslmode=disable`).status, "fail");
  });

  test("detail tidak memuat kredensial", () => {
    const detail = tlsStatus("postgresql://user:rahasia@db.example.com/x").detail;
    assert.ok(!detail.includes("rahasia"));
  });
});
