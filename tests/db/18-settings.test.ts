import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  getCmsSettingsData,
  updateHomepageSettings,
  updateSiteSettings,
} from "@/server/settings/service";

import { connect, resetData } from "../helpers/db";
import { insertAdmin, makeAuthor, makeMedia } from "../helpers/fixtures";

const { owner, app, close } = connect();
const actor = { adminId: 1 };

before(async () => {
  await resetData(owner);
  await insertAdmin(owner);
});

after(async () => {
  await close();
});

describe("site & homepage settings service (Fase 9 DB)", () => {
  test("saves SiteSettings & HomepageSettings cleanly, enforces RUBRIK-only & published-article guards", async () => {
    const now = new Date();
    const ogMedia = await makeMedia(owner, "og-default");
    const author = await makeAuthor(owner, "redaksi-setting");
    const kanal = await owner.section.create({ data: { kind: "KANAL", slug: "berita", name: "Berita" } });
    const rubrik = await owner.section.create({
      data: { kind: "RUBRIK", slug: "catatan-sumenep", name: "Catatan Sumenep" },
    });
    const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi." }] }] };

    const pubArticle = await owner.article.create({
      data: {
        slug: "headline-setting",
        title: "Headline Setting",
        standfirst: "Ringkasan headline.",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: ogMedia.id,
        status: "PUBLISHED",
        publishedAt: now,
        body,
      },
    });
    const draftArticle = await owner.article.create({
      data: {
        slug: "draf-setting",
        title: "Draf Setting",
        kanalId: kanal.id,
        authorId: author.id,
        status: "DRAFT",
        body,
      },
    });

    const siteSave = await updateSiteSettings(
      app,
      {
        tagline: "Suara Sumenep",
        description: "Portal berita kepulauan dan daratan Sumenep.",
        contactEmail: "redaksi@sumenep.test",
        defaultOgMediaId: ogMedia.id,
        socialLinks: {
          facebook: "https://facebook.com/sumenep",
          instagram: "https://instagram.com/sumenep",
        },
      },
      actor,
    );
    assert.equal(siteSave.ok, true);

    // Reject draft as hero
    const badHero = await updateHomepageSettings(
      app,
      {
        heroArticleId: draftArticle.id,
        latestCount: 6,
        featuredArticleIds: [],
        rubrics: [],
      },
      actor,
    );
    assert.equal(badHero.ok, false);

    // Reject KANAL in homepage rubric
    const badRubric = await updateHomepageSettings(
      app,
      {
        heroArticleId: null,
        latestCount: 6,
        featuredArticleIds: [],
        rubrics: [{ sectionId: kanal.id, itemCount: 3 }],
      },
      actor,
    );
    assert.equal(badRubric.ok, false);

    // Save valid homepage curation
    const goodHomepage = await updateHomepageSettings(
      app,
      {
        heroArticleId: pubArticle.id,
        latestCount: 8,
        featuredArticleIds: [pubArticle.id],
        rubrics: [{ sectionId: rubrik.id, itemCount: 4 }],
      },
      actor,
    );
    assert.equal(goodHomepage.ok, true);

    const loaded = await getCmsSettingsData(app);
    assert.equal(loaded.site.tagline, "Suara Sumenep");
    assert.equal(loaded.site.defaultOgMediaId, ogMedia.id);
    assert.equal(loaded.site.socialLinks.facebook, "https://facebook.com/sumenep");
    assert.equal(loaded.homepage.heroArticleId, pubArticle.id);
    assert.equal(loaded.homepage.latestCount, 8);
    assert.deepEqual(loaded.homepage.featuredArticleIds, [pubArticle.id]);
    assert.deepEqual(loaded.homepage.rubrics, [{ sectionId: rubrik.id, itemCount: 4 }]);

    assert.equal(await owner.activityLog.count({ where: { action: "site.settings_update" } }), 1);
    assert.equal(await owner.activityLog.count({ where: { action: "homepage.update" } }), 1);
  });
});
