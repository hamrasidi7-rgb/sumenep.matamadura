import assert from "node:assert/strict";
import fs from "node:fs";
import { after, describe, test } from "node:test";

import { expectedTriggers } from "../../scripts/db/triggers";
import { connect, LAYERS, rawSql } from "../helpers/db";

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

describe("migrations (MariaDB)", () => {
  test("every migration in prisma/migrations is applied, none failed", async () => {
    const folders = fs.readdirSync("prisma/migrations").filter((f) => /^\d{14}_/.test(f)).sort();
    const rows = await owner.$queryRaw<Array<{ migration_name: string; ok: number | boolean }>>`
      SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS ok
      FROM _prisma_migrations ORDER BY migration_name`;
    assert.deepEqual(
      rows.map((r) => r.migration_name),
      folders,
    );
    assert.ok(rows.every((r) => Number(r.ok) === 1));
  });

  test("exactly the expected tables exist, all InnoDB with utf8mb4", async () => {
    const rows = await owner.$queryRaw<Array<{ name: string; engine: string; collation: string }>>`
      SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`;
    assert.deepEqual(
      rows.map((r) => r.name).sort(),
      EXPECTED_TABLES,
    );
    for (const row of rows) {
      assert.equal(row.engine, "InnoDB", row.name);
      assert.match(row.collation, /^utf8mb4_/, row.name);
    }
  });

  test("all 18 foreign keys exist (as in PostgreSQL), with the same delete rules", async () => {
    const rows = await owner.$queryRaw<Array<{ name: string; del: string }>>`
      SELECT CONSTRAINT_NAME AS name, DELETE_RULE AS del FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY CONSTRAINT_NAME`;
    assert.equal(rows.length, 18);
    const rule = Object.fromEntries(rows.map((r) => [r.name, r.del]));
    assert.equal(rule.admin_session_admin_id_fkey, "CASCADE");
    assert.equal(rule.article_author_id_fkey, "RESTRICT");
    assert.equal(rule.article_hero_media_id_fkey, "RESTRICT");
    assert.equal(rule.article_media_media_id_fkey, "RESTRICT");
    assert.equal(rule.article_slug_history_article_id_fkey, "CASCADE");
    assert.equal(rule.media_folder_id_fkey, "SET NULL");
    assert.equal(rule.homepage_settings_hero_article_id_fkey, "SET NULL");
    assert.equal(rule.activity_log_admin_id_fkey, "RESTRICT");
  });

  test("integrity CHECK constraints are installed (42, as in PostgreSQL)", async () => {
    const rows = await owner.$queryRaw<Array<{ name: string }>>`
      SELECT CONSTRAINT_NAME AS name FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`;
    const names = new Set(rows.map((r) => r.name));
    for (const name of [
      "admin_user_single_admin",
      "admin_user_email_format",
      "admin_user_password_hash_scrypt",
      "admin_session_max_8_hours",
      "article_published_needs_date",
      "article_published_needs_hero",
      "article_published_needs_section",
      "article_slug_format",
      "article_tags_array",
      "section_slug_format",
      "author_slug_format",
      "homepage_settings_singleton",
      "site_settings_singleton",
      "activity_log_action_format",
      "activity_log_meta_object",
      "media_sha256_hex",
    ]) {
      assert.ok(names.has(name), `missing CHECK ${name}`);
    }
    // 42 named rules + MariaDB's own json_valid() check on each of the 6 JSON columns.
    assert.equal(rows.length, 48);
  });

  test("guard triggers: all installed when the server allows it, none otherwise", async () => {
    const rows = await owner.$queryRaw<Array<{ name: string }>>`
      SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() ORDER BY 1`;
    assert.deepEqual(
      rows.map((r) => r.name),
      LAYERS.triggers ? expectedTriggers() : [],
    );
  });

  test("every connection runs in UTC, so timestamps survive the round trip", async () => {
    // The local test server runs in +07:00 on purpose: only the per-connection
    // setting (src/server/db/client.ts) makes these sessions UTC.
    for (const db of [owner, app]) {
      const [row] = await db.$queryRaw<Array<{ tz: string; offset_s: number | bigint }>>`
        SELECT @@session.time_zone AS tz, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offset_s`;
      assert.equal(row.tz, "+00:00");
      assert.equal(Number(row.offset_s), 0);
    }
    const [server] = await owner.$queryRaw<Array<{ tz: string }>>`SELECT @@global.time_zone AS tz`;
    assert.notEqual(server.tz, "+00:00", "the test server itself is not UTC (otherwise this test proves nothing)");

    const instant = new Date("2026-08-17T03:00:00.000Z"); // 10:00 WIB
    const author = await app.author.create({ data: { slug: "uji-zona-waktu", name: "Uji" } });
    const article = await app.article.create({
      data: { slug: "uji-zona-waktu", title: "Uji", authorId: author.id, publishedAt: instant },
    });
    assert.equal(article.publishedAt?.toISOString(), instant.toISOString());
    const [raw] = await app.$queryRaw<Array<{ utc: string }>>`
      SELECT DATE_FORMAT(published_at, '%Y-%m-%dT%H:%i') AS utc FROM article WHERE id = ${article.id}`;
    assert.equal(raw.utc, "2026-08-17T03:00", "stored as the same instant (UTC)");
    // A DEFAULT CURRENT_TIMESTAMP column filled by the database is UTC too.
    await rawSql("owner", "INSERT INTO media_folder (id, name) VALUES (UUID(), 'uji-zona')");
    const folder = await app.mediaFolder.findUniqueOrThrow({ where: { name: "uji-zona" } });
    assert.ok(Math.abs(folder.createdAt.getTime() - Date.now()) < 60_000, `DB default read back as ${folder.createdAt.toISOString()}`);
    await app.mediaFolder.delete({ where: { id: folder.id } });
    await app.article.delete({ where: { id: article.id } });
    await app.author.delete({ where: { id: author.id } });
  });

  test("the settings singletons exist right after migrating", async () => {
    assert.equal(await owner.homepageSettings.count(), 1);
    assert.equal(await owner.siteSettings.count(), 1);
    assert.equal((await owner.homepageSettings.findUniqueOrThrow({ where: { id: 1 } })).latestCount, 4);
  });
});
