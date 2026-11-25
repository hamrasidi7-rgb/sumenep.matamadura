import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildRobotsConfig,
  buildSitemapEntries,
  isHttpsPublicSiteUrl,
  isProductionIndexing,
} from "@/lib/seo-routing";

describe("SEO routing & indexing guard (robots + sitemap)", () => {
  test("isHttpsPublicSiteUrl accepts only valid public HTTPS hosts", () => {
    assert.equal(isHttpsPublicSiteUrl("https://sumenep.matamaduranews.com"), true);
    assert.equal(isHttpsPublicSiteUrl("https://sumenep.matamaduranews.com/"), true);

    assert.equal(isHttpsPublicSiteUrl("http://sumenep.matamaduranews.com"), false);
    assert.equal(isHttpsPublicSiteUrl("http://localhost:3200"), false);
    assert.equal(isHttpsPublicSiteUrl("https://localhost:3200"), false);
    assert.equal(isHttpsPublicSiteUrl("https://127.0.0.1"), false);
    assert.equal(isHttpsPublicSiteUrl("https://[::1]"), false);
    assert.equal(isHttpsPublicSiteUrl("https://sumenep.local"), false);
    assert.equal(isHttpsPublicSiteUrl("https://preview.hostingersite.com"), false);
    assert.equal(isHttpsPublicSiteUrl("not-a-url"), false);
    assert.equal(isHttpsPublicSiteUrl(""), false);
  });

  test("isProductionIndexing fails closed unless NEXT_PUBLIC_SITE_ENV=production AND HTTPS public domain", () => {
    assert.equal(isProductionIndexing(undefined, "https://sumenep.matamaduranews.com"), false);
    assert.equal(isProductionIndexing("", "https://sumenep.matamaduranews.com"), false);
    assert.equal(isProductionIndexing("staging", "https://sumenep.matamaduranews.com"), false);
    assert.equal(isProductionIndexing("preview", "https://sumenep.matamaduranews.com"), false);
    assert.equal(isProductionIndexing("production", "http://localhost:3301"), false);
    assert.equal(isProductionIndexing("production", "https://abc.hostingersite.com"), false);
    assert.equal(isProductionIndexing("production", "https://sumenep.matamaduranews.com"), true);
    assert.equal(isProductionIndexing(" production ", "https://sumenep.matamaduranews.com"), true);
  });

  test("buildRobotsConfig blocks everything on staging and allows public routes only on production", () => {
    const staging = buildRobotsConfig(false, "https://sumenep.matamaduranews.com");
    assert.equal("sitemap" in staging, false);
    assert.deepEqual(staging, { rules: { userAgent: "*", disallow: "/" } });

    const production = buildRobotsConfig(true, "https://sumenep.matamaduranews.com/");
    assert.deepEqual(production, {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/pratinjau/", "/cari"],
      },
      sitemap: "https://sumenep.matamaduranews.com/sitemap.xml",
      host: "https://sumenep.matamaduranews.com",
    });
  });

  test("buildSitemapEntries deduplicates slugs, excludes private routes, and propagates latest article timestamp", () => {
    const older = new Date("2026-11-20T08:00:00Z");
    const newer = new Date("2026-11-25T05:30:00Z");
    const entries = buildSitemapEntries({
      baseUrl: "https://sumenep.matamaduranews.com/",
      kanalSlugs: ["peristiwa", "peristiwa", "pesisir"],
      rubrikSlugs: ["wacana"],
      authorSlugs: ["redaksi-sumenep"],
      articles: [
        { slug: "artikel-pertama", lastModified: older },
        { slug: "artikel-pertama", lastModified: newer },
        { slug: "   " },
        { slug: "artikel-kedua", lastModified: older },
      ],
    });

    const urls = entries.map((e) => e.url);
    assert.equal(new Set(urls).size, urls.length, "sitemap URLs must be unique");

    for (const expected of [
      "https://sumenep.matamaduranews.com/",
      "https://sumenep.matamaduranews.com/terbaru",
      "https://sumenep.matamaduranews.com/pilihan",
      "https://sumenep.matamaduranews.com/tentang-kami",
      "https://sumenep.matamaduranews.com/kontak-redaksi",
      "https://sumenep.matamaduranews.com/pedoman-media-siber",
      "https://sumenep.matamaduranews.com/kebijakan-privasi",
      "https://sumenep.matamaduranews.com/kanal/peristiwa",
      "https://sumenep.matamaduranews.com/kanal/pesisir",
      "https://sumenep.matamaduranews.com/rubrik/wacana",
      "https://sumenep.matamaduranews.com/penulis/redaksi-sumenep",
      "https://sumenep.matamaduranews.com/artikel/artikel-pertama",
      "https://sumenep.matamaduranews.com/artikel/artikel-kedua",
    ]) {
      assert.ok(urls.includes(expected), `missing ${expected}`);
    }

    for (const forbidden of ["/admin", "/api", "/pratinjau", "/cari"]) {
      assert.ok(!urls.some((u) => u.includes(forbidden)), `private route leaked into sitemap: ${forbidden}`);
    }

    const home = entries.find((e) => e.url === "https://sumenep.matamaduranews.com/");
    const latest = entries.find((e) => e.url === "https://sumenep.matamaduranews.com/terbaru");
    const firstArticle = entries.find((e) => e.url === "https://sumenep.matamaduranews.com/artikel/artikel-pertama");
    assert.deepEqual(home?.lastModified, newer);
    assert.deepEqual(latest?.lastModified, newer);
    assert.deepEqual(firstArticle?.lastModified, newer);
  });
});
