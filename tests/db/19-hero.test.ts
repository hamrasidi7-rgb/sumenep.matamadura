import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  clearHomepageHero,
  getHeroManagerData,
  HERO_CLEAR_ACTION,
  HERO_SET_ACTION,
  parseHeroFilters,
  setHomepageHero,
} from "@/server/homepage/hero";
import {
  publicHomepageData,
  publicSelectedHeroArticleBySlug,
  publicSelectedHeroAuthor,
  publicSelectedHeroCard,
} from "@/server/homepage/queries";
import { updateHomepageSettings } from "@/server/settings/service";

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

describe("Hero Utama backend service, history, & editorial homepage placement (DB)", () => {
  test("enforces single active Hero, blocks ineligible/hideFromHomepage articles, preserves article fields, records history, and returns old Hero to its original editorial group", async () => {
    const now = new Date("2026-11-25T10:00:00.000Z");
    const media = await makeMedia(owner, "hero-test-img");
    const author = await makeAuthor(owner, "redaksi-hero");
    const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi editorial." }] }] };

    const kanalPolitik = await owner.section.create({
      data: { kind: "KANAL", slug: "politik-pemerintahan", name: "Politik & Pemerintahan" },
    });
    const kanalEkonomi = await owner.section.create({
      data: { kind: "KANAL", slug: "ekonomi", name: "Ekonomi" },
    });
    const rubrikCatatan = await owner.section.create({
      data: { kind: "RUBRIK", slug: "catatan-sumenep", name: "Catatan Sumenep" },
    });
    const rubrikOpini = await owner.section.create({
      data: { kind: "RUBRIK", slug: "opini", name: "Opini" },
    });

    await owner.homepageRubric.createMany({
      data: [
        { sectionId: rubrikCatatan.id, position: 0, itemCount: 3 },
        { sectionId: rubrikOpini.id, position: 1, itemCount: 3 },
      ],
    });

    const berita1 = await owner.article.create({
      data: {
        slug: "berita-utama-satu",
        title: "Berita Utama Satu",
        standfirst: "Ringkasan berita satu.",
        kanalId: kanalPolitik.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-25T09:00:00.000Z"),
        body,
      },
    });
    const berita2 = await owner.article.create({
      data: {
        slug: "berita-ekonomi-dua",
        title: "Berita Ekonomi Dua",
        standfirst: "Ringkasan berita dua.",
        kanalId: kanalEkonomi.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-25T08:00:00.000Z"),
        body,
      },
    });
    const catatan = await owner.article.create({
      data: {
        slug: "catatan-mercusuar-sumenep",
        title: "Catatan Mercusuar Sumenep",
        standfirst: "Esai Catatan Sumenep.",
        kanalId: kanalPolitik.id,
        rubrikId: rubrikCatatan.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "SPOTLIGHT",
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-25T08:45:00.000Z"),
        body,
      },
    });
    const opini = await owner.article.create({
      data: {
        slug: "opini-transportasi-pulau",
        title: "Opini Transportasi Pulau",
        standfirst: "Pandangan opini warga.",
        rubrikId: rubrikOpini.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "STANDARD",
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-25T08:30:00.000Z"),
        body,
      },
    });
    const feature = await owner.article.create({
      data: {
        slug: "feature-garam-kalianget",
        title: "Feature Garam Kalianget",
        standfirst: "Liputan mendalam garam.",
        kanalId: kanalEkonomi.id,
        authorId: author.id,
        heroMediaId: media.id,
        template: "FEATURE",
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-25T08:20:00.000Z"),
        body,
      },
    });

    // Ineligible articles
    const hiddenArticle = await owner.article.create({
      data: {
        slug: "tersembunyi-beranda",
        title: "Artikel Sembunyi Beranda",
        kanalId: kanalPolitik.id,
        authorId: author.id,
        heroMediaId: media.id,
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-25T08:10:00.000Z"),
        hideFromHomepage: true,
        body,
      },
    });
    const scheduledArticle = await owner.article.create({
      data: {
        slug: "artikel-terjadwal-besok",
        title: "Artikel Terjadwal Besok",
        kanalId: kanalPolitik.id,
        authorId: author.id,
        heroMediaId: media.id,
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-26T09:00:00.000Z"),
        body,
      },
    });
    const draftArticle = await owner.article.create({
      data: {
        slug: "draf-belum-terbit",
        title: "Draf Belum Terbit",
        kanalId: kanalPolitik.id,
        authorId: author.id,
        status: "DRAFT",
        body,
      },
    });

    const totalArticlesBefore = await owner.article.count();

    // 1. Reject ineligible candidates (hideFromHomepage, scheduled, draft)
    const rejHidden = await setHomepageHero(app, hiddenArticle.id, actor, now);
    assert.equal(rejHidden.ok, false);
    assert.match(rejHidden.error, /Sembunyikan dari beranda/);

    const rejScheduled = await setHomepageHero(app, scheduledArticle.id, actor, now);
    assert.equal(rejScheduled.ok, false);
    assert.match(rejScheduled.error, /Terjadwal/);

    const rejDraft = await setHomepageHero(app, draftArticle.id, actor, now);
    assert.equal(rejDraft.ok, false);
    assert.match(rejDraft.error, /Draf/);

    // Also verify /admin/pengaturan updateHomepageSettings rejects hideFromHomepage
    const rejSettingsHidden = await updateHomepageSettings(
      app,
      { heroArticleId: hiddenArticle.id, latestCount: 4, featuredArticleIds: [], rubrics: [] },
      actor,
      now,
    );
    assert.equal(rejSettingsHidden.ok, false);

    // 2. Candidate query excludes hideFromHomepage, scheduled, draft, and filters accurately
    const allList = await getHeroManagerData(app, parseHeroFilters({}), now);
    const candidateSlugs = allList.candidates.items.map((c) => c.slug);
    assert.equal(candidateSlugs.includes(hiddenArticle.slug), false);
    assert.equal(candidateSlugs.includes(scheduledArticle.slug), false);
    assert.equal(candidateSlugs.includes(draftArticle.slug), false);
    assert.equal(candidateSlugs.length, 5);

    const opiniOnly = await getHeroManagerData(app, parseHeroFilters({ rubrik: "opini" }), now);
    assert.deepEqual(opiniOnly.candidates.items.map((c) => c.slug), [opini.slug]);

    const featureOnly = await getHeroManagerData(app, parseHeroFilters({ template: "FEATURE" }), now);
    assert.deepEqual(featureOnly.candidates.items.map((c) => c.slug), [feature.slug]);

    // 3. Set Catatan Sumenep as Hero → check homepage slots AND isolated Hero queries (CMS_PUBLIC_ARTICLES=off mode)
    assert.equal((await setHomepageHero(app, catatan.id, actor, now)).ok, true);
    const isolatedCard = await publicSelectedHeroCard(app, now);
    assert.equal(isolatedCard?.slug, catatan.slug);
    const isolatedArticle = await publicSelectedHeroArticleBySlug(app, catatan.slug, now);
    assert.equal(isolatedArticle?.slug, catatan.slug);
    assert.ok((isolatedArticle?.body.length ?? 0) > 0, "isolated Hero article detail must include body blocks");
    // Non-Hero CMS articles must stay blocked (null → 404) in isolated mode
    assert.equal(await publicSelectedHeroArticleBySlug(app, berita1.slug, now), null);
    assert.equal(await publicSelectedHeroArticleBySlug(app, hiddenArticle.slug, now), null);
    // Isolated author lookup exposes ONLY the active Hero's author
    const isolatedAuthor = await publicSelectedHeroAuthor(app, author.slug, now);
    assert.equal(isolatedAuthor?.author.slug, author.slug);
    assert.equal(isolatedAuthor?.heroArticle.slug, catatan.slug);
    assert.equal(await publicSelectedHeroAuthor(app, "penulis-lain", now), null);

    let home = (await publicHomepageData(app, now))!;
    assert.equal(home.heroMode, "manual");
    assert.equal(home.hero.slug, catatan.slug);
    assert.deepEqual(home.catatanArticles.map((a) => a.slug), []);
    assert.deepEqual(home.latest.map((a) => a.slug), [berita1.slug, berita2.slug]);
    assert.deepEqual(home.featured.map((a) => a.slug), [feature.slug]);
    assert.deepEqual(home.rubricBands.find((b) => b.section.slug === "opini")?.articles.map((a) => a.slug), [opini.slug]);

    // 4. Switch Hero to Opini → Catatan Sumenep returns to Catatan Sumenep band (NOT Artikel Terbaru!)
    assert.equal((await setHomepageHero(app, opini.id, actor, now)).ok, true);
    home = (await publicHomepageData(app, now))!;
    assert.equal(home.hero.slug, opini.slug);
    assert.deepEqual(home.catatanArticles.map((a) => a.slug), [catatan.slug]);
    assert.equal(home.rubricBands.some((b) => b.section.slug === "opini"), false);
    assert.equal(home.latest.some((a) => a.slug === catatan.slug), false);

    // 5. Switch Hero to Feature → Opini returns to Opini band (NOT Artikel Terbaru!)
    assert.equal((await setHomepageHero(app, feature.id, actor, now)).ok, true);
    home = (await publicHomepageData(app, now))!;
    assert.equal(home.hero.slug, feature.slug);
    assert.deepEqual(home.featured.map((a) => a.slug), []);
    assert.deepEqual(home.rubricBands.find((b) => b.section.slug === "opini")?.articles.map((a) => a.slug), [opini.slug]);
    assert.equal(home.latest.some((a) => a.slug === opini.slug), false);

    // 6. Switch Hero to Berita 1 (via updateHomepageSettings to test two-way sync!) → Feature returns to Tulisan Pilihan
    const syncRes = await updateHomepageSettings(
      app,
      {
        heroArticleId: berita1.id,
        latestCount: 4,
        featuredArticleIds: [],
        rubrics: [
          { sectionId: rubrikCatatan.id, itemCount: 3 },
          { sectionId: rubrikOpini.id, itemCount: 3 },
        ],
      },
      actor,
      now,
    );
    assert.equal(syncRes.ok, true);
    home = (await publicHomepageData(app, now))!;
    assert.equal(home.hero.slug, berita1.slug);
    assert.deepEqual(home.featured.map((a) => a.slug), [feature.slug]);
    assert.deepEqual(home.latest.map((a) => a.slug), [berita2.slug]);
    assert.equal(home.latest.some((a) => a.slug === feature.slug), false);

    // 7. Clear Hero back to automatic (newest eligible = berita1) and verify zero article mutation/duplication
    assert.equal((await clearHomepageHero(app, actor)).ok, true);
    // In isolated mode (CMS_PUBLIC_ARTICLES=off), automatic mode (heroArticleId = null) must return null (seed fallback)
    assert.equal(await publicSelectedHeroCard(app, now), null);
    assert.equal(await publicSelectedHeroArticleBySlug(app, berita1.slug, now), null);
    assert.equal(await owner.article.count(), totalArticlesBefore, "must never duplicate articles");
    assert.equal(await owner.homepageSettings.count(), 1, "singleton homepage_settings must stay 1 row");

    const catatanAfter = await owner.article.findUniqueOrThrow({ where: { id: catatan.id } });
    assert.equal(catatanAfter.slug, "catatan-mercusuar-sumenep");
    assert.equal(catatanAfter.status, "PUBLISHED");
    assert.equal(catatanAfter.rubrikId, rubrikCatatan.id);
    assert.equal(catatanAfter.publishedAt?.toISOString(), "2026-11-25T08:45:00.000Z");

    // 8. Verify complete Hero Utama history in activity_log
    const manager = await getHeroManagerData(app, parseHeroFilters({}), now);
    assert.equal(manager.active.mode, "auto");
    assert.equal(manager.history.length, 5);
    assert.equal(manager.history[0].action, HERO_CLEAR_ACTION);
    assert.equal(manager.history[1].action, HERO_SET_ACTION);
    assert.equal(manager.history[1].source, "admin-settings");
    assert.equal(manager.history[1].heroSlug, berita1.slug);
    assert.equal(manager.history[2].heroSlug, feature.slug);
    assert.equal(manager.history[3].heroSlug, opini.slug);
    assert.equal(manager.history[4].heroSlug, catatan.slug);
    assert.equal(manager.history[4].canRestoreAsHero, true);

    // 9. Graceful fallback if active manual Hero is later marked hideFromHomepage = true
    assert.equal((await setHomepageHero(app, berita2.id, actor, now)).ok, true);
    await owner.article.update({ where: { id: berita2.id }, data: { hideFromHomepage: true } });

    const degradedManager = await getHeroManagerData(app, parseHeroFilters({}), now);
    assert.equal(degradedManager.active.mode, "auto");
    assert.match(degradedManager.active.configuredIneligibleReason ?? "", /Sembunyikan dari beranda/);
    assert.equal(degradedManager.active.effectiveArticle?.slug, berita1.slug);

    const degradedHome = (await publicHomepageData(app, now))!;
    assert.equal(degradedHome.heroMode, "auto");
    assert.equal(degradedHome.hero.slug, berita1.slug);
  });
});
