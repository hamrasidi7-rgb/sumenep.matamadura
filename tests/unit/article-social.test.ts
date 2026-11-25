import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildArticleMetadata, truncateSocialDescription } from "@/lib/article-social";
import type { ArticleView } from "@/lib/content";

const SITE_FIXTURE = {
  url: "https://sumenep.matamaduranews.com",
  name: "SUMENEP – Mata Madura",
  locale: "id_ID",
  description: "Catatan, berita, dan perspektif tentang Sumenep.",
};

function makeArticle(overrides: Partial<ArticleView> = {}): ArticleView {
  return {
    slug: "setelah-bupati-fauzi-apa-giliran-pkb",
    title: "Setelah Bupati Fauzi, Apa Giliran PKB? Menakar Cabup PKB Sumenep",
    standfirst:
      "Hasil Analisis politik lokal berbasis Kecerdasan  Buatan—membaca peta kekuatan PKB Sumenep menuju pemilihan kepala daerah berikutnya secara jernih dan mendalam bagi pembaca daerah.",
    kanal: "politik-pemerintahan",
    rubrik: "catatan-sumenep",
    section: {
      slug: "catatan-sumenep",
      kind: "rubrik",
      name: "Catatan Sumenep",
      description: "Gagasan tentang Sumenep.",
    },
    author: { slug: "gus-dolla", name: "Gus Dolla", role: "Kolumnis" },
    publishedAt: "2026-11-25T04:26:00.000Z",
    updatedAt: "2026-11-25T04:30:00.000Z",
    readingMinutes: 4,
    template: "feature",
    hero: {
      src: "/media/2026/11/b394016efc207243.webp",
      width: 1200,
      height: 750,
      alt: "Menakar Cabup PKB Sumenep",
    },
    body: [],
    tags: ["politik", "sumenep"],
    ...overrides,
  };
}

describe("article social sharing metadata (Open Graph & Twitter Card)", () => {
  test("truncateSocialDescription collapses whitespace and caps cleanly at 160 chars on word boundary", () => {
    const short = truncateSocialDescription("Ringkasan   singkat\nberita Sumenep.");
    assert.equal(short, "Ringkasan singkat berita Sumenep.");

    const longText =
      "Hasil Analisis politik lokal berbasis Kecerdasan  Buatan—membaca peta kekuatan PKB Sumenep menuju pemilihan kepala daerah berikutnya secara jernih dan mendalam bagi pembaca daerah.";
    const trimmed = truncateSocialDescription(longText, 160);
    assert.ok(trimmed.length <= 160, `expected <= 160 chars, got ${trimmed.length}`);
    assert.ok(trimmed.endsWith("…"));
    assert.equal(trimmed.includes("  "), false);
  });

  test("buildArticleMetadata sets absolute hero image, <=160 char lead description, complete OpenGraph & Twitter Card", () => {
    const meta = buildArticleMetadata(makeArticle(), SITE_FIXTURE);

    assert.equal(meta.title, "Setelah Bupati Fauzi, Apa Giliran PKB? Menakar Cabup PKB Sumenep");
    assert.ok(typeof meta.description === "string" && meta.description.length <= 160);
    assert.equal(meta.alternates?.canonical, "/artikel/setelah-bupati-fauzi-apa-giliran-pkb");

    const og = meta.openGraph as Record<string, unknown>;
    assert.equal(og.type, "article");
    assert.equal(og.url, "https://sumenep.matamaduranews.com/artikel/setelah-bupati-fauzi-apa-giliran-pkb");
    assert.equal(og.siteName, "SUMENEP – Mata Madura");
    assert.equal(og.locale, "id_ID");
    assert.equal(og.title, "Setelah Bupati Fauzi, Apa Giliran PKB? Menakar Cabup PKB Sumenep");
    assert.equal(og.description, meta.description);
    assert.equal(og.section, "Catatan Sumenep");

    const ogImages = og.images as Array<Record<string, unknown>>;
    assert.equal(ogImages.length, 1);
    assert.equal(ogImages[0].url, "https://sumenep.matamaduranews.com/media/2026/11/b394016efc207243.webp");
    assert.equal(ogImages[0].secureUrl, "https://sumenep.matamaduranews.com/media/2026/11/b394016efc207243.webp");
    assert.equal(ogImages[0].width, 1200);
    assert.equal(ogImages[0].height, 750);
    assert.equal(ogImages[0].type, "image/webp");
    assert.equal(ogImages[0].alt, "Menakar Cabup PKB Sumenep");

    const tw = meta.twitter as Record<string, unknown>;
    assert.equal(tw.card, "summary_large_image");
    assert.equal(tw.title, "Setelah Bupati Fauzi, Apa Giliran PKB? Menakar Cabup PKB Sumenep");
    assert.equal(tw.description, meta.description);
    const twImages = tw.images as Array<Record<string, unknown>>;
    assert.equal(twImages[0].url, "https://sumenep.matamaduranews.com/media/2026/11/b394016efc207243.webp");
  });

  test("social cards always prioritize article title, lead summary (<=160), and hero photo even when CMS SEO fields differ", () => {
    const meta = buildArticleMetadata(
      makeArticle({
        standfirst:
          "Hasil Analisis politik lokal berbasis Kecerdasan\u00A0 Buatan—membaca peta kekuatan PKB Sumenep menuju pemilihan kepala daerah berikutnya",
        seo: {
          title: "PKB Sumenep,",
          description: "Paragraf pembuka lain yang bukan lead artikel.",
          ogImage: { src: "/media/2026/11/other-og.webp", width: 1200, height: 630, alt: "Lainnya" },
        },
      }),
      SITE_FIXTURE,
    );

    const og = meta.openGraph as Record<string, unknown>;
    assert.equal(og.title, "Setelah Bupati Fauzi, Apa Giliran PKB? Menakar Cabup PKB Sumenep");
    assert.equal(
      og.description,
      "Hasil Analisis politik lokal berbasis Kecerdasan Buatan—membaca peta kekuatan PKB Sumenep menuju pemilihan kepala daerah berikutnya",
    );
    assert.ok((og.description as string).length <= 160);
    const ogImages = og.images as Array<Record<string, unknown>>;
    assert.equal(ogImages[0].url, "https://sumenep.matamaduranews.com/media/2026/11/b394016efc207243.webp");

    const tw = meta.twitter as Record<string, unknown>;
    assert.equal(tw.title, "Setelah Bupati Fauzi, Apa Giliran PKB? Menakar Cabup PKB Sumenep");
    assert.equal(tw.description, og.description);
    const twImages = tw.images as Array<Record<string, unknown>>;
    assert.equal(twImages[0].url, "https://sumenep.matamaduranews.com/media/2026/11/b394016efc207243.webp");
  });

  test("falls back cleanly to /og-default.png when hero is an SVG illustration", () => {
    const meta = buildArticleMetadata(
      makeArticle({
        hero: { src: "/demo/ilustrasi.svg", width: 600, height: 400, alt: "Ilustrasi" },
      }),
      SITE_FIXTURE,
    );
    const ogImages = (meta.openGraph as { images: Array<{ url: string; type?: string }> }).images;
    assert.equal(ogImages[0].url, "https://sumenep.matamaduranews.com/og-default.png");
    assert.equal(ogImages[0].type, "image/png");
  });
});
