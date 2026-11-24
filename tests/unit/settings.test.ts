import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  compactSocialLinksForDb,
  homepageSettingsInputSchema,
  normalizeSocialLinksObject,
  siteSettingsInputSchema,
} from "@/server/settings/service";

describe("CMS settings & homepage curation schemas (Fase 9)", () => {
  test("siteSettingsInputSchema validates email, social HTTPS URLs, and length caps", () => {
    const valid = siteSettingsInputSchema.safeParse({
      tagline: "Media Lokal Sumenep",
      description: "Informasi pembangunan dan budaya.",
      contactEmail: "redaksi@matamaduranews.com",
      defaultOgMediaId: null,
      socialLinks: {
        facebook: "https://facebook.com/matamaduranews",
        instagram: "",
      },
    });
    assert.equal(valid.success, true);

    assert.equal(
      siteSettingsInputSchema.safeParse({ contactEmail: "bukan-email" }).success,
      false,
    );
    assert.equal(
      siteSettingsInputSchema.safeParse({ socialLinks: { facebook: "http://tidak-https.example" } }).success,
      false,
    );
  });

  test("compactSocialLinksForDb & normalizeSocialLinksObject preserve strict JSON OBJECT shape", () => {
    const compact = compactSocialLinksForDb({
      facebook: "  https://facebook.com/sumenep ",
      instagram: "   ",
      youtube: "https://youtube.com/@sumenep",
    });
    assert.deepEqual(compact, {
      facebook: "https://facebook.com/sumenep",
      youtube: "https://youtube.com/@sumenep",
    });

    const normalized = normalizeSocialLinksObject(compact);
    assert.equal(normalized.facebook, "https://facebook.com/sumenep");
    assert.equal(normalized.instagram, "");
  });

  test("homepageSettingsInputSchema enforces DB CHECK bounds and deduplicates lists", () => {
    const a1 = "11111111-1111-4111-8111-111111111111";
    const r1 = "22222222-2222-4222-8222-222222222222";

    const parsed = homepageSettingsInputSchema.parse({
      heroArticleId: a1,
      latestCount: 8,
      featuredArticleIds: [a1, a1],
      rubrics: [
        { sectionId: r1, itemCount: 4 },
        { sectionId: r1, itemCount: 6 },
      ],
    });
    assert.deepEqual(parsed.featuredArticleIds, [a1]);
    assert.equal(parsed.rubrics.length, 1);

    assert.equal(
      homepageSettingsInputSchema.safeParse({
        heroArticleId: null,
        latestCount: 25,
        featuredArticleIds: [],
        rubrics: [],
      }).success,
      false,
    );
    assert.equal(
      homepageSettingsInputSchema.safeParse({
        heroArticleId: null,
        latestCount: 0,
        featuredArticleIds: [],
        rubrics: [],
      }).success,
      false,
    );
  });
});
