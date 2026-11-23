import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseCoordinates } from "@/components/admin/editor/coordinates";
import { tableFromPipeRows } from "@/components/admin/editor/pipe-table";
import type { MediaAsset } from "@/content/types";
import { docMediaIds, docPlainText, type DocNode } from "@/lib/article-doc";
import { slugCandidate, slugify } from "@/lib/article-slug";
import { runSeoChecks } from "@/lib/seo-engine";
import { docToBlocks } from "@/server/articles/blocks";
import { articleFieldsSchema } from "@/server/articles/fields";
import { DocumentTooLargeError, sanitizeDoc } from "@/server/articles/sanitize";
import { articleState, stateWhere } from "@/server/articles/status";

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const text = (t: string, marks?: DocNode["marks"]): DocNode => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });

describe("sanitizeDoc (server-side, ported from Busacare tiptap-sanitasi)", () => {
  test("unknown nodes and marks are dropped with everything inside them", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [
        { type: "script", content: [text("alert(1)")] },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "html", attrs: { html: "<img onerror=alert(1)>" } },
        p(text("aman", [{ type: "textStyle", attrs: { color: "red" } }, { type: "bold" }])),
        text("teks lepas di akar"),
      ],
    });
    assert.deepEqual(out, doc(p(text("aman", [{ type: "bold" }]))));
  });

  test("only safe links survive; external ones open in a new tab", () => {
    const link = (href: string) => sanitizeDoc(doc(p(text("x", [{ type: "link", attrs: { href } }])))).content?.[0]?.content?.[0]?.marks ?? [];
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.example/x", "file:///etc/passwd"]) {
      assert.deepEqual(link(bad), [], bad);
    }
    assert.deepEqual(link("https://contoh.id/a"), [{ type: "link", attrs: { href: "https://contoh.id/a", target: "_blank", rel: "noopener noreferrer" } }]);
    assert.deepEqual(link("/artikel/garam"), [{ type: "link", attrs: { href: "/artikel/garam" } }]);
    assert.equal(link("mailto:redaksi@contoh.id")[0]?.attrs?.href, "mailto:redaksi@contoh.id");
  });

  test("headings: H2–H4 only (the title is the page's only H1)", () => {
    const level = (l: number) => sanitizeDoc(doc({ type: "heading", attrs: { level: l }, content: [text("Sub")] })).content?.[0]?.attrs?.level;
    assert.equal(level(1), 2);
    assert.equal(level(3), 3);
    assert.equal(level(4), 4);
    assert.equal(level(6), 2);
  });

  test("tables: spans removed, cells keep paragraphs only, caption/source kept", () => {
    const out = sanitizeDoc(
      doc({
        type: "table",
        attrs: { caption: "Produksi garam", source: "BPS", onclick: "x" },
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 2 }, content: [p(text("Tahun")), { type: "image" }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [] }] },
        ],
      }),
    );
    assert.deepEqual(out.content?.[0], {
      type: "table",
      attrs: { caption: "Produksi garam", source: "BPS" },
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [p(text("Tahun"))] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] },
      ],
    });
  });

  test("media blocks need a real media id; attributes are whitelisted", () => {
    const out = sanitizeDoc(
      doc(
        { type: "articleImage", attrs: { mediaId: M1, alt: "Perahu", caption: "Senja", size: "giant", src: "https://evil.example/x.png", onerror: "x" } },
        { type: "articleImage", attrs: { mediaId: "../../etc/passwd" } },
        { type: "articleGallery", attrs: { title: "Galeri", items: [{ mediaId: M1, alt: "a" }, { mediaId: "bukan-uuid" }, { mediaId: M2, caption: "c", evil: 1 }] } },
        { type: "infographic", attrs: { mediaId: M2, title: "" } },
      ),
    );
    assert.deepEqual(out.content, [
      { type: "articleImage", attrs: { mediaId: M1, alt: "Perahu", caption: "Senja", size: "column" } },
      { type: "articleGallery", attrs: { title: "Galeri", items: [{ mediaId: M1, alt: "a", caption: "" }, { mediaId: M2, alt: "", caption: "c" }] } },
    ]);
  });

  test("embeds: only YouTube/Vimeo ids and valid map coordinates — never raw HTML or iframes", () => {
    const out = sanitizeDoc(
      doc(
        { type: "articleVideo", attrs: { provider: "youtube", videoId: "dQw4w9WgXcQ", title: "Video", html: "<iframe>" } },
        { type: "articleVideo", attrs: { provider: "youtube", videoId: "<script>" } },
        { type: "articleVideo", attrs: { url: "https://vimeo.com/123456789" } },
        { type: "articleVideo", attrs: { url: "https://evil.example/video" } },
        { type: "articleMap", attrs: { latitude: -7.0123, longitude: 113.865, zoom: 40 } },
        { type: "articleMap", attrs: { latitude: 120, longitude: 0 } },
        { type: "pullQuote", attrs: { text: "  " } },
        { type: "pullQuote", attrs: { text: "Laut adalah rumah", attribution: "Nelayan" } },
      ),
    );
    assert.deepEqual(out.content, [
      { type: "articleVideo", attrs: { provider: "youtube", videoId: "dQw4w9WgXcQ", title: "Video", caption: "" } },
      { type: "articleVideo", attrs: { provider: "vimeo", videoId: "123456789", title: "Video", caption: "" } },
      { type: "articleMap", attrs: { title: "", latitude: -7.0123, longitude: 113.865, zoom: 18, marker: true, caption: "" } },
      { type: "pullQuote", attrs: { text: "Laut adalah rumah", attribution: "Nelayan" } },
    ]);
  });

  test("oversized or deeply nested documents are refused", () => {
    const huge = doc(...Array.from({ length: 9000 }, () => p(text("x"))));
    assert.throws(() => sanitizeDoc(huge), DocumentTooLargeError);
    let deep: DocNode = { type: "bulletList", content: [{ type: "listItem", content: [p(text("x"))] }] };
    for (let i = 0; i < 40; i++) deep = { type: "bulletList", content: [{ type: "listItem", content: [p(text("x")), deep] }] };
    assert.throws(() => sanitizeDoc(doc(deep)), DocumentTooLargeError);
    assert.deepEqual(sanitizeDoc(null), { type: "doc", content: [] });
    assert.deepEqual(sanitizeDoc("<p>html</p>"), { type: "doc", content: [] });
  });
});

describe("docToBlocks: editor document → SUMENEP block model", () => {
  const asset = (id: string, override?: { alt?: string; caption?: string }): MediaAsset | null =>
    id === M1 || id === M2 ? { src: `/media/${id}.webp`, width: 1200, height: 800, alt: override?.alt || "alt bawaan", ...(override?.caption ? { caption: override.caption } : {}) } : null;

  test("every block type maps to what the templates render", () => {
    const blocks = docToBlocks(
      sanitizeDoc(
        doc(
          { type: "heading", attrs: { level: 2 }, content: [text("Laut Sumenep")] },
          p(text("Tebal", [{ type: "bold" }]), text(" dan "), text("tautan", [{ type: "link", attrs: { href: "https://contoh.id" } }]), { type: "hardBreak" }, text("baris dua")),
          { type: "blockquote", content: [p(text("Satu")), p(text("Dua"))] },
          { type: "bulletList", content: [{ type: "listItem", content: [p(text("A")), { type: "orderedList", content: [{ type: "listItem", content: [p(text("A1"))] }] }] }] },
          { type: "horizontalRule" },
          { type: "articleImage", attrs: { mediaId: M1, alt: "Perahu", caption: "Senja", size: "wide" } },
          { type: "articleImage", attrs: { mediaId: "33333333-3333-4333-8333-333333333333", alt: "hilang" } },
          { type: "articleGallery", attrs: { title: "", items: [{ mediaId: M1 }, { mediaId: M2, alt: "Dua" }] } },
          { type: "infographic", attrs: { mediaId: M2, title: "Garam", source: "BPS", dataDate: "2026", note: "" } },
          { type: "table", attrs: { caption: "Tabel", source: "" }, content: [
            { type: "tableRow", content: [{ type: "tableHeader", content: [p(text("Tahun"))] }, { type: "tableHeader", content: [p(text("Ton"))] }] },
            { type: "tableRow", content: [{ type: "tableCell", content: [p(text("2026"))] }] },
          ] },
          { type: "articleVideo", attrs: { provider: "youtube", videoId: "dQw4w9WgXcQ", title: "Video" } },
          { type: "articleMap", attrs: { latitude: -7, longitude: 113.9, zoom: 12, title: "Kalianget" } },
          { type: "pullQuote", attrs: { text: "Kutipan", attribution: "" } },
        ),
      ),
      asset,
    );
    assert.deepEqual(blocks, [
      { type: "heading", level: 2, content: [{ text: "Laut Sumenep" }], id: "laut-sumenep" },
      { type: "paragraph", content: [{ text: "Tebal", bold: true }, { text: " dan " }, { text: "tautan", href: "https://contoh.id/", newTab: true }, { lineBreak: true }, { text: "baris dua" }] },
      { type: "quote", content: [{ text: "Satu" }, { lineBreak: true }, { text: "Dua" }] },
      { type: "list", ordered: false, items: [{ content: [{ text: "A" }], children: [{ content: [{ text: "A1" }] }] }] },
      { type: "divider" },
      { type: "image", image: { src: `/media/${M1}.webp`, width: 1200, height: 800, alt: "Perahu", caption: "Senja" }, size: "wide" },
      { type: "gallery", images: [{ src: `/media/${M1}.webp`, width: 1200, height: 800, alt: "alt bawaan" }, { src: `/media/${M2}.webp`, width: 1200, height: 800, alt: "Dua" }] },
      { type: "infographic", title: "Garam", image: { src: `/media/${M2}.webp`, width: 1200, height: 800, alt: "alt bawaan" }, source: "BPS", dataDate: "2026" },
      { type: "table", header: ["Tahun", "Ton"], rows: [["2026", ""]], caption: "Tabel" },
      { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ", title: "Video" },
      { type: "map", latitude: -7, longitude: 113.9, zoom: 12, marker: true, title: "Kalianget" },
      { type: "pullQuote", text: "Kutipan" },
    ]);
  });

  test("media ids, plain text and reading facts", () => {
    const d = sanitizeDoc(doc(p(text("satu dua tiga")), { type: "articleImage", attrs: { mediaId: M1 } }, { type: "articleGallery", attrs: { items: [{ mediaId: M2 }, { mediaId: M1 }] } }));
    assert.deepEqual(docMediaIds(d), { body: [M1], gallery: [M2, M1] });
    assert.equal(docPlainText(d), "satu dua tiga");
  });
});

describe("slugs (ported from Busacare slug-artikel)", () => {
  test("Indonesian titles become readable slugs", () => {
    assert.equal(slugify("Kopi & Garam: Café di Sumenep!"), "kopi-dan-garam-cafe-di-sumenep");
    assert.equal(slugify("  --Ráng  Senja--  "), "rang-senja");
    assert.equal(slugify("x".repeat(300)).length, 120);
    assert.equal(slugCandidate("judul", 1), "judul");
    assert.equal(slugCandidate("judul", 3), "judul-3");
    assert.equal(slugCandidate("a".repeat(120), 12).length, 120);
  });
});

describe("article state", () => {
  const now = new Date("2026-11-21T03:00:00Z");
  test("draf / terjadwal / terbit / arsip / sampah", () => {
    assert.equal(articleState({ status: "DRAFT", publishedAt: null, deletedAt: null }, now), "draf");
    assert.equal(articleState({ status: "PUBLISHED", publishedAt: new Date("2026-11-22T00:00:00Z"), deletedAt: null }, now), "terjadwal");
    assert.equal(articleState({ status: "PUBLISHED", publishedAt: new Date("2026-11-20T00:00:00Z"), deletedAt: null }, now), "terbit");
    assert.equal(articleState({ status: "ARCHIVED", publishedAt: new Date("2026-11-20T00:00:00Z"), deletedAt: null }, now), "arsip");
    assert.equal(articleState({ status: "PUBLISHED", publishedAt: new Date("2026-11-20T00:00:00Z"), deletedAt: now }, now), "sampah");
    assert.deepEqual(stateWhere("terbit", now), { deletedAt: null, status: "PUBLISHED", publishedAt: { lte: now } });
  });
});

describe("article fields (zod)", () => {
  const base = { title: " Judul ", authorId: M1, body: doc(p(text("isi"))) };
  test("normalises optional values and tags", () => {
    const parsed = articleFieldsSchema.parse({ ...base, kanalId: "", tags: [" laut ", "Laut", "", "garam"], seoTitle: "  ", canonicalUrl: "" });
    assert.equal(parsed.title, "Judul");
    assert.equal(parsed.kanalId, null);
    assert.deepEqual(parsed.tags, ["laut", "garam"]);
    assert.equal(parsed.seoTitle, null);
    assert.equal(parsed.canonicalUrl, null);
  });
  test("rejects bad input", () => {
    assert.equal(articleFieldsSchema.safeParse({ ...base, title: "" }).success, false);
    assert.equal(articleFieldsSchema.safeParse({ ...base, authorId: "redaksi" }).success, false);
    assert.equal(articleFieldsSchema.safeParse({ ...base, canonicalUrl: "http://contoh.id" }).success, false);
    assert.equal(articleFieldsSchema.safeParse({ ...base, template: "MAGAZINE" }).success, false);
  });
});

describe("SEO checks (ported from Busacare seo-engine)", () => {
  const input = { title: "Garam Kalianget", standfirst: "Petani garam menunggu musim.", slug: "garam-kalianget", seoTitle: "", seoDescription: "", canonicalUrl: "", body: doc(p(text("isi"))), hero: null };
  const ids = (overrides: object) => Object.fromEntries(runSeoChecks({ ...input, ...overrides }).map((f) => [f.id, f.status]));
  test("hero, alt, description, slug, canonical, anchors", () => {
    assert.equal(ids({})["images.hero"], "MISSING");
    assert.equal(ids({ hero: { alt: "Garam Kalianget", caption: "" } })["images.hero-alt"], "WARNING");
    assert.equal(ids({ hero: { alt: "Tumpukan garam putih", caption: "" } })["images.hero-alt"], "PASS");
    assert.equal(ids({})["metadata.description"], "MISSING");
    assert.equal(ids({ seoDescription: "x".repeat(140) })["metadata.description"], "PASS");
    assert.equal(ids({ slug: "Bukan Slug" })["metadata.slug"], "WARNING");
    assert.equal(ids({ canonicalUrl: "http://contoh.id" })["metadata.canonical"], "WARNING");
    const anchors = ids({ body: doc(p(text("klik di sini", [{ type: "link", attrs: { href: "https://contoh.id" } }]))) });
    assert.equal(anchors["links.anchor-0"], "WARNING");
  });
});

describe("editor helpers", () => {
  test("pasted pipe tables (Busacare behaviour)", () => {
    const table = tableFromPipeRows(["| Tahun | Ton |", "| --- | --- |", "| 2026 | 12 |"]);
    assert.equal(table?.content?.length, 2);
    assert.equal(table?.content?.[0]?.content?.[0]?.type, "tableHeader");
    assert.equal(tableFromPipeRows(["| satu |"]), null);
  });
  test("map coordinates from text or map links", () => {
    assert.deepEqual(parseCoordinates("-7.0123, 113.8650"), { latitude: -7.0123, longitude: 113.865 });
    assert.deepEqual(parseCoordinates("https://www.google.com/maps/@-7.05,113.9,14z"), { latitude: -7.05, longitude: 113.9, zoom: 14 });
    assert.deepEqual(parseCoordinates("https://www.openstreetmap.org/#map=12/-7.0/113.8"), { latitude: -7, longitude: 113.8, zoom: 12 });
    assert.equal(parseCoordinates("Kalianget"), null);
    assert.equal(parseCoordinates("95, 10"), null);
  });
});
