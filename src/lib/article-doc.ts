// The article body as stored in article.body: a TipTap/ProseMirror JSON
// document. Shape follows editor.getJSON() exactly, without importing
// @tiptap/* — so the server (sanitiser, converter, SEO checks) and tests can
// use it without loading the editor.
//
// Adapted from Busacare lib/seo-engine/types.ts (RichContentNode) and
// lib/tiptap-json.ts (keDokumenPolos).

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

export const EMPTY_DOC: DocNode = { type: "doc", content: [] };

/**
 * Plain-object copy of an editor document. ProseMirror creates attrs with
 * Object.create(null), which Server Actions refuse ("Only plain objects …
 * can be passed") — so links, headings and images would silently fail to
 * save. A JSON round-trip turns them into ordinary objects. (Busacare:
 * reproduced and fixed the same way.)
 */
export function toPlainDoc<T = DocNode>(json: unknown): T {
  return JSON.parse(JSON.stringify(json)) as T;
}

/** Custom node names shared by the editor, the sanitiser and the converter. */
export const NODE = {
  image: "articleImage",
  gallery: "articleGallery",
  pullQuote: "pullQuote",
  largeStatement: "largeStatement",
  factBox: "factBox",
  callout: "callout",
  video: "articleVideo",
  map: "articleMap",
  infographic: "infographic",
} as const;

/** Every media id the document refers to (images, image pairs, gallery items, infographics). */
export function docMediaIds(doc: DocNode | null | undefined): { body: string[]; gallery: string[] } {
  const body = new Set<string>();
  const gallery = new Set<string>();
  const visit = (node: DocNode) => {
    if ((node.type === NODE.image || node.type === NODE.infographic) && typeof node.attrs?.mediaId === "string") {
      body.add(node.attrs.mediaId);
    }
    if (node.type === NODE.image && typeof node.attrs?.pairMediaId === "string") {
      body.add(node.attrs.pairMediaId);
    }
    if (node.type === NODE.gallery && Array.isArray(node.attrs?.items)) {
      for (const item of node.attrs.items as Array<{ mediaId?: unknown }>) {
        if (typeof item?.mediaId === "string") gallery.add(item.mediaId);
      }
    }
    node.content?.forEach(visit);
  };
  if (doc) visit(doc);
  return { body: [...body], gallery: [...gallery] };
}

/** Visible text of the document (search, reading time, empty-body checks). */
export function docPlainText(doc: DocNode | null | undefined): string {
  const parts: string[] = [];
  const visit = (node: DocNode) => {
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === NODE.pullQuote && typeof node.attrs?.text === "string") parts.push(node.attrs.text, " ");
    if (node.type === NODE.infographic && typeof node.attrs?.title === "string") parts.push(node.attrs.title, " ");
    if (node.type === NODE.largeStatement) {
      if (typeof node.attrs?.headline === "string") parts.push(node.attrs.headline, " ");
      if (typeof node.attrs?.description === "string") parts.push(node.attrs.description, " ");
    }
    if (node.type === NODE.factBox) {
      if (typeof node.attrs?.title === "string") parts.push(node.attrs.title, " ");
      if (Array.isArray(node.attrs?.items)) {
        for (const item of node.attrs.items) {
          if (typeof item === "string" && item.trim()) parts.push(item, " ");
        }
      }
    }
    if (node.type === NODE.callout) {
      if (typeof node.attrs?.title === "string") parts.push(node.attrs.title, " ");
      if (typeof node.attrs?.body === "string") parts.push(node.attrs.body, " ");
    }
    node.content?.forEach(visit);
    if (["paragraph", "heading", "listItem", "tableCell", "tableHeader", "blockquote"].includes(node.type)) parts.push(" ");
  };
  if (doc) visit(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
