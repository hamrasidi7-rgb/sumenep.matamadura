import type { ArticleBlock, Inline, ListItem } from "@/content/types";

/** URL-safe id from Indonesian text: "Daratan & Pulau" → "daratan-pulau". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function inlineText(content: Inline[]): string {
  return content.map((c) => ("lineBreak" in c ? " " : c.text)).join("");
}

function listText(items: ListItem[]): string {
  return items.map((i) => `${inlineText(i.content)} ${i.children ? listText(i.children) : ""}`).join(" ");
}

/** Visible text of a block (used for reading time and search). */
export function blockText(b: ArticleBlock): string {
  switch (b.type) {
    case "paragraph":
    case "heading":
    case "quote":
      return inlineText(b.content);
    case "list":
      return listText(b.items);
    case "pullQuote":
      return b.text;
    case "timeline":
      return b.events.map((e) => `${e.date} ${e.title} ${e.description ?? ""}`).join(" ");
    case "table":
      return [b.caption ?? "", ...b.header, ...b.rows.flat()].join(" ");
    case "infographic":
      return `${b.title} ${b.note ?? ""}`;
    default:
      return "";
  }
}

const WORDS_PER_MINUTE = 200;

export function estimateReadingMinutes(blocks: ArticleBlock[], standfirst = ""): number {
  const words = [standfirst, ...blocks.map(blockText)].join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Gives every heading a unique, stable id (needed for the table of contents). */
export function withHeadingIds(blocks: ArticleBlock[]): ArticleBlock[] {
  const seen = new Map<string, number>();
  return blocks.map((b) => {
    if (b.type !== "heading") return b;
    const base = slugify(b.id || inlineText(b.content)) || "bagian";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...b, id: n === 0 ? base : `${base}-${n + 1}` };
  });
}

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

export function extractToc(blocks: ArticleBlock[]): TocEntry[] {
  return blocks.flatMap((b) =>
    b.type === "heading" && (b.level === 2 || b.level === 3) ? [{ id: b.id, text: inlineText(b.content), level: b.level }] : [],
  );
}

/** Allows only safe link targets; anything else (javascript:, data:, …) is dropped. */
export function safeHref(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const url = raw.trim();
  if (/^\/(?!\/)/.test(url) || url.startsWith("#")) return url;
  try {
    const u = new URL(url);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Parses YouTube / Vimeo URLs into a provider + id; other hosts are rejected. */
export function parseVideoUrl(raw: string): { provider: "youtube" | "vimeo"; videoId: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? { provider: "youtube", videoId: id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1] ?? "";
    return /^[\w-]{11}$/.test(id) ? { provider: "youtube", videoId: id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(\d{6,12})/)?.[1];
    return id ? { provider: "vimeo", videoId: id } : null;
  }
  return null;
}

export function videoEmbedUrl(provider: "youtube" | "vimeo", id: string): string {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1&dnt=1`;
}

/** OpenStreetMap embed (no API key, no tracking cookies) around a point. */
export function osmEmbedUrl(lat: number, lng: number, zoom: number, marker = true): string {
  const z = Math.min(18, Math.max(3, Math.round(zoom)));
  const degPerPx = 360 / (256 * 2 ** z);
  const halfW = degPerPx * 320;
  const halfH = degPerPx * 200;
  const bbox = [lng - halfW, lat - halfH, lng + halfW, lat + halfH].map((n) => n.toFixed(5)).join(",");
  const pin = marker ? `&marker=${lat.toFixed(5)},${lng.toFixed(5)}` : "";
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${pin}`;
}

export function osmLink(lat: number, lng: number, zoom: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=${Math.round(zoom)}/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}
