import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { AdminExistsError, bootstrapAdmin } from "@/server/admin/bootstrap";
import { verifyPassword } from "@/server/auth/password";

import { connect, rejects, resetData, runScript } from "../helpers/db";
import { escapeRegExp, TEST_PASSWORD, TEST_PASSWORD_2 } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);
beforeEach(() => resetData(owner));

const INPUT = { email: "  Redaksi@Sumenep.TEST ", name: "Redaksi Sumenep", password: TEST_PASSWORD };

describe("bootstrap creates the first Admin", () => {
  test("row id 1, normalised email, scrypt hash, activity logged", async () => {
    const admin = await bootstrapAdmin(owner, INPUT);
    assert.equal(admin.id, 1);
    assert.equal(admin.email, "redaksi@sumenep.test");

    const row = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.match(row.passwordHash, /^scrypt\$/);
    assert.equal(await verifyPassword(TEST_PASSWORD, row.passwordHash), true);
    assert.equal(row.failedLoginCount, 0);

    const log = await owner.activityLog.findMany();
    assert.equal(log.length, 1);
    assert.equal(log[0].action, "admin.bootstrap");
    assert.equal(log[0].actor, "CLI");
    assert.equal(log[0].adminId, 1);
    const text = JSON.stringify(log[0], (_, v) => (typeof v === "bigint" ? v.toString() : v));
    assert.doesNotMatch(text, new RegExp(`scrypt|${escapeRegExp(TEST_PASSWORD)}`), "no secret in the log");
  });
});

describe("a second Admin is impossible", () => {
  test("bootstrap refuses once an Admin exists", async () => {
    await bootstrapAdmin(owner, INPUT);
    await assert.rejects(
      bootstrapAdmin(owner, { ...INPUT, email: "lain@sumenep.test", password: TEST_PASSWORD_2 }),
      AdminExistsError,
    );
    assert.equal(await owner.adminUser.count(), 1);
  });

  test("two bootstraps racing: exactly one wins (primary key on id = 1)", async () => {
    const results = await Promise.allSettled([
      bootstrapAdmin(owner, { ...INPUT, email: "satu@sumenep.test" }),
      bootstrapAdmin(owner, { ...INPUT, email: "dua@sumenep.test" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof AdminExistsError, String(rejected.reason));
    assert.equal(await owner.adminUser.count(), 1);
  });

  test("database rejects id ≠ 1 (CHECK) and a second id = 1 (PRIMARY KEY) — even for the owner", async () => {
    await bootstrapAdmin(owner, INPUT);
    await rejects(
      owner.$executeRawUnsafe(
        `INSERT INTO "admin_user" ("id", "email", "name", "password_hash", "updated_at") VALUES (2, 'dua@sumenep.test', 'Dua', 'scrypt$x', now())`,
      ),
      /23514/,
      /admin_user_single_admin/,
    );
    await rejects(
      owner.adminUser.create({ data: { id: 2, email: "dua@sumenep.test", name: "Dua", passwordHash: "scrypt$x" } }),
      /23514/,
      /admin_user_single_admin/,
    );
    await rejects(
      owner.adminUser.create({ data: { email: "dua@sumenep.test", name: "Dua", passwordHash: "scrypt$x" } }),
      /23505/,
      /admin_user_pkey/,
    );
    await rejects(owner.$executeRawUnsafe(`UPDATE "admin_user" SET "id" = 2`), /23514|23503/);
    assert.equal(await owner.adminUser.count(), 1);
  });

  test("the runtime role can neither create nor delete the Admin", async () => {
    await rejects(app.adminUser.create({ data: { email: "app@sumenep.test", name: "App", passwordHash: "scrypt$x" } }), /42501/);
    await bootstrapAdmin(owner, INPUT);
    await rejects(app.adminUser.delete({ where: { id: 1 } }), /42501/);
    await rejects(app.$executeRawUnsafe(`DELETE FROM "admin_user"`), /42501/);
    // once the bootstrap is logged, even the owner cannot delete the Admin
    await rejects(owner.adminUser.delete({ where: { id: 1 } }), /23503/, /activity_log_admin_id_fkey/);
    assert.equal(await owner.adminUser.count(), 1);
  });

  test("email and hash format are enforced by the database", async () => {
    await bootstrapAdmin(owner, INPUT);
    await rejects(owner.$executeRawUnsafe(`UPDATE "admin_user" SET "email" = 'Besar@Sumenep.test'`), /admin_user_email_format/);
    await rejects(owner.$executeRawUnsafe(`UPDATE "admin_user" SET "password_hash" = 'plaintext'`), /admin_user_password_hash_scrypt/);
  });
});

describe("npm run admin:bootstrap (CLI)", () => {
  const script = "scripts/admin/bootstrap.ts";

  test("creates the Admin from --password-stdin", async () => {
    const run = runScript(script, ["--email", "cli@sumenep.test", "--name", "Admin CLI", "--password-stdin"], `${TEST_PASSWORD}\n`);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Admin dibuat: cli@sumenep\.test/);
    assert.doesNotMatch(run.stdout + run.stderr, new RegExp(escapeRegExp(TEST_PASSWORD)), "password never echoed");
    const row = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(TEST_PASSWORD, row.passwordHash), true);
  });

  test("refuses with exit code 2 when an Admin already exists", async () => {
    await bootstrapAdmin(owner, INPUT);
    const run = runScript(script, ["--email", "kedua@sumenep.test", "--name", "Kedua", "--password-stdin"], `${TEST_PASSWORD_2}\n`);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /Admin sudah ada/);
    assert.equal(await owner.adminUser.count(), 1);
    assert.equal((await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } })).email, "redaksi@sumenep.test");
  });

  test("weak password → exit code 3, nothing created", async () => {
    const run = runScript(script, ["--email", "cli@sumenep.test", "--name", "Admin CLI", "--password-stdin"], "pendek\n");
    assert.equal(run.status, 3);
    assert.match(run.stderr, /minimal 15 karakter/);
    assert.equal(await owner.adminUser.count(), 0);
  });

  test("--generate shows a strong password once, and it works", async () => {
    const run = runScript(script, ["--email", "gen@sumenep.test", "--name", "Admin Gen", "--generate"]);
    assert.equal(run.status, 0, run.stderr);
    const password = run.stdout.match(/^ {2}([A-Za-z0-9_-]{24})$/m)?.[1];
    assert.ok(password, "generated password printed on its own line");
    const row = await owner.adminUser.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(await verifyPassword(password, row.passwordHash), true);
  });

  test("no TTY and no password source → refused, nothing created", async () => {
    const run = runScript(script, ["--email", "cli@sumenep.test", "--name", "Admin CLI"]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /--password-stdin atau --generate/);
    assert.equal(await owner.adminUser.count(), 0);
  });
});
