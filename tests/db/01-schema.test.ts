import assert from "node:assert/strict";
import fs from "node:fs";
import { after, describe, test } from "node:test";

import { connect } from "../helpers/db";

const { owner, app, close } = connect();
after(close);

const EXPECTED_TABLES = [
  "_prisma_migrations",
  "activity_log",
  "admin_session",
  "admin_user",
  "article",
  "article_media",
  "article_revision",
  "article_slug_history",
  "article_status_change",
  "author",
  "homepage_featured",
  "homepage_rubric",
  "homepage_settings",
  "login_attempt",
  "media",
  "media_folder",
  "section",
  "site_settings",
];

describe("migrations", () => {
  test("every migration in prisma/migrations is applied, none failed", async () => {
    const folders = fs.readdirSync("prisma/migrations").filter((f) => /^\d{14}_/.test(f)).sort();
    const rows = await owner.$queryRaw<Array<{ migration_name: string; ok: boolean }>>`
      SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS ok
      FROM "_prisma_migrations" ORDER BY migration_name`;
    assert.deepEqual(
      rows.map((r) => r.migration_name),
      folders,
    );
    assert.ok(rows.every((r) => r.ok));
  });

  test("exactly the expected tables exist", async () => {
    const rows = await owner.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name::text FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
    assert.deepEqual(
      rows.map((r) => r.table_name),
      EXPECTED_TABLES,
    );
  });

  test("integrity CHECK constraints are installed", async () => {
    const rows = await owner.$queryRaw<Array<{ conname: string }>>`
      SELECT conname::text FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace`;
    const names = new Set(rows.map((r) => r.conname));
    for (const name of [
      "admin_user_single_admin",
      "admin_user_email_format",
      "admin_user_password_hash_scrypt",
      "admin_session_max_8_hours",
      "article_published_needs_date",
      "article_published_needs_hero",
      "article_published_needs_section",
      "article_slug_format",
      "section_slug_format",
      "author_slug_format",
      "homepage_settings_singleton",
      "site_settings_singleton",
      "activity_log_action_format",
      "media_sha256_hex",
    ]) {
      assert.ok(names.has(name), `missing CHECK ${name}`);
    }
  });

  test("triggers are installed and enabled", async () => {
    const rows = await owner.$queryRaw<Array<{ table: string; trigger: string; enabled: string }>>`
      SELECT c.relname::text AS "table", t.tgname::text AS "trigger", t.tgenabled::text AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal ORDER BY 1, 2`;
    assert.deepEqual(
      rows.map((r) => `${r.table}.${r.trigger}`),
      [
        "activity_log.activity_log_append_only",
        "activity_log.activity_log_stamp",
        "article.article_section_kinds",
        "article.article_slug_history",
        "article.article_status_history",
        "homepage_rubric.homepage_rubric_kind",
        "section.section_kind_immutable",
      ],
    );
    assert.ok(rows.every((r) => r.enabled === "O"), "all triggers enabled (O = origin)");
  });

  test("both roles get UTC sessions, so timestamps survive the round trip", async () => {
    // The pg driver adapter assumes UTC sessions (scripts/db/grants.ts).
    for (const db of [owner, app]) {
      const [row] = await db.$queryRaw<Array<{ tz: string; now: Date }>>`
        SELECT current_setting('TimeZone') AS tz, now() AS now`;
      assert.equal(row.tz, "UTC");
      assert.ok(Math.abs(row.now.getTime() - Date.now()) < 60_000, `database now() read back as ${row.now.toISOString()}`);
    }
    const instant = new Date("2026-08-17T03:00:00.000Z"); // 10:00 WIB
    const author = await app.author.create({ data: { slug: "uji-zona-waktu", name: "Uji" } });
    const article = await app.article.create({
      data: { slug: "uji-zona-waktu", title: "Uji", authorId: author.id, publishedAt: instant },
    });
    assert.equal(article.publishedAt?.toISOString(), instant.toISOString());
    const [raw] = await app.$queryRaw<Array<{ utc: string }>>`
      SELECT to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS utc FROM article WHERE id = ${article.id}::uuid`;
    assert.equal(raw.utc, "2026-08-17T03:00", "stored as the same instant");
    await app.article.delete({ where: { id: article.id } });
    await app.author.delete({ where: { id: author.id } });
  });

  test("the settings singletons exist right after migrating", async () => {
    assert.equal(await owner.homepageSettings.count(), 1);
    assert.equal(await owner.siteSettings.count(), 1);
    assert.equal((await owner.homepageSettings.findUniqueOrThrow({ where: { id: 1 } })).latestCount, 4);
  });
});
