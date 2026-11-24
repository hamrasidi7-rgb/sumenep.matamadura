import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { IS_PRODUCTION_SITE, SITE } from "@/lib/site";
import { logActivity } from "@/server/activity-log";
import { toMediaDto, type MediaDto } from "@/server/media/service";

// Layanan Pengaturan Situs & Kurasi Beranda (/admin/pengaturan) — Fase 9.
// Mengelola singleton `site_settings` & `homepage_settings` serta daftar kurasi
// `homepage_featured` dan `homepage_rubric` dengan menjaga semua CHECK constraint
// MariaDB dan batas koneksi paralel <= 4.

import {
  SOCIAL_PLATFORMS,
  type SocialKey,
  type SocialLinksInput,
} from "./constants";

export { SOCIAL_PLATFORMS, type SocialKey, type SocialLinksInput };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidHttpsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const siteSettingsInputSchema = z.object({
  tagline: z.string().trim().max(300, "Tagline maksimal 300 karakter.").default(""),
  description: z.string().trim().max(1000, "Deskripsi situs maksimal 1.000 karakter.").default(""),
  contactEmail: z
    .string()
    .trim()
    .max(254, "Email kontak maksimal 254 karakter.")
    .refine((v) => !v || EMAIL_RE.test(v), "Format email kontak tidak valid.")
    .default(""),
  defaultOgMediaId: z.uuid("ID gambar Open Graph tidak valid.").nullable().default(null),
  socialLinks: z
    .object({
      facebook: z.string().trim().max(300).optional(),
      instagram: z.string().trim().max(300).optional(),
      youtube: z.string().trim().max(300).optional(),
      x: z.string().trim().max(300).optional(),
      tiktok: z.string().trim().max(300).optional(),
      whatsapp: z.string().trim().max(300).optional(),
    })
    .superRefine((obj, ctx) => {
      for (const platform of SOCIAL_PLATFORMS) {
        const val = obj[platform.key];
        if (val && !isValidHttpsUrl(val)) {
          ctx.addIssue({
            code: "custom",
            path: [platform.key],
            message: `Tautan ${platform.label} harus berupa URL https:// yang valid.`,
          });
        }
      }
    })
    .default({}),
});

export type SiteSettingsFormInput = z.input<typeof siteSettingsInputSchema>;

export const homepageSettingsInputSchema = z.object({
  heroArticleId: z.uuid("ID artikel utama tidak valid.").nullable().default(null),
  latestCount: z.coerce
    .number()
    .int("Jumlah Berita Terbaru harus bilangan bulat.")
    .min(1, "Jumlah Berita Terbaru minimal 1 artikel.")
    .max(24, "Jumlah Berita Terbaru maksimal 24 artikel."),
  featuredArticleIds: z
    .array(z.uuid("ID artikel pilihan tidak valid."))
    .max(12, "Maksimal 12 artikel di daftar Tulisan Pilihan.")
    .transform((arr) => [...new Set(arr)]),
  rubrics: z
    .array(
      z.object({
        sectionId: z.uuid("ID rubrik tidak valid."),
        itemCount: z.coerce
          .number()
          .int("Jumlah artikel rubrik harus bilangan bulat.")
          .min(1, "Minimal 1 artikel per pita rubrik.")
          .max(12, "Maksimal 12 artikel per pita rubrik."),
      }),
    )
    .max(6, "Maksimal 6 pita rubrik di beranda.")
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.sectionId)) return false;
        seen.add(item.sectionId);
        return true;
      });
    }),
});

export type HomepageSettingsFormInput = z.input<typeof homepageSettingsInputSchema>;

export function normalizeSocialLinksObject(raw: unknown): Record<SocialKey, string> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result = {} as Record<SocialKey, string>;
  for (const platform of SOCIAL_PLATFORMS) {
    const val = source[platform.key];
    result[platform.key] = typeof val === "string" ? val : "";
  }
  return result;
}

export function compactSocialLinksForDb(links: SocialLinksInput): Prisma.InputJsonObject {
  const out: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const val = links[platform.key]?.trim();
    if (val) out[platform.key] = val;
  }
  return out;
}

export interface CmsSettingsData {
  portalInfo: {
    name: string;
    url: string;
    fallbackTagline: string;
    fallbackDescription: string;
    indexingLabel: string;
  };
  site: {
    tagline: string;
    description: string;
    contactEmail: string;
    defaultOgMediaId: string | null;
    socialLinks: Record<SocialKey, string>;
    updatedAtIso: string | null;
  };
  homepage: {
    heroArticleId: string | null;
    latestCount: number;
    featuredArticleIds: string[];
    rubrics: { sectionId: string; itemCount: number }[];
    updatedAtIso: string | null;
  };
  publishedArticles: {
    id: string;
    title: string;
    slug: string;
    kanalName: string;
  }[];
  rubrikOptions: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  }[];
  mediaMap: Record<string, MediaDto>;
}

export async function getCmsSettingsData(db: PrismaClient): Promise<CmsSettingsData> {
  // Wave 1 (4 kueri)
  const [siteRow, homepageRow, featuredRows, rubricRows] = await Promise.all([
    db.siteSettings.findUnique({
      where: { id: 1 },
      include: { defaultOgMedia: true },
    }),
    db.homepageSettings.findUnique({ where: { id: 1 } }),
    db.homepageFeatured.findMany({ orderBy: { position: "asc" } }),
    db.homepageRubric.findMany({ orderBy: { position: "asc" } }),
  ]);

  // Wave 2 (2 kueri)
  const [articles, rubrikOptions] = await Promise.all([
    db.article.findMany({
      where: { deletedAt: null, status: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 80,
      select: {
        id: true,
        title: true,
        slug: true,
        kanal: { select: { name: true } },
      },
    }),
    db.section.findMany({
      where: { kind: "RUBRIK" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, isActive: true },
    }),
  ]);

  const mediaMap: Record<string, MediaDto> = {};
  if (siteRow?.defaultOgMedia) {
    mediaMap[siteRow.defaultOgMedia.id] = toMediaDto(siteRow.defaultOgMedia);
  }

  return {
    portalInfo: {
      name: SITE.name,
      url: SITE.url,
      fallbackTagline: SITE.tagline,
      fallbackDescription: SITE.description,
      indexingLabel: IS_PRODUCTION_SITE ? "Produksi (terindeks)" : "Staging (noindex)",
    },
    site: {
      tagline: siteRow?.tagline ?? "",
      description: siteRow?.description ?? "",
      contactEmail: siteRow?.contactEmail ?? "",
      defaultOgMediaId: siteRow?.defaultOgMediaId ?? null,
      socialLinks: normalizeSocialLinksObject(siteRow?.socialLinks),
      updatedAtIso: siteRow?.updatedAt.toISOString() ?? null,
    },
    homepage: {
      heroArticleId: homepageRow?.heroArticleId ?? null,
      latestCount: homepageRow?.latestCount ?? 4,
      featuredArticleIds: featuredRows.map((f) => f.articleId),
      rubrics: rubricRows.map((r) => ({ sectionId: r.sectionId, itemCount: r.itemCount })),
      updatedAtIso: homepageRow?.updatedAt.toISOString() ?? null,
    },
    publishedArticles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      kanalName: a.kanal?.name ?? "Tanpa kanal",
    })),
    rubrikOptions,
    mediaMap,
  };
}

export type SettingsMutationResult = { ok: true } | { ok: false; error: string };

export async function updateSiteSettings(
  db: PrismaClient,
  rawInput: SiteSettingsFormInput,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<SettingsMutationResult> {
  const parsed = siteSettingsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Masukan pengaturan situs tidak valid." };
  }
  const input = parsed.data;

  if (input.defaultOgMediaId) {
    const media = await db.media.findUnique({ where: { id: input.defaultOgMediaId }, select: { id: true } });
    if (!media) return { ok: false, error: "Gambar Open Graph bawaan tidak ditemukan di Media Library." };
  }

  const socialJson = compactSocialLinksForDb(input.socialLinks);
  await db.$transaction(async (tx) => {
    await tx.siteSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        tagline: input.tagline || null,
        description: input.description || null,
        contactEmail: input.contactEmail ? input.contactEmail.toLowerCase() : null,
        defaultOgMediaId: input.defaultOgMediaId,
        socialLinks: socialJson,
      },
      update: {
        tagline: input.tagline || null,
        description: input.description || null,
        contactEmail: input.contactEmail ? input.contactEmail.toLowerCase() : null,
        defaultOgMediaId: input.defaultOgMediaId,
        socialLinks: socialJson,
      },
    });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "site.settings_update",
      entityType: "site_settings",
      entityId: "1",
      summary: "Pengaturan identitas dan tautan situs diperbarui.",
      meta: {
        hasTagline: Boolean(input.tagline),
        hasDescription: Boolean(input.description),
        hasContactEmail: Boolean(input.contactEmail),
        hasDefaultOgMedia: Boolean(input.defaultOgMediaId),
        socialCount: Object.keys(socialJson).length,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  });

  return { ok: true };
}

export async function updateHomepageSettings(
  db: PrismaClient,
  rawInput: HomepageSettingsFormInput,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<SettingsMutationResult> {
  const parsed = homepageSettingsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Masukan susunan beranda tidak valid." };
  }
  const input = parsed.data;

  const neededArticleIds = [
    ...(input.heroArticleId ? [input.heroArticleId] : []),
    ...input.featuredArticleIds,
  ];
  const uniqueArticleIds = [...new Set(neededArticleIds)];

  if (uniqueArticleIds.length > 0) {
    const validArticles = await db.article.findMany({
      where: { id: { in: uniqueArticleIds }, deletedAt: null, status: "PUBLISHED" },
      select: { id: true },
    });
    const validSet = new Set(validArticles.map((a) => a.id));
    if (input.heroArticleId && !validSet.has(input.heroArticleId)) {
      return { ok: false, error: "Artikel berita utama harus berstatus terbit dan tidak berada di tempat sampah." };
    }
    if (input.featuredArticleIds.some((id) => !validSet.has(id))) {
      return { ok: false, error: "Semua artikel Tulisan Pilihan harus berstatus terbit." };
    }
  }

  if (input.rubrics.length > 0) {
    const rubricIds = input.rubrics.map((r) => r.sectionId);
    const validRubrics = await db.section.findMany({
      where: { id: { in: rubricIds }, kind: "RUBRIK" },
      select: { id: true },
    });
    const validRubricSet = new Set(validRubrics.map((r) => r.id));
    if (rubricIds.some((id) => !validRubricSet.has(id))) {
      return { ok: false, error: "Setiap pita beranda hanya dapat merujuk seksi berjenis RUBRIK." };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.homepageSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        heroArticleId: input.heroArticleId,
        latestCount: input.latestCount,
      },
      update: {
        heroArticleId: input.heroArticleId,
        latestCount: input.latestCount,
      },
    });

    await tx.homepageFeatured.deleteMany({});
    if (input.featuredArticleIds.length > 0) {
      await tx.homepageFeatured.createMany({
        data: input.featuredArticleIds.map((articleId, position) => ({ articleId, position })),
      });
    }

    await tx.homepageRubric.deleteMany({});
    if (input.rubrics.length > 0) {
      await tx.homepageRubric.createMany({
        data: input.rubrics.map((r, position) => ({
          sectionId: r.sectionId,
          position,
          itemCount: r.itemCount,
        })),
      });
    }

    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "homepage.update",
      entityType: "homepage_settings",
      entityId: "1",
      summary: "Susunan beranda portal diperbarui.",
      meta: {
        heroArticleId: input.heroArticleId,
        latestCount: input.latestCount,
        featuredCount: input.featuredArticleIds.length,
        rubricCount: input.rubrics.length,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  });

  return { ok: true };
}
