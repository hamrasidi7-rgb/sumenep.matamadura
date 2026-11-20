// Content contracts. These mirror the Payload collections planned for Tahap 5
// (Articles, Sections, Authors, Media, Homepage global), so swapping the seed
// adapter in src/lib/content.ts for the Payload Local API does not touch any
// component.

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
}

export interface Author {
  slug: string;
  name: string;
  role: string;
  bio?: string;
  avatar?: MediaAsset;
}

export type ArticleTemplate = "standard" | "feature" | "spotlight";

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string; id?: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "image"; image: MediaAsset };

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
  readingMinutes: number;
  template: ArticleTemplate;
  hero: MediaAsset;
  body: ArticleBlock[];
  tags: string[];
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
