import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { rawSqlViolation } from "@/server/db/guards";

describe("raw SQL screening (app-level guard)", () => {
  test("changes to the Activity Log are refused in every spelling", () => {
    for (const sql of [
      "UPDATE activity_log SET summary = 'x'",
      "update `activity_log` set summary = 'x' where id = 1",
      "DELETE FROM activity_log",
      "delete   from\n `sumenep_cms`.`activity_log` WHERE id = 2",
      "TRUNCATE activity_log",
      "TRUNCATE TABLE `activity_log`",
      "REPLACE INTO activity_log (id) VALUES (1)",
      "DROP TABLE activity_log",
      "ALTER TABLE activity_log DROP CONSTRAINT activity_log_meta_object",
      "RENAME TABLE activity_log TO x",
      "/* comment */ UPDATE activity_log SET summary = ''",
    ]) {
      assert.match(rawSqlViolation(sql) ?? "", /append-only|migrations only/, sql);
    }
  });

  test("deleting the Admin or the singletons, and DDL on triggers/tables, is refused", () => {
    for (const sql of [
      "DELETE FROM admin_user",
      "DELETE FROM `homepage_settings` WHERE id = 1",
      "delete from site_settings",
      "DROP TRIGGER IF EXISTS activity_log_append_only_update",
      "CREATE TRIGGER x BEFORE INSERT ON article FOR EACH ROW SET @a = 1",
      "ALTER TABLE admin_user DROP CONSTRAINT admin_user_single_admin",
      "DROP TABLE article",
    ]) {
      assert.notEqual(rawSqlViolation(sql), null, sql);
    }
  });

  test("what the app really runs is allowed", () => {
    for (const sql of [
      "SELECT failed_login_count AS failed, locked_until FROM admin_user WHERE id = 1 FOR UPDATE",
      "SELECT slug, status FROM article WHERE id = ? FOR UPDATE",
      "SELECT COUNT(*) FROM activity_log",
      "INSERT INTO activity_log (actor, action) VALUES ('SYSTEM', 'x.y')",
      "UPDATE admin_user SET password_changed_at = NOW(3) WHERE id = 1",
      "UPDATE admin_session SET created_at = NOW(3) WHERE revoked_at IS NULL",
      "SELECT * FROM article WHERE title LIKE '%update activity_log%'".replace("update activity_log", "laporan"),
    ]) {
      assert.equal(rawSqlViolation(sql), null, sql);
    }
  });
});
