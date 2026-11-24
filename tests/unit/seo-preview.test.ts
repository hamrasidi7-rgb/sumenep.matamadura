import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildSeoPreview, estimateReadingMinutes, SITE_PUBLIC_ORIGIN } from "@/lib/seo-preview";
import type { MediaDto } from "@/server/media/service";

const heroSample: MediaDto = {
  id: "hero-1",
  src: "/media/2026/11/hero.webp",
  width: 1200,
  height: 675,
  alt: "Nelayan Sumenep",
  caption: "",
  credit: "",
  folderId: null,
};

const ogSample: MediaDto = {
  id: "og-1",
  src: "/media/2026/11/og.webp",
  width: 1200,
  height: 630,
  alt: "Kartu Share",
  caption: "",
  credit: "",
  folderId: null,
};

describe("SEO preview & reading time helpers (Fase 6)", () => {
  test("estimateReadingMinutes rounds up conservatively", () => {
    assert.equal(estimateReadingMinutes(0), 0);
    assert.equal(estimateReadingMinutes(40), 1);
    assert.equal(estimateReadingMinutes(200), 1);
    assert.equal(estimateReadingMinutes(201), 2);
    assert.equal(estimateReadingMinutes(620), 4);
  });

  test("buildSeoPreview prioritizes explicit SEO fields & OG image without auto-mutating slug", () => {
    const preview = buildSeoPreview({
      title: "Judul Baru Setelah Revisi",
      slug: "judul-lama-terbit",
      standfirst: "Ringkasan awal berita.",
      seoTitle: "Judul SEO Khusus",
      seoDescription: "Deskripsi meta khusus untuk pencarian.",
      canonicalUrl: "",
      heroMedia: heroSample,
      ogMedia: ogSample,
    });

    assert.equal(preview.displayTitle, "Judul SEO Khusus");
    assert.equal(preview.displayDescription, "Deskripsi meta khusus untuk pencarian.");
    assert.equal(preview.articlePath, "/artikel/judul-lama-terbit");
    assert.equal(preview.canonicalDisplay, `${SITE_PUBLIC_ORIGIN}/artikel/judul-lama-terbit`);
    assert.equal(preview.ogImage?.id, "og-1");
    assert.equal(preview.suggestedSlug, "judul-baru-setelah-revisi");
    assert.equal(preview.slugDivergesFromTitle, true);
  });

  test("buildSeoPreview falls back cleanly to title, standfirst, hero media, and custom canonical", () => {
    const preview = buildSeoPreview({
      title: "Panen Garam Kalianget",
      slug: "panen-garam-kalianget",
      standfirst: "Harga garam stabil tahun ini.",
      seoTitle: "",
      seoDescription: "",
      canonicalUrl: "https://mitra.example.com/panen",
      heroMedia: heroSample,
      ogMedia: null,
    });

    assert.equal(preview.displayTitle, "Panen Garam Kalianget");
    assert.equal(preview.displayDescription, "Harga garam stabil tahun ini.");
    assert.equal(preview.canonicalDisplay, "https://mitra.example.com/panen");
    assert.equal(preview.ogImage?.id, "hero-1");
    assert.equal(preview.slugDivergesFromTitle, false);
  });
});
