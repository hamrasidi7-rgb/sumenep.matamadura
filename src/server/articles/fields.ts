import { z } from "zod";

import { docPlainText, type DocNode } from "@/lib/article-doc";

import { sanitizeDoc } from "./sanitize";
import { toTags } from "./tags";

// Every field the editor can change, validated on the server for every save
// (autosave, manual save, publish). The body is sanitised here, so nothing
// downstream ever sees an unsanitised document.

const uuid = z.uuid({ error: "Pilihan tidak valid." });
const optionalUuid = z
  .union([uuid, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .optional()
    .transform((v) => v || null);

export const TEMPLATES = ["STANDARD", "FEATURE", "SPOTLIGHT"] as const;

export const articleFieldsSchema = z.object({
  title: z.string({ error: "Judul wajib diisi." }).trim().min(1, { error: "Judul wajib diisi." }).max(200, { error: "Judul maksimal 200 karakter." }),
  /** Empty = keep the current slug (or derive one from the title for a new article). */
  slug: z.string().trim().max(200).optional().default(""),
  standfirst: z.string().trim().max(600, { error: "Lead maksimal 600 karakter." }).default(""),
  template: z.enum(TEMPLATES).default("STANDARD"),
  body: z.unknown().transform((value) => sanitizeDoc(value) as DocNode),
  authorId: uuid,
  kanalId: optionalUuid,
  rubrikId: optionalUuid,
  heroMediaId: optionalUuid,
  tags: z
    .array(z.string())
    .max(30)
    .default([])
    .transform((tags) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of tags) {
        const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
        if (tag && !seen.has(tag.toLowerCase())) {
          seen.add(tag.toLowerCase());
          out.push(tag);
        }
      }
      return out.slice(0, 12);
    }),
  seoTitle: optionalText(120, "SEO title maksimal 120 karakter."),
  seoDescription: optionalText(300, "Meta description maksimal 300 karakter."),
  canonicalUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .refine((v) => !v || /^https:\/\/[^\s]+$/.test(v), { error: "Canonical URL harus diawali https://." })
    .transform((v) => v || null),
  ogMediaId: optionalUuid,
  hideFromHomepage: z.boolean().default(false),
});

export type ArticleFieldsInput = z.input<typeof articleFieldsSchema>;
export type ArticleFields = z.output<typeof articleFieldsSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Text, reading time and media of a sanitised body. */
export function bodyFacts(body: DocNode) {
  const text = docPlainText(body);
  return { bodyText: text, readingMinutes: Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200)) };
}

/** What a revision stores: every editable field plus the publication state. */
export function snapshotOf(article: {
  title: string;
  slug: string;
  standfirst: string;
  template: string;
  body: unknown;
  authorId: string;
  kanalId: string | null;
  rubrikId: string | null;
  heroMediaId: string | null;
  tags: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogMediaId: string | null;
  hideFromHomepage: boolean;
  status: string;
  publishedAt: Date | null;
}) {
  return {
    title: article.title,
    slug: article.slug,
    standfirst: article.standfirst,
    template: article.template,
    body: article.body,
    authorId: article.authorId,
    kanalId: article.kanalId,
    rubrikId: article.rubrikId,
    heroMediaId: article.heroMediaId,
    tags: toTags(article.tags),
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    canonicalUrl: article.canonicalUrl,
    ogMediaId: article.ogMediaId,
    hideFromHomepage: article.hideFromHomepage,
    status: article.status,
    publishedAt: article.publishedAt?.toISOString() ?? null,
  };
}
