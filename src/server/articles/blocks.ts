import type { ArticleBlock, Inline, ListItem, MediaAsset } from "@/content/types";
import { withHeadingIds } from "@/lib/article-utils";
import {
  normalizeCalloutTone,
  normalizeDividerVariant,
  normalizeFactBoxTone,
  normalizeFontSize,
  normalizeHighlightColor,
  normalizeImageAlign,
  normalizeImageRatio,
  normalizeImageSize,
  normalizeLargeStatementTone,
  normalizePullQuoteVariant,
  normalizeTextColor,
} from "@/lib/editorial-tokens";

import { NODE, type DocNode } from "@/lib/article-doc";

// TipTap document (already sanitised) → SUMENEP block model (src/content/types).
// The public templates only ever see ArticleBlock[], so the editor format can
// change without touching a single frontend component.
//
// Media are resolved through `media` (id → MediaAsset). A block whose media no
// longer exists is left out rather than rendered broken.

export type MediaLookup = (id: string, override?: { alt?: string; caption?: string; credit?: string }) => MediaAsset | null;

const str = (value: unknown) => (typeof value === "string" ? value : "");

function inlines(nodes: DocNode[] | undefined): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      out.push({ lineBreak: true });
      continue;
    }
    if (node.type !== "text" || !node.text) continue;
    const run: Exclude<Inline, { lineBreak: true }> = { text: node.text };
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") run.bold = true;
      else if (mark.type === "italic") run.italic = true;
      else if (mark.type === "underline") run.underline = true;
      else if (mark.type === "strike") run.strike = true;
      else if (mark.type === "code") run.code = true;
      else if (mark.type === "textStyle") {
        const color = normalizeTextColor(mark.attrs?.color);
        const fontSize = normalizeFontSize(mark.attrs?.fontSize);
        if (color) run.color = color;
        if (fontSize) run.fontSize = fontSize;
      } else if (mark.type === "highlight") {
        const highlight = normalizeHighlightColor(mark.attrs?.color);
        if (highlight) run.highlight = highlight;
      } else if (mark.type === "link" && typeof mark.attrs?.href === "string") {
        run.href = mark.attrs.href;
        if (mark.attrs.target === "_blank") run.newTab = true;
      }
    }
    out.push(run);
  }
  return out;
}

function listItems(list: DocNode): ListItem[] {
  return (list.content ?? []).map((item) => {
    const paragraphs = (item.content ?? []).filter((c) => c.type === "paragraph");
    const nested = (item.content ?? []).filter((c) => c.type === "bulletList" || c.type === "orderedList");
    const content = paragraphs.flatMap((p, i) => (i === 0 ? inlines(p.content) : [{ lineBreak: true } as Inline, ...inlines(p.content)]));
    const children = nested.flatMap(listItems);
    return children.length ? { content, children } : { content };
  });
}

function cellText(cell: DocNode): string {
  return (cell.content ?? [])
    .map((p) => (p.content ?? []).map((n) => (n.type === "text" ? (n.text ?? "") : " ")).join(""))
    .join(" ")
    .trim();
}

function table(node: DocNode): ArticleBlock | null {
  const rows = (node.content ?? []).map((row) => row.content ?? []);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")];
  const headerRow = rows[0].every((c) => c.type === "tableHeader") ? rows[0] : null;
  const header = pad(headerRow ? headerRow.map(cellText) : Array.from({ length: width }, () => ""));
  const body = (headerRow ? rows.slice(1) : rows).map((r) => pad(r.map(cellText)));
  return {
    type: "table",
    header,
    rows: body,
    ...(str(node.attrs?.caption) ? { caption: str(node.attrs?.caption) } : {}),
    ...(str(node.attrs?.source) ? { source: str(node.attrs?.source) } : {}),
  };
}

function block(node: DocNode, media: MediaLookup): ArticleBlock | null {
  switch (node.type) {
    case "paragraph": {
      const content = inlines(node.content);
      if (!content.length) return null;
      return { type: "paragraph", content, ...(node.attrs?.dropCap === true ? { dropCap: true } : {}) };
    }
    case "heading": {
      const level = node.attrs?.level === 3 ? 3 : node.attrs?.level === 4 ? 4 : 2;
      const content = inlines(node.content);
      return content.length ? { type: "heading", level, content, id: "" } : null;
    }
    case "blockquote": {
      const paragraphs = (node.content ?? []).filter((c) => c.type === "paragraph");
      const content = paragraphs.flatMap((p, i) => (i === 0 ? inlines(p.content) : [{ lineBreak: true } as Inline, ...inlines(p.content)]));
      return content.length ? { type: "quote", content } : null;
    }
    case "bulletList":
    case "orderedList": {
      const items = listItems(node);
      return items.length ? { type: "list", ordered: node.type === "orderedList", items } : null;
    }
    case "horizontalRule": {
      const variant = normalizeDividerVariant(node.attrs?.variant);
      return variant !== "editorial" ? { type: "divider", variant } : { type: "divider" };
    }
    case "table":
      return table(node);
    case NODE.image: {
      const image = media(str(node.attrs?.mediaId), {
        alt: str(node.attrs?.alt),
        caption: str(node.attrs?.caption),
        credit: str(node.attrs?.credit),
      });
      if (!image) return null;
      const ratio = normalizeImageRatio(node.attrs?.ratio);
      if (node.attrs?.layout === "pair" && str(node.attrs?.pairMediaId)) {
        const second = media(str(node.attrs?.pairMediaId), {
          alt: str(node.attrs?.pairAlt),
          caption: str(node.attrs?.pairCaption),
          credit: str(node.attrs?.pairCredit),
        });
        if (second) {
          return {
            type: "imagePair",
            images: [image, second],
            ...(ratio !== "auto" ? { ratio } : {}),
          };
        }
      }
      const size = normalizeImageSize(node.attrs?.size);
      const align = normalizeImageAlign(node.attrs?.align);
      return {
        type: "image",
        image,
        size,
        ...(size === "column" && align !== "center" ? { align } : {}),
        ...(ratio !== "auto" ? { ratio } : {}),
      };
    }
    case NODE.gallery: {
      const items = Array.isArray(node.attrs?.items) ? (node.attrs.items as Array<Record<string, unknown>>) : [];
      const images = items
        .map((item) => media(str(item.mediaId), { alt: str(item.alt), caption: str(item.caption), credit: str(item.credit) }))
        .filter((m): m is MediaAsset => m !== null);
      return images.length ? { type: "gallery", images, ...(str(node.attrs?.title) ? { title: str(node.attrs?.title) } : {}) } : null;
    }
    case NODE.infographic: {
      const image = media(str(node.attrs?.mediaId));
      if (!image) return null;
      return {
        type: "infographic",
        title: str(node.attrs?.title),
        image,
        ...(str(node.attrs?.source) ? { source: str(node.attrs?.source) } : {}),
        ...(str(node.attrs?.dataDate) ? { dataDate: str(node.attrs?.dataDate) } : {}),
        ...(str(node.attrs?.note) ? { note: str(node.attrs?.note) } : {}),
      };
    }
    case NODE.pullQuote: {
      const variant = normalizePullQuoteVariant(node.attrs?.variant);
      return {
        type: "pullQuote",
        text: str(node.attrs?.text),
        ...(str(node.attrs?.attribution) ? { attribution: str(node.attrs?.attribution) } : {}),
        ...(variant !== "editorial" ? { variant } : {}),
      };
    }
    case NODE.largeStatement: {
      const headline = str(node.attrs?.headline).trim();
      if (!headline) return null;
      const tone = normalizeLargeStatementTone(node.attrs?.tone);
      return {
        type: "largeStatement",
        headline,
        ...(str(node.attrs?.description).trim() ? { description: str(node.attrs?.description).trim() } : {}),
        ...(str(node.attrs?.source).trim() ? { source: str(node.attrs?.source).trim() } : {}),
        tone,
      };
    }
    case NODE.factBox: {
      const title = str(node.attrs?.title).trim();
      const items = Array.isArray(node.attrs?.items)
        ? node.attrs.items.map((x) => str(x).trim()).filter(Boolean)
        : [];
      if (!title && items.length === 0) return null;
      return {
        type: "factBox",
        title: title || "Kotak Fakta",
        items,
        ...(str(node.attrs?.source).trim() ? { source: str(node.attrs?.source).trim() } : {}),
        tone: normalizeFactBoxTone(node.attrs?.tone),
      };
    }
    case NODE.callout: {
      const body = str(node.attrs?.body).trim();
      const title = str(node.attrs?.title).trim();
      if (!body && !title) return null;
      return {
        type: "callout",
        ...(str(node.attrs?.label).trim() ? { label: str(node.attrs?.label).trim() } : {}),
        ...(title ? { title } : {}),
        body,
        tone: normalizeCalloutTone(node.attrs?.tone),
      };
    }
    case NODE.video:
      return {
        type: "video",
        provider: node.attrs?.provider === "vimeo" ? "vimeo" : "youtube",
        videoId: str(node.attrs?.videoId),
        title: str(node.attrs?.title) || "Video",
        ...(str(node.attrs?.caption) ? { caption: str(node.attrs?.caption) } : {}),
      };
    case NODE.map:
      return {
        type: "map",
        latitude: Number(node.attrs?.latitude),
        longitude: Number(node.attrs?.longitude),
        zoom: Number(node.attrs?.zoom) || 13,
        marker: node.attrs?.marker !== false,
        ...(str(node.attrs?.title) ? { title: str(node.attrs?.title) } : {}),
        ...(str(node.attrs?.caption) ? { caption: str(node.attrs?.caption) } : {}),
      };
    default:
      return null;
  }
}

export function docToBlocks(doc: DocNode | null | undefined, media: MediaLookup): ArticleBlock[] {
  const blocks = (doc?.content ?? []).map((node) => block(node, media)).filter((b): b is ArticleBlock => b !== null);
  return withHeadingIds(blocks);
}
