import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { MediaAsset } from "@/content/types";
import { docMediaIds, docPlainText, NODE, type DocNode } from "@/lib/article-doc";
import { EDITORIAL_HIGHLIGHTS, EDITORIAL_TEXT_COLORS } from "@/lib/editorial-tokens";
import { analyzeBody } from "@/lib/seo-engine";
import { docToBlocks } from "@/server/articles/blocks";
import { sanitizeDoc } from "@/server/articles/sanitize";

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const M3 = "33333333-3333-4333-8333-333333333333";

const txt = (value: string, marks?: DocNode["marks"]): DocNode => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (content: DocNode[], dropCap = false): DocNode => ({
  type: "paragraph",
  ...(dropCap ? { attrs: { dropCap: true } } : {}),
  content,
});

describe("Editorial Block Editor schema, sanitizer, and block mapping", () => {
  const lookup = (id: string, override?: { alt?: string; caption?: string; credit?: string }): MediaAsset | null => {
    if (![M1, M2, M3].includes(id)) return null;
    return {
      src: `/media/${id}.webp`,
      width: 1200,
      height: 800,
      alt: override?.alt || "alt bawaan",
      ...(override?.caption ? { caption: override.caption } : {}),
      ...(override?.credit ? { credit: override.credit } : {}),
    };
  };

  test("strictly whitelists editorial colors, highlights, font sizes, and drops unapproved values", () => {
    const brandHex = EDITORIAL_TEXT_COLORS[0].hex; // #A61B2B
    const creamHex = EDITORIAL_HIGHLIGHTS[1].hex; // #F5EFE6
    const clean = sanitizeDoc({
      type: "doc",
      content: [
        para(
          [
            txt("penting", [
              { type: "textStyle", attrs: { color: "#a61b2b", fontSize: "lg" } },
              { type: "highlight", attrs: { color: "cream" } },
              { type: "bold" },
            ]),
            txt(" "),
            txt("ditolak", [
              { type: "textStyle", attrs: { color: "#ff00ff", fontSize: "72px" } },
              { type: "highlight", attrs: { color: "lime" } },
            ]),
          ],
          true,
        ),
      ],
    });

    assert.deepEqual(clean.content?.[0], {
      type: "paragraph",
      attrs: { dropCap: true },
      content: [
        {
          type: "text",
          text: "penting",
          marks: [
            { type: "textStyle", attrs: { color: brandHex, fontSize: "lg" } },
            { type: "highlight", attrs: { color: creamHex } },
            { type: "bold" },
          ],
        },
        { type: "text", text: " " },
        { type: "text", text: "ditolak" },
      ],
    });

    const blocks = docToBlocks(clean, lookup);
    assert.deepEqual(blocks, [
      {
        type: "paragraph",
        dropCap: true,
        content: [
          { text: "penting", color: brandHex, fontSize: "lg", highlight: creamHex, bold: true },
          { text: " " },
          { text: "ditolak" },
        ],
      },
    ]);
  });

  test("supports all 8 image layout variations, ratio, pair media tracking, and per-block credits", () => {
    const raw: DocNode = {
      type: "doc",
      content: [
        {
          type: NODE.image,
          attrs: { mediaId: M1, alt: "Nelayan", caption: "Senja Kalianget", credit: "Foto: Ahmad", size: "full", align: "left", ratio: "16/9" },
        },
        {
          type: NODE.image,
          attrs: { mediaId: M2, alt: "Pasar", caption: "Pasar pagi", credit: "Foto: Sari", size: "column", align: "right", ratio: "3/2" },
        },
        {
          type: NODE.image,
          attrs: {
            mediaId: M1,
            alt: "Perahu kiri",
            caption: "Sisi kiri",
            credit: "Foto: A",
            layout: "pair",
            ratio: "4/3",
            pairMediaId: M3,
            pairAlt: "Perahu kanan",
            pairCaption: "Sisi kanan",
            pairCredit: "Foto: B",
          },
        },
      ],
    };

    const clean = sanitizeDoc(raw);
    assert.deepEqual(docMediaIds(clean), { body: [M1, M2, M3], gallery: [] });

    const blocks = docToBlocks(clean, lookup);
    assert.deepEqual(blocks, [
      {
        type: "image",
        size: "full", // full-width ignores side align cleanly
        ratio: "16/9",
        image: { src: `/media/${M1}.webp`, width: 1200, height: 800, alt: "Nelayan", caption: "Senja Kalianget", credit: "Foto: Ahmad" },
      },
      {
        type: "image",
        size: "column",
        align: "right",
        ratio: "3/2",
        image: { src: `/media/${M2}.webp`, width: 1200, height: 800, alt: "Pasar", caption: "Pasar pagi", credit: "Foto: Sari" },
      },
      {
        type: "imagePair",
        ratio: "4/3",
        images: [
          { src: `/media/${M1}.webp`, width: 1200, height: 800, alt: "Perahu kiri", caption: "Sisi kiri", credit: "Foto: A" },
          { src: `/media/${M3}.webp`, width: 1200, height: 800, alt: "Perahu kanan", caption: "Sisi kanan", credit: "Foto: B" },
        ],
      },
    ]);
  });

  test("sanitizes and converts pullQuote variants, largeStatement, factBox, callout, divider, and updates SEO/word counts", () => {
    const raw: DocNode = {
      type: "doc",
      content: [
        { type: NODE.pullQuote, attrs: { text: "Laut adalah masa depan warga pulau.", attribution: "Tokoh Pesisir", variant: "framed" } },
        { type: NODE.largeStatement, attrs: { headline: "68%", description: "Wilayah kepulauan bergantung pada jalur laut.", source: "BPS 2026", tone: "cream" } },
        { type: NODE.factBox, attrs: { title: "Fakta Utama", items: ["27 kecamatan", "126 pulau", ""], source: "Pemkab", tone: "blush" } },
        { type: NODE.callout, attrs: { label: "Catatan", title: "Metodologi", body: "Wawancara dilakukan tiga bulan.", tone: "dark" } },
        { type: "horizontalRule", attrs: { variant: "dots" } },
      ],
    };

    const clean = sanitizeDoc(raw);
    const blocks = docToBlocks(clean, lookup);
    assert.deepEqual(blocks, [
      { type: "pullQuote", text: "Laut adalah masa depan warga pulau.", attribution: "Tokoh Pesisir", variant: "framed" },
      { type: "largeStatement", headline: "68%", description: "Wilayah kepulauan bergantung pada jalur laut.", source: "BPS 2026", tone: "cream" },
      { type: "factBox", title: "Fakta Utama", items: ["27 kecamatan", "126 pulau"], source: "Pemkab", tone: "blush" },
      { type: "callout", label: "Catatan", title: "Metodologi", body: "Wawancara dilakukan tiga bulan.", tone: "dark" },
      { type: "divider", variant: "dots" },
    ]);

    const plain = docPlainText(clean);
    assert.match(plain, /Laut adalah masa depan/);
    assert.match(plain, /68%/);
    assert.match(plain, /Fakta Utama/);
    assert.match(plain, /Wawancara dilakukan tiga bulan/);

    const seoAnalysis = analyzeBody(clean);
    assert.ok(seoAnalysis.wordCount >= 18);
  });
});
