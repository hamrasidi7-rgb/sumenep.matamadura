import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  authorInitial,
  buildArticleJsonLd,
  DEFAULT_AUTHOR,
  resolvePublicAuthor,
  serializeJsonLd,
} from "@/lib/author";
import type { Article, Author, MediaAsset, Section } from "@/content/types";

describe("Author Box identity resolution & metadata helpers", () => {
  test("resolvePublicAuthor returns consistent Redaksi SUMENEP fallback when author is missing", () => {
    assert.deepEqual(resolvePublicAuthor(null), DEFAULT_AUTHOR);
    assert.deepEqual(resolvePublicAuthor(undefined), DEFAULT_AUTHOR);
    assert.deepEqual(resolvePublicAuthor({ name: "   ", slug: "" }), DEFAULT_AUTHOR);
  });

  test("resolvePublicAuthor preserves explicit author profile and keeps empty bio omitted", () => {
    const media: MediaAsset = { src: "/media/ahmad.webp", width: 320, height: 320, alt: "Ahmad Fauzi" };
    const full = resolvePublicAuthor({
      slug: "ahmad-fauzi",
      name: "  Ahmad Fauzi  ",
      role: "  Wartawan Kepulauan  ",
      bio: "  Meliput isu pesisir dan garam.  ",
      avatar: media,
    });
    assert.deepEqual(full, {
      slug: "ahmad-fauzi",
      name: "Ahmad Fauzi",
      role: "Wartawan Kepulauan",
      bio: "Meliput isu pesisir dan garam.",
      avatar: media,
    });

    const withoutBio = resolvePublicAuthor({
      slug: "nisa-madura",
      name: "Nisa Kartika",
      role: "",
      bio: "   ",
    });
    assert.deepEqual(withoutBio, {
      slug: "nisa-madura",
      name: "Nisa Kartika",
      role: "Penulis",
    });
    assert.equal("bio" in withoutBio, false);
  });

  test("authorInitial produces reliable monogram characters", () => {
    assert.equal(authorInitial("Redaksi SUMENEP"), "S");
    assert.equal(authorInitial("Redaksi"), "R");
    assert.equal(authorInitial("Ahmad Fauzi"), "A");
    assert.equal(authorInitial(""), "R");
  });

  test("buildArticleJsonLd mirrors chosen author identity and escapes script tags", () => {
    const section: Section = { slug: "ekonomi", kind: "kanal", name: "Ekonomi", description: "" };
    const personAuthor: Author = { slug: "ahmad-fauzi", name: "Ahmad Fauzi", role: "Reporter" };
    const baseArticle: Pick<Article, "slug" | "title" | "standfirst" | "publishedAt" | "updatedAt" | "hero" | "seo"> & {
      author: Author;
      section?: Section | null;
    } = {
      slug: "pelabuhan-kalianget",
      title: "Aktivitas Pelabuhan Kalianget Pagi Ini",
      standfirst: "Ringkasan berita <script>alert(1)</script>.",
      publishedAt: "2026-11-25T08:00:00.000Z",
      updatedAt: "2026-11-25T09:00:00.000Z",
      hero: { src: "/media/hero.webp", width: 1200, height: 675, alt: "Pelabuhan" },
      author: personAuthor,
      section,
    };

    const jsonLd = buildArticleJsonLd(baseArticle, "https://sumenep.matamaduranews.com/", "SUMENEP");
    assert.equal(jsonLd.author["@type"], "Person");
    assert.equal(jsonLd.author.name, "Ahmad Fauzi");
    assert.equal(jsonLd.author.url, "https://sumenep.matamaduranews.com/penulis/ahmad-fauzi");
    assert.equal(jsonLd.articleSection, "Ekonomi");
    assert.deepEqual(jsonLd.image, ["https://sumenep.matamaduranews.com/media/hero.webp"]);

    const orgLd = buildArticleJsonLd({ ...baseArticle, author: DEFAULT_AUTHOR }, "https://sumenep.matamaduranews.com", "SUMENEP");
    assert.equal(orgLd.author["@type"], "Organization");
    assert.equal(orgLd.author.name, "Redaksi SUMENEP");

    const serialized = serializeJsonLd(jsonLd);
    assert.equal(serialized.includes("<script>"), false);
    assert.equal(serialized.includes("\\u003cscript>"), true);
  });
});
