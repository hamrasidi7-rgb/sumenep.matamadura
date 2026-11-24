import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { CHECKS, currentGrants, hasPrivilege } from "../../scripts/db/grants";
import { withConnection } from "../../scripts/lib/mariadb";
import { connect, DBERR, LAYERS, rawSql, rejects } from "../helpers/db";

const { app, close } = connect();
after(close);

const appUser = process.env.DB_APP_USER!;
const ownerUser = decodeURIComponent(new URL(process.env.DIRECT_URL!).username);

// The local test setup has a separate runtime user (like the PostgreSQL roles
// before). On Hostinger there may be only one user; then these rules are kept
// by the app-level guards and, when allowed, the triggers (tests/db/03 and 04).
describe("runtime user (DATABASE_URL) has least privilege", { skip: LAYERS.separateUser ? false : "single-user mode" }, () => {
  test("is a separate user with no global privileges", async () => {
    await withConnection(process.env.DATABASE_URL!, async (conn) => {
      const [me] = (await conn.query("SELECT SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS name")) as Array<{ name: string }>;
      assert.equal(me.name, appUser);
      assert.notEqual(appUser, ownerUser);
      const global = (await currentGrants(conn)).filter((g) => g.database === null);
      for (const grant of global) assert.deepEqual([...grant.privileges], ["USAGE"], "no privileges on *.*");
    });
  });

  test("cannot change the schema: no ALTER, DROP, CREATE, TRIGGER, TRUNCATE", async () => {
    await rejects(rawSql("app", "ALTER TABLE admin_user DROP CONSTRAINT admin_user_single_admin"), DBERR.privilege);
    await rejects(rawSql("app", "DROP TRIGGER IF EXISTS activity_log_append_only_update"), DBERR.privilege);
    await rejects(rawSql("app", "CREATE TABLE x (id int)"), DBERR.privilege);
    await rejects(rawSql("app", "TRUNCATE TABLE activity_log"), DBERR.privilege);
  });

  test("privilege matrix", async () => {
    const expected: Record<string, Record<string, boolean>> = {
      activity_log: { SELECT: true, INSERT: true, UPDATE: false, DELETE: false, DROP: false },
      admin_user: { SELECT: true, INSERT: false, UPDATE: true, DELETE: false, DROP: false },
      admin_session: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, DROP: false },
      homepage_settings: { SELECT: true, INSERT: false, UPDATE: true, DELETE: false, DROP: false },
      site_settings: { SELECT: true, INSERT: false, UPDATE: true, DELETE: false, DROP: false },
      article: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, DROP: false },
      section: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, DROP: false },
      _prisma_migrations: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, DROP: false },
    };
    const actual = await withConnection(process.env.DATABASE_URL!, async (conn) => {
      const [db] = (await conn.query("SELECT DATABASE() AS name")) as Array<{ name: string }>;
      const grants = await currentGrants(conn);
      const result: typeof expected = {};
      for (const [table, privileges] of Object.entries(expected)) {
        result[table] = {};
        for (const privilege of Object.keys(privileges)) result[table][privilege] = hasPrivilege(grants, db.name, table, privilege);
      }
      for (const [table, privilege, want] of CHECKS) assert.equal(hasPrivilege(grants, db.name, table, privilege), want, `${table}.${privilege}`);
      return result;
    });
    assert.deepEqual(actual, expected);
  });

  test("denied statements fail with permission errors", async () => {
    await rejects(rawSql("app", "SELECT * FROM _prisma_migrations"), DBERR.privilege);
    await rejects(rawSql("app", "INSERT INTO homepage_settings (id, updated_at) VALUES (2, NOW())"), DBERR.privilege);
    await rejects(rawSql("app", "DELETE FROM site_settings"), DBERR.privilege);
    await rejects(rawSql("app", "UPDATE activity_log SET summary = 'x' WHERE 1 = 0"), DBERR.privilege);
    // …while the allowed ones work.
    await app.homepageSettings.update({ where: { id: 1 }, data: { latestCount: 6 } });
    await app.homepageSettings.update({ where: { id: 1 }, data: { latestCount: 4 } });
  });
});
