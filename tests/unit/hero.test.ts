import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ArticleTemplate, Section } from "@/content/types";
import type { ArticleView } from "@/lib/content";
import {
  buildHeroAdminHref,
  describeIneligibleReason,
  isArticleEligibleForHero,
  parseHeroFilters,
} from "@/server/homepage/hero";
import {
  parseHeroHistoryMeta,
  resolveHomepageSlots,
  templateEditorialLabel,
  type HomepageRubricConfig,
  type HomepageSlotArticle,
} from "@/server/homepage/slots";

const KANAL_BERITA: Section = {
  slug: "politik-pemerintahan",
  kind: "kanal",
  name: "Politik & Pemerintahan",
  description: "Berita pemerintahan.",
};
const KANAL_EKONOMI: Section = {
  slug: "ekonomi",
  kind: "kanal",
  name: "Ekonomi",
  description: "Ekonomi daerah.",
};
const RUBRIK_CATATAN: Section & { id: string } = {
  id: "rubrik-catatan-id",
  slug: "catatan-sumenep",
  kind: "rubrik",
  name: "Catatan Sumenep",
  description: "Gagasan tentang Sumenep.",
};
const RUBRIK_OPINI: Section & { id: string } = {
  id: "rubrik-opini-id",
  slug: "opini",
  kind: "rubrik",
  name: "Opini",
  description: "Opini warga dan cendekia.",
};
const RUBRIK_SUARA: Section & { id: string } = {
  id: "rubrik-suara-id",
  slug: "suara-kepulauan",
  kind: "rubrik",
  name: "Suara Kepulauan",
  description: "Kabar kepulauan.",
};

function makeSlotArticle(opts: {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  kanal?: Section;
  rubrik?: Section & { id: string };
  template?: ArticleTemplate;
}): HomepageSlotArticle {
  const template = opts.template ?? "standard";
  const view: ArticleView = {
    slug: opts.slug,
    title: opts.title,
    standfirst: `Ringkasan ${opts.title}`,
    ...(opts.kanal ? { kanal: opts.kanal.slug } : {}),
    ...(opts.rubrik ? { rubrik: opts.rubrik.slug } : {}),
    author: { slug: "redaksi", name: "Redaksi SUMENEP", role: "Tim Redaksi" },
    section: opts.rubrik ?? opts.kanal,
    publishedAt: opts.publishedAt,
    readingMinutes: 4,
    template,
    hero: { src: "/demo/senja-perahu.webp", width: 1200, height: 750, alt: opts.title },
    body: [],
    tags: [],
  };
  return {
    id: opts.id,
    slug: opts.slug,
    kanalSlug: opts.kanal?.slug ?? null,
    rubrikId: opts.rubrik?.id ?? null,
    rubrikSlug: opts.rubrik?.slug ?? null,
    template,
    view,
  };
}

describe("homepage slot resolution & Hero Utama placement rules", () => {
  const berita1 = makeSlotArticle({
    id: "berita-1",
    slug: "berita-satu",
    title: "Berita Satu",
    publishedAt: "2026-11-25T08:00:00.000Z",
    kanal: KANAL_BERITA,
    template: "standard",
  });
  const berita2 = makeSlotArticle({
    id: "berita-2",
    slug: "berita-dua",
    title: "Berita Dua",
    publishedAt: "2026-11-25T07:00:00.000Z",
    kanal: KANAL_EKONOMI,
    template: "standard",
  });
  const catatan1 = makeSlotArticle({
    id: "catatan-1",
    slug: "catatan-satu",
    title: "Catatan Sumenep Satu",
    publishedAt: "2026-11-25T07:30:00.000Z",
    kanal: KANAL_BERITA,
    rubrik: RUBRIK_CATATAN,
    template: "spotlight",
  });
  const opini1 = makeSlotArticle({
    id: "opini-1",
    slug: "opini-satu",
    title: "Opini Satu",
    publishedAt: "2026-11-25T07:20:00.000Z",
    rubrik: RUBRIK_OPINI,
    template: "standard",
  });
  const suara1 = makeSlotArticle({
    id: "suara-1",
    slug: "suara-kepulauan-satu",
    title: "Suara Kepulauan Satu",
    publishedAt: "2026-11-25T07:10:00.000Z",
    rubrik: RUBRIK_SUARA,
    template: "feature",
  });
  const feature1 = makeSlotArticle({
    id: "feature-1",
    slug: "feature-ekonomi-pulau",
    title: "Feature Ekonomi Pulau",
    publishedAt: "2026-11-25T07:15:00.000Z",
    kanal: KANAL_EKONOMI,
    template: "feature",
  });

  const allEligible = [berita1, catatan1, opini1, feature1, suara1, berita2];
  const rubricConfigs: HomepageRubricConfig[] = [
    { section: RUBRIK_CATATAN, itemCount: 3 },
    { section: RUBRIK_OPINI, itemCount: 3 },
  ];

  test("returns null when there are no eligible articles (allows seed fallback)", () => {
    const resolved = resolveHomepageSlots({
      configuredHeroId: null,
      featuredIds: [],
      rubricConfigs,
      latestCount: 4,
      eligibleArticles: [],
    });
    assert.equal(resolved, null);
  });

  test("Catatan Sumenep as Hero is deduplicated, and returns to Catatan Sumenep band (NOT Artikel Terbaru) when replaced", () => {
    const withCatatanHero = resolveHomepageSlots({
      configuredHeroId: catatan1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;

    assert.equal(withCatatanHero.heroMode, "manual");
    assert.equal(withCatatanHero.hero.slug, catatan1.slug);
    assert.deepEqual(withCatatanHero.catatanArticles.map((a) => a.slug), []);
    assert.deepEqual(withCatatanHero.latest.map((a) => a.slug), [berita1.slug, berita2.slug]);

    // Replace Hero with Berita 1 → Catatan Sumenep returns to Catatan Sumenep band, NEVER forced into Artikel Terbaru
    const afterSwitch = resolveHomepageSlots({
      configuredHeroId: berita1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;

    assert.equal(afterSwitch.hero.slug, berita1.slug);
    assert.deepEqual(afterSwitch.catatanArticles.map((a) => a.slug), [catatan1.slug]);
    assert.equal(afterSwitch.latest.some((a) => a.slug === catatan1.slug), false);
    assert.deepEqual(afterSwitch.latest.map((a) => a.slug), [berita2.slug]);
  });

  test("Opini & unconfigured rubric articles return to their own rubric group and are NEVER forced into Artikel Terbaru", () => {
    const withOpiniHero = resolveHomepageSlots({
      configuredHeroId: opini1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;

    assert.equal(withOpiniHero.hero.slug, opini1.slug);
    assert.equal(withOpiniHero.rubricBands.some((b) => b.section.slug === "opini"), false);
    // Unconfigured rubric Suara Kepulauan is also NOT forced into Artikel Terbaru
    assert.equal(withOpiniHero.latest.some((a) => a.slug === suara1.slug), false);

    // Replace Hero with Berita 1 → Opini returns to Opini band, not Artikel Terbaru
    const afterSwitch = resolveHomepageSlots({
      configuredHeroId: berita1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;

    const opiniBand = afterSwitch.rubricBands.find((b) => b.section.slug === "opini");
    assert.ok(opiniBand, "Opini rubric band should reappear after Opini leaves Hero");
    assert.deepEqual(opiniBand.articles.map((a) => a.slug), [opini1.slug]);
    assert.equal(afterSwitch.latest.some((a) => a.slug === opini1.slug), false);
    assert.equal(afterSwitch.latest.some((a) => a.slug === suara1.slug), false);
  });

  test("Feature returns to Tulisan Pilihan (curated or auto editorial group) and is NOT forced into Artikel Terbaru", () => {
    const withFeatureHero = resolveHomepageSlots({
      configuredHeroId: feature1.id,
      featuredIds: [feature1.id, berita2.id],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;

    assert.equal(withFeatureHero.hero.slug, feature1.slug);
    assert.deepEqual(withFeatureHero.featured.map((a) => a.slug), [berita2.slug]);
    assert.deepEqual(withFeatureHero.latest.map((a) => a.slug), [berita1.slug]);

    // Replace Hero with Berita 1 → Feature returns to position 0 of Tulisan Pilihan
    const afterSwitch = resolveHomepageSlots({
      configuredHeroId: berita1.id,
      featuredIds: [feature1.id, berita2.id],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;

    assert.deepEqual(afterSwitch.featured.map((a) => a.slug), [feature1.slug, berita2.slug]);
    assert.equal(afterSwitch.latest.some((a) => a.slug === feature1.slug), false);
    // Even without manual homepage_featured curation, non-rubric Feature goes to Tulisan Pilihan, not Artikel Terbaru
    const withoutCurated = resolveHomepageSlots({
      configuredHeroId: berita1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 6,
      eligibleArticles: allEligible,
    })!;
    assert.deepEqual(withoutCurated.featured.map((a) => a.slug), [feature1.slug]);
    assert.equal(withoutCurated.latest.some((a) => a.slug === feature1.slug), false);
  });

  test("Berita returns to Artikel Terbaru (alur berita) in chronological order when replaced as Hero", () => {
    const withBerita1Hero = resolveHomepageSlots({
      configuredHeroId: berita1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 4,
      eligibleArticles: allEligible,
    })!;
    assert.equal(withBerita1Hero.hero.slug, berita1.slug);
    assert.deepEqual(withBerita1Hero.latest.map((a) => a.slug), [berita2.slug]);

    const afterSwitch = resolveHomepageSlots({
      configuredHeroId: catatan1.id,
      featuredIds: [],
      rubricConfigs,
      latestCount: 4,
      eligibleArticles: allEligible,
    })!;
    assert.equal(afterSwitch.hero.slug, catatan1.slug);
    assert.deepEqual(afterSwitch.latest.map((a) => a.slug), [berita1.slug, berita2.slug]);
  });

  test("falls back automatically to newest eligible article if configuredHeroId is missing or ineligible", () => {
    const resolved = resolveHomepageSlots({
      configuredHeroId: "deleted-or-hidden-id",
      featuredIds: [],
      rubricConfigs,
      latestCount: 4,
      eligibleArticles: allEligible,
    })!;

    assert.equal(resolved.heroMode, "auto");
    assert.equal(resolved.heroArticleId, berita1.id);
    assert.equal(resolved.hero.slug, berita1.slug);
  });
});

describe("Hero Utama eligibility, filters, and history metadata helpers", () => {
  const now = new Date("2026-11-25T10:00:00.000Z");

  test("enforces published, publishedAt <= now, not trashed, and hideFromHomepage = false", () => {
    assert.equal(
      isArticleEligibleForHero(
        { status: "PUBLISHED", publishedAt: new Date("2026-11-25T09:00:00.000Z"), deletedAt: null, hideFromHomepage: false },
        now,
      ),
      true,
    );
    assert.equal(
      isArticleEligibleForHero(
        { status: "PUBLISHED", publishedAt: new Date("2026-11-25T09:00:00.000Z"), deletedAt: null, hideFromHomepage: true },
        now,
      ),
      false,
    );
    assert.match(
      describeIneligibleReason(
        { status: "PUBLISHED", publishedAt: new Date("2026-11-25T09:00:00.000Z"), deletedAt: null, hideFromHomepage: true },
        now,
      ) ?? "",
      /Sembunyikan dari beranda/,
    );
    assert.match(
      describeIneligibleReason(
        { status: "PUBLISHED", publishedAt: new Date("2026-11-26T09:00:00.000Z"), deletedAt: null, hideFromHomepage: false },
        now,
      ) ?? "",
      /Terjadwal/,
    );
    assert.match(
      describeIneligibleReason({ status: "DRAFT", publishedAt: null, deletedAt: null, hideFromHomepage: false }, now) ?? "",
      /Draf/,
    );
    assert.match(
      describeIneligibleReason({ status: "ARCHIVED", publishedAt: now, deletedAt: null, hideFromHomepage: false }, now) ?? "",
      /Arsip/,
    );
    assert.match(
      describeIneligibleReason({ status: "PUBLISHED", publishedAt: now, deletedAt: now, hideFromHomepage: false }, now) ?? "",
      /tempat sampah/,
    );
  });

  test("parses URL filters and history metadata safely", () => {
    const filters = parseHeroFilters({ q: "  garam ", kanal: "ekonomi", rubrik: "opini", template: "feature", halaman: "2" });
    assert.deepEqual(filters, { q: "garam", kanal: "ekonomi", rubrik: "opini", template: "FEATURE", page: 2 });
    assert.equal(buildHeroAdminHref(filters), "/admin/hero?q=garam&kanal=ekonomi&rubrik=opini&template=FEATURE&halaman=2");
    assert.equal(buildHeroAdminHref({ q: "", kanal: "", rubrik: "", template: "semua", page: 1 }), "/admin/hero");

    const parsed = parseHeroHistoryMeta({
      source: "admin-settings",
      heroArticleId: "abc",
      heroTitle: "Judul A",
      heroSlug: "judul-a",
      heroSection: "Opini",
      heroTemplate: "FEATURE",
      previousHeroTitle: "Judul Lama",
    });
    assert.equal(parsed.source, "admin-settings");
    assert.equal(parsed.heroTitle, "Judul A");
    assert.equal(parsed.previousHeroTitle, "Judul Lama");
    assert.equal(templateEditorialLabel("FEATURE"), "Feature");
    assert.equal(templateEditorialLabel("STANDARD"), "Berita");
  });
});
