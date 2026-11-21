// Server-side sanitising of the TipTap document — the PRIMARY defence against
// XSS and malformed content in article.body. Called by every Server Action
// that stores a body; the client is never trusted to send a "safe" document.
//
// Adapted from Busacare lib/tiptap-sanitasi.ts (same principle: unknown nodes
// and marks are DROPPED, never passed through; attributes are rebuilt from a
// whitelist) and extended for SUMENEP's blocks: H4, divider, pull quote,
// gallery, infographic, video and map embeds, table caption/source, and media
// referenced by id instead of a file path. Tables lose colspan/rowspan: the
// public table model is a plain grid.
//
// The public renderer never uses dangerouslySetInnerHTML either (it maps known
// block types to components), so this is the first of two layers.

import { parseVideoUrl, safeHref } from "@/lib/article-utils";

import { NODE, type DocMark, type DocNode } from "@/lib/article-doc";

const MAX_TEXT = 20_000;
const MAX_SHORT = 500;
const MAX_NODES = 8_000;
const MAX_DEPTH = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABLE_PARTS = new Set(["tableRow", "tableHeader", "tableCell"]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);

export class DocumentTooLargeError extends Error {
  constructor() {
    super("Isi artikel terlalu besar atau terlalu bertingkat.");
    this.name = "DocumentTooLargeError";
  }
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const mediaId = (value: unknown): string | null => (typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null);

/** http(s), mailto, tel, site-relative "/…" or "#…". Anything else (javascript:, data:, //host) is dropped. */
export function sanitizeHref(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2_000) return null;
  return safeHref(raw) ?? null;
}

function sanitizeMarks(marks: DocMark[] | undefined): DocMark[] {
  const out: DocMark[] = [];
  for (const mark of marks ?? []) {
    if (!mark || !MARKS.has(mark.type) || out.some((m) => m.type === mark.type)) continue;
    if (mark.type !== "link") {
      out.push({ type: mark.type });
      continue;
    }
    const href = sanitizeHref(mark.attrs?.href);
    if (!href) continue;
    const external = /^(https?:|mailto:|tel:)/i.test(href);
    out.push({ type: "link", attrs: external ? { href, target: "_blank", rel: "noopener noreferrer" } : { href } });
  }
  return out;
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function sanitizeDoc(input: unknown): DocNode {
  let count = 0;

  const visit = (raw: unknown, depth: number): DocNode | null => {
    if (++count > MAX_NODES || depth > MAX_DEPTH) throw new DocumentTooLargeError();
    if (!raw || typeof raw !== "object") return null;
    const node = raw as DocNode;
    const children = (allowed?: (n: DocNode) => boolean) =>
      (Array.isArray(node.content) ? node.content : [])
        .filter((child) => !allowed || (child && allowed(child)))
        .map((child) => visit(child, depth + 1))
        .filter((child): child is DocNode => child !== null);

    switch (node.type) {
      case "text": {
        const value = text(node.text, MAX_TEXT);
        if (!value) return null;
        const marks = sanitizeMarks(node.marks);
        return { type: "text", text: value, ...(marks.length ? { marks } : {}) };
      }
      case "hardBreak":
        return { type: "hardBreak" };
      case "horizontalRule":
        return { type: "horizontalRule" };
      case "paragraph": {
        const content = children((c) => c.type === "text" || c.type === "hardBreak");
        return { type: "paragraph", ...(content.length ? { content } : {}) };
      }
      case "heading": {
        // H2–H4 only: the article title is the page's only H1.
        const level = node.attrs?.level === 3 ? 3 : node.attrs?.level === 4 ? 4 : 2;
        const content = children((c) => c.type === "text" || c.type === "hardBreak");
        return content.length ? { type: "heading", attrs: { level }, content } : null;
      }
      case "bulletList":
      case "orderedList": {
        const content = children((c) => c.type === "listItem");
        return content.length ? { type: node.type, content } : null;
      }
      case "listItem": {
        const content = children((c) => ["paragraph", "bulletList", "orderedList"].includes(c.type));
        return content.length ? { type: "listItem", content } : null;
      }
      case "blockquote": {
        const content = children((c) => c.type === "paragraph");
        return content.length ? { type: "blockquote", content } : null;
      }
      case "table": {
        const rows = children((c) => c.type === "tableRow");
        if (!rows.length) return null;
        const attrs = { caption: text(node.attrs?.caption, MAX_SHORT), source: text(node.attrs?.source, MAX_SHORT) };
        return { type: "table", attrs, content: rows };
      }
      case "tableRow": {
        const cells = children((c) => c.type === "tableHeader" || c.type === "tableCell");
        return cells.length ? { type: "tableRow", content: cells } : null;
      }
      case "tableHeader":
      case "tableCell": {
        const content = children((c) => c.type === "paragraph");
        // An empty cell keeps one empty paragraph, so rows never lose columns.
        return { type: node.type, content: content.length ? content : [{ type: "paragraph" }] };
      }
      case NODE.image: {
        const id = mediaId(node.attrs?.mediaId);
        if (!id) return null;
        return {
          type: NODE.image,
          attrs: {
            mediaId: id,
            alt: text(node.attrs?.alt, MAX_SHORT),
            caption: text(node.attrs?.caption, MAX_SHORT),
            size: node.attrs?.size === "wide" ? "wide" : "column",
          },
        };
      }
      case NODE.gallery: {
        const items = (Array.isArray(node.attrs?.items) ? node.attrs.items : [])
          .slice(0, 40)
          .map((item: unknown) => {
            const record = (item ?? {}) as Record<string, unknown>;
            const id = mediaId(record.mediaId);
            return id ? { mediaId: id, alt: text(record.alt, MAX_SHORT), caption: text(record.caption, MAX_SHORT) } : null;
          })
          .filter(Boolean);
        return items.length ? { type: NODE.gallery, attrs: { title: text(node.attrs?.title, 200), items } } : null;
      }
      case NODE.infographic: {
        const id = mediaId(node.attrs?.mediaId);
        const title = text(node.attrs?.title, 200).trim();
        if (!id || !title) return null;
        return {
          type: NODE.infographic,
          attrs: {
            mediaId: id,
            title,
            source: text(node.attrs?.source, MAX_SHORT),
            dataDate: text(node.attrs?.dataDate, 100),
            note: text(node.attrs?.note, MAX_SHORT),
          },
        };
      }
      case NODE.pullQuote: {
        const quote = text(node.attrs?.text, 600).trim();
        return quote ? { type: NODE.pullQuote, attrs: { text: quote, attribution: text(node.attrs?.attribution, 200) } } : null;
      }
      case NODE.video: {
        // Only YouTube / Vimeo, identified by a validated id — never a URL or HTML.
        const provider = node.attrs?.provider === "vimeo" ? "vimeo" : "youtube";
        const id = text(node.attrs?.videoId, 32);
        const valid = provider === "youtube" ? /^[\w-]{11}$/.test(id) : /^\d{6,12}$/.test(id);
        const parsed = valid ? { provider, videoId: id } : parseVideoUrl(text(node.attrs?.url, 2_000));
        if (!parsed) return null;
        return {
          type: NODE.video,
          attrs: { ...parsed, title: text(node.attrs?.title, 200).trim() || "Video", caption: text(node.attrs?.caption, MAX_SHORT) },
        };
      }
      case NODE.map: {
        const latitude = clampNumber(node.attrs?.latitude, -90, 90);
        const longitude = clampNumber(node.attrs?.longitude, -180, 180);
        if (latitude === null || longitude === null) return null;
        return {
          type: NODE.map,
          attrs: {
            title: text(node.attrs?.title, 200),
            latitude,
            longitude,
            zoom: typeof node.attrs?.zoom === "number" && Number.isFinite(node.attrs.zoom) ? Math.round(Math.min(18, Math.max(3, node.attrs.zoom))) : 13,
            marker: node.attrs?.marker !== false,
            caption: text(node.attrs?.caption, MAX_SHORT),
          },
        };
      }
      case "doc": {
        const content = children((c) => !TABLE_PARTS.has(c.type) && c.type !== "listItem" && c.type !== "text" && c.type !== "hardBreak");
        return { type: "doc", content };
      }
      default:
        return null; // unknown node: dropped with everything inside it
    }
  };

  return visit({ ...(input as object), type: "doc" }, 0) ?? { type: "doc", content: [] };
}
