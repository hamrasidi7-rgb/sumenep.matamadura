import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { SECTIONS } from "@/content/sections";
import { seedInitialData } from "@/server/seed";

import { connect, resetData, runScript } from "../helpers/db";

const { owner, close } = connect();
after(close);
before(() => resetData(owner));

const ordered = () => owner.section.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });

describe("seed: kanal and rubrik", () => {
  test("first run creates the 5 kanal + 5 rubrik of the current site, in navigation order", async () => {
    assert.deepEqual(await seedInitialData(owner), { sectionsCreated: 10, homepageRubricCreated: true, authorsCreated: 1 });
    const rows = await ordered();
    const expected = (kind: "kanal" | "rubrik") =>
      SECTIONS.filter((s) => s.kind === kind).map((s, i) => ({
        kind: kind.toUpperCase(),
        slug: s.slug,
        name: s.name,
        description: s.description,
        sortOrder: i,
        isActive: true,
      }));
    assert.deepEqual(
      rows.map(({ kind, slug, name, description, sortOrder, isActive }) => ({ kind, slug, name, description, sortOrder, isActive })),
      [...expected("kanal"), ...expected("rubrik")],
    );
  });

  test("the Catatan Sumenep band is set up on the homepage (3 notes)", async () => {
    const bands = await owner.homepageRubric.findMany({ include: { section: true } });
    assert.deepEqual(
      bands.map((b) => [b.section.slug, b.position, b.itemCount]),
      [["catatan-sumenep", 0, 3]],
    );
  });

  test("running again changes nothing and never overwrites CMS edits", async () => {
    await owner.section.update({
      where: { kind_slug: { kind: "KANAL", slug: "ekonomi" } },
      data: { name: "Ekonomi & Bisnis" },
    });
    await owner.homepageRubric.deleteMany();
    const before = await ordered();
    assert.deepEqual(await seedInitialData(owner), { sectionsCreated: 0, homepageRubricCreated: false, authorsCreated: 0 });
    assert.deepEqual(await ordered(), before);
    assert.equal(await owner.homepageRubric.count(), 0, "a band removed in the CMS stays removed");
    assert.equal(await owner.activityLog.count({ where: { action: "system.seed" } }), 1, "logged once, on the run that created data");
  });

  test("npm run db:seed (CLI) is idempotent too", async () => {
    const run = runScript("scripts/db/seed.ts", []);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /0 kanal\/rubrik baru.*Total: 5 kanal, 5 rubrik/);
  });
});
