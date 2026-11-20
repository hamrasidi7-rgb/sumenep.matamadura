import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { logActivity } from "@/server/activity-log";

import { connect, rejects, resetData } from "../helpers/db";
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

describe("Activity Log is append-only", () => {
  test("the runtime role can add entries; the time is always the database's", async () => {
    const before = await owner.activityLog.count();
    const row = await app.activityLog.create({
      data: { actor: "SYSTEM", action: "test.backdate", createdAt: new Date("2000-01-01T00:00:00Z") },
    });
    assert.equal(await owner.activityLog.count(), before + 1);
    assert.ok(Math.abs(row.createdAt.getTime() - Date.now()) < 60_000, `created_at forced to now(), got ${row.createdAt.toISOString()}`);
  });

  test("UPDATE, DELETE and TRUNCATE are rejected by the trigger — even for the table owner", async () => {
    const state = await snapshot();
    await rejects(owner.$executeRawUnsafe(`UPDATE "activity_log" SET "summary" = 'diubah'`), /P0001/, /append-only: UPDATE/);
    await rejects(owner.$executeRawUnsafe(`UPDATE "activity_log" SET "summary" = 'x' WHERE false`), /append-only: UPDATE/);
    await rejects(owner.$executeRawUnsafe(`DELETE FROM "activity_log"`), /P0001/, /append-only: DELETE/);
    await rejects(owner.$executeRawUnsafe(`DELETE FROM "activity_log" WHERE "id" = 1`), /append-only: DELETE/);
    await rejects(owner.$executeRawUnsafe(`TRUNCATE "activity_log"`), /P0001/, /append-only: TRUNCATE/);
    await rejects(owner.$executeRawUnsafe(`TRUNCATE "admin_user" CASCADE`), /append-only: TRUNCATE/);
    await rejects(owner.activityLog.updateMany({ data: { summary: "diubah" } }), /append-only: UPDATE/);
    await rejects(owner.activityLog.deleteMany({}), /append-only: DELETE/);
    assert.equal(await snapshot(), state, "no entry changed");
  });

  test("the runtime role has no UPDATE/DELETE/TRUNCATE privilege at all", async () => {
    const state = await snapshot();
    await rejects(app.$executeRawUnsafe(`UPDATE "activity_log" SET "summary" = 'diubah'`), /42501/, /permission denied/);
    await rejects(app.$executeRawUnsafe(`DELETE FROM "activity_log"`), /42501/);
    await rejects(app.$executeRawUnsafe(`TRUNCATE "activity_log"`), /42501/);
    await rejects(app.activityLog.update({ where: { id: 1n }, data: { summary: "diubah" } }), /42501/);
    await rejects(app.activityLog.delete({ where: { id: 1n } }), /42501/);
    await rejects(app.activityLog.deleteMany({}), /42501/);
    await rejects(app.$executeRawUnsafe(`ALTER TABLE "activity_log" DISABLE TRIGGER "activity_log_append_only"`), /must be owner/);
    assert.equal(await snapshot(), state, "no entry changed");
  });

  test("entries keep their Admin: the Admin cannot be deleted from under them", async () => {
    await rejects(owner.adminUser.delete({ where: { id: 1 } }), /23503/, /activity_log_admin_id_fkey/);
  });

  test("entry format is checked", async () => {
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "Bukan Format" } }), /activity_log_action_format/);
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "tanpatitik" } }), /activity_log_action_format/);
    await rejects(app.activityLog.create({ data: { actor: "ADMIN", action: "auth.login" } }), /activity_log_admin_actor_has_admin/);
    await rejects(app.activityLog.create({ data: { actor: "SYSTEM", action: "x.y", meta: [1, 2] } }), /activity_log_meta_object/);
  });
});
