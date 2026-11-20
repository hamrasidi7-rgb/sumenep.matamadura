import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { connect, rejects } from "../helpers/db";

const { owner, app, close } = connect();
after(close);

const appRole = process.env.DB_APP_ROLE!;
const ownerRole = decodeURIComponent(new URL(process.env.DIRECT_URL!).username);

async function can(table: string, privilege: string): Promise<boolean> {
  const [row] = await owner.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT has_table_privilege($1, $2, $3) AS ok`,
    appRole,
    `public."${table}"`,
    privilege,
  );
  return row.ok;
}

describe("runtime role (DATABASE_URL) has least privilege", () => {
  test("is a plain login role, separate from the owner", async () => {
    const [me] = await app.$queryRaw<Array<Record<string, boolean | string>>>`
      SELECT current_user::text AS name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
      FROM pg_roles WHERE rolname = current_user`;
    assert.equal(me.name, appRole);
    assert.notEqual(appRole, ownerRole);
    for (const attribute of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolbypassrls", "rolreplication"]) {
      assert.equal(me[attribute], false, attribute);
    }
    const [membership] = await app.$queryRawUnsafe<Array<{ member: boolean }>>(
      `SELECT pg_has_role(current_user, $1, 'MEMBER') AS member`,
      ownerRole,
    );
    assert.equal(membership.member, false, "app role must not inherit the owner's rights");
  });

  test("owns no table, so it cannot alter tables or switch triggers off", async () => {
    const [row] = await app.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`;
    assert.equal(Number(row.n), 0);
    await rejects(app.$executeRawUnsafe(`ALTER TABLE "activity_log" DISABLE TRIGGER "activity_log_append_only"`), /42501/, /must be owner/);
    await rejects(app.$executeRawUnsafe(`ALTER TABLE "admin_user" DROP CONSTRAINT "admin_user_single_admin"`), /42501/, /must be owner/);
    await rejects(app.$executeRawUnsafe(`CREATE TABLE "x" (id int)`), /42501/, /permission denied for schema public/);
  });

  test("privilege matrix", async () => {
    const expected: Record<string, Record<string, boolean>> = {
      activity_log: { SELECT: true, INSERT: true, UPDATE: false, DELETE: false, TRUNCATE: false },
      admin_user: { SELECT: true, INSERT: false, UPDATE: true, DELETE: false, TRUNCATE: false },
      admin_session: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: false },
      homepage_settings: { SELECT: true, INSERT: false, UPDATE: true, DELETE: false, TRUNCATE: false },
      site_settings: { SELECT: true, INSERT: false, UPDATE: true, DELETE: false, TRUNCATE: false },
      article: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: false },
      section: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: false },
      _prisma_migrations: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
    };
    const actual: typeof expected = {};
    for (const [table, privileges] of Object.entries(expected)) {
      actual[table] = {};
      for (const privilege of Object.keys(privileges)) actual[table][privilege] = await can(table, privilege);
    }
    assert.deepEqual(actual, expected);
  });

  test("denied statements fail with permission errors", async () => {
    await rejects(app.$queryRawUnsafe(`SELECT * FROM "_prisma_migrations"`), /42501/);
    await rejects(app.$executeRawUnsafe(`INSERT INTO "homepage_settings" ("id", "updated_at") VALUES (2, now())`), /42501/);
    await rejects(app.$executeRawUnsafe(`DELETE FROM "site_settings"`), /42501/);
    // …while the allowed ones work.
    await app.homepageSettings.update({ where: { id: 1 }, data: { latestCount: 6 } });
    await app.homepageSettings.update({ where: { id: 1 }, data: { latestCount: 4 } });
  });
});
