// Content contracts shared by the CMS adapter and the frontend. The CMS
// (Payload + Lexical) output is normalised into these shapes in
// src/lib/content.ts, so templates never depend on the editor's JSON format.

export type SectionKind = "kanal" | "rubrik";

export interface Section {
  slug: string;
  kind: SectionKind;
  name: string;
  description: string;
}

export interface MediaAsset {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
  credit?: string;
  /** Largest available rendition, used by the lightbox. */
  fullSrc?: string;
}

export interface Author {
  slug: string;
  name: string;
  role: string;
  bio?: string;
  avatar?: MediaAsset;
}

export type ArticleTemplate = "standard" | "feature" | "spotlight";

import type {
  BoxTone,
  DividerVariant,
  EditorialFontSize,
  FactBoxTone,
  ImageAlign,
  ImageRatio,
  ImageSize,
  LargeStatementTone,
  PullQuoteVariant,
} from "@/lib/editorial-tokens";

/** Inline run of text with formatting, or a hard line break. */
export type Inline =
  | {
      text: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strike?: boolean;
      code?: boolean;
      color?: string;
      highlight?: string;
      fontSize?: EditorialFontSize;
      /** Already validated: http(s), mailto, tel or a site-relative path. */
      href?: string;
      newTab?: boolean;
    }
  | { lineBreak: true };

export interface ListItem {
  content: Inline[];
  children?: ListItem[];
}

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
}

export type ArticleBlock =
  | { type: "paragraph"; content: Inline[]; dropCap?: boolean }
  | { type: "heading"; level: 2 | 3 | 4; content: Inline[]; id: string }
  | { type: "quote"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "image"; image: MediaAsset; size?: ImageSize; align?: ImageAlign; ratio?: Exclude<ImageRatio, "auto"> }
  | { type: "imagePair"; images: [MediaAsset, MediaAsset]; ratio?: Exclude<ImageRatio, "auto"> }
  | { type: "pullQuote"; text: string; attribution?: string; variant?: PullQuoteVariant }
  | { type: "largeStatement"; headline: string; description?: string; source?: string; tone?: LargeStatementTone }
  | { type: "factBox"; title: string; items: string[]; source?: string; tone?: FactBoxTone }
  | { type: "callout"; label?: string; title?: string; body: string; tone?: BoxTone }
  | { type: "gallery"; title?: string; images: MediaAsset[] }
  | { type: "infographic"; title: string; image: MediaAsset; source?: string; dataDate?: string; note?: string }
  | { type: "timeline"; title?: string; events: TimelineEvent[] }
  | { type: "table"; caption?: string; header: string[]; rows: string[][]; source?: string }
  | { type: "map"; title?: string; latitude: number; longitude: number; zoom: number; marker?: boolean; caption?: string }
  | { type: "video"; provider: "youtube" | "vimeo"; videoId: string; title: string; caption?: string }
  | { type: "divider"; variant?: DividerVariant };

export interface ArticleSeo {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: MediaAsset;
}

export interface Article {
  slug: string;
  title: string;
  standfirst: string;
  /** Kanal utama (slug Section ber-kind "kanal"). */
  kanal?: string;
  /** Rubrik editorial (slug Section ber-kind "rubrik"). */
  rubrik?: string;
  author: string;
  publishedAt: string; // ISO 8601
  updatedAt?: string;
  readingMinutes: number;
  template: ArticleTemplate;
  hero: MediaAsset;
  body: ArticleBlock[];
  /** Optional gallery shown after the body. */
  gallery?: MediaAsset[];
  tags: string[];
  seo?: ArticleSeo;
  /** true = konten contoh desain, bukan berita faktual. */
  isDemo?: boolean;
}

export interface EditorialNote {
  title: string;
  description: string;
  href: string;
}

export interface HomepageConfig {
  hero: string;
  featured: string[];
  latestCount: number;
  editorialNote: EditorialNote;
}
