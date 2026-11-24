import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { logActivity } from "@/server/activity-log";

import { connect, DBERR, LAYERS, rawSql, rejects, resetData } from "../helpers/db";
import { insertAdmin } from "../helpers/fixtures";

const { owner, app, close } = connect();
after(close);

async function snapshot() {
  const rows = await owner.activityLog.findMany({ orderBy: { id: "asc" } });
  return JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

before(async () => {
  await resetData(owner);
  await insertAdmin(owner);
  await logActivity(app, { actor: "ADMIN", adminId: 1, action: "auth.login", summary: "Login berhasil." });
  await logActivity(app, { actor: "ADMIN", adminId: 1, action: "article.publish", entityType: "article", entityId: "x" });
  await logActivity(app, { actor: "SYSTEM", action: "system.seed", meta: { sectionsCreated: 10 } });
});

// Layers (MariaDB on shared hosting cannot always have all of them):
//   1. app-level guard on every Prisma client (always)      → GuardError
//   2. guard triggers, when the server allows CREATE TRIGGER → SIGNAL 1644
//   3. separate runtime user without UPDATE/DELETE/DROP     → error 1142
describe("Activity Log is append-only", () => {
  test("the runtime user can add entries; the time is always the database's", async () => {
    const count = await owner.activityLog.count();
    const row = await app.activityLog.create({
      data: { actor: "SYSTEM", action: "test.backdate", createdAt: new Date("2000-01-01T00:00:00Z") },
    });
    assert.equal(await owner.activityLog.count(), count + 1);
    assert.ok(Math.abs(row.createdAt.getTime() - Date.now()) < 60_000, `created_at forced to now, got ${row.createdAt.toISOString()}`);
    await app.activityLog.createMany({ data: [{ actor: "SYSTEM", action: "test.backdate_many", createdAt: new Date("2000-01-01T00:00:00Z") }] });
    const many = await owner.activityLog.findFirstOrThrow({ where: { action: "test.backdate_many" } });
    assert.ok(Math.abs(many.createdAt.getTime() - Date.now()) < 60_000, "createMany cannot backdate either");
  });

  test("layer 1 — every update/delete through Prisma is refused, for the owner client too", async () => {
    const state = await snapshot();
    for (const db of [app, owner]) {
      await rejects(db.activityLog.update({ where: { id: 1n }, data: { summary: "diubah" } }), DBERR.guard, /append-only: UPDATE/);
      await rejects(db.activityLog.updateMany({ data: { summary: "diubah" } }), DBERR.guard, /append-only: UPDATE/);
      await rejects(
        db.activityLog.upsert({ where: { id: 1n }, create: { actor: "SYSTEM", action: "x.y" }, update: { summary: "x" } }),
        DBERR.guard,
        /append-only/,
      );
      await rejects(db.activityLog.delete({ where: { id: 1n } }), DBERR.guard, /append-only: DELETE/);
      await rejects(db.activityLog.deleteMany({}), DBERR.guard, /append-only: DELETE/);
    }
    // …also inside an interactive transaction.
    await rejects(
      app.$transaction((tx) => tx.activityLog.deleteMany({})),
      DBERR.guard,
    );
    // …and as raw SQL through Prisma (template and *Unsafe forms).
    for (const db of [app, owner]) {
      await rejects(db.$executeRaw`UPDATE activity_log SET summary = ${"diubah"}`, DBERR.guard, /append-only/);
      await rejects(db.$executeRawUnsafe("DELETE FROM `activity_log` WHERE id = 1"), DBERR.guard, /append-only/);
      await rejects(db.$executeRawUnsafe("TRUNCATE TABLE activity_log"), DBERR.guard, /append-only/);
      await rejects(db.$executeRawUnsafe("DROP TRIGGER IF EXISTS activity_log_append_only_update"), DBERR.guard, /migrations only/);
    }
    assert.ok((await owner.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM activity_log`).length === 1, "reading is still allowed");
    assert.equal(await snapshot(), state, "no entry changed");
  });

  test("layer 2 — the guard triggers reject UPDATE and DELETE even for the owner", { skip: LAYERS.triggers ? false : "server refuses CREATE TRIGGER (binlog, no SUPER)" }, async () => {
    const state = await snapshot();
    await rejects(rawSql("owner", "UPDATE activity_log SET summary = 'diubah'"), DBERR.signal, /append-only: UPDATE/);
    await rejects(rawSql("owner", "DELETE FROM activity_log"), DBERR.signal, /append-only: DELETE/);
    await rejects(rawSql("owner", "DELETE FROM activity_log WHERE id = 1"), /append-only: DELETE/);
    assert.equal(await snapshot(), state, "no entry changed");
  });

  test("layer 3 — the runtime user has no UPDATE/DELETE/DROP privilege at all", { skip: LAYERS.separateUser ? false : "single-user mode" }, async () => {
    const state = await snapshot();
    await rejects(rawSql("app", "UPDATE activity_log SET summary = 'diubah'"), DBERR.privilege);
    await rejects(rawSql("app", "DELETE FROM activity_log"), DBERR.privilege);
    await rejects(rawSql("app", "TRUNCATE TABLE activity_log"), DBERR.privilege);
    await rejects(rawSql("app", "DROP TRIGGER IF EXISTS activity_log_append_only_update"), DBERR.privilege);
    assert.equal(await snapshot(), state, "no entry changed");
  });

  test("entries keep their Admin: the Admin cannot be deleted from under them", async () => {
    await rejects(owner.adminUser.delete({ where: { id: 1 } }), DBERR.guard);
    await rejects(rawSql("owner", "DELETE FROM admin_user WHERE id = 1"), LAYERS.triggers ? DBERR.signal : DBERR.foreignKey);
  });

  test("entry format is checked by the database", async () => {
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "Bukan Format" } }), /activity_log_action_format/);
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "tanpatitik" } }), /activity_log_action_format/);
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "Auth.Login" } }), /activity_log_action_format/);
    await rejects(app.activityLog.create({ data: { actor: "ADMIN", action: "auth.login" } }), /activity_log_admin_actor_has_admin/);
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "x.y", meta: [1, 2] } }), /activity_log_meta_object/);
  });
});
