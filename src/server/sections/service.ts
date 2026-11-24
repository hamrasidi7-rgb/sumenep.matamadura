import type { Prisma, PrismaClient, SectionKind } from "@prisma/client";
import { z } from "zod";

import { slugCandidate, slugify } from "@/lib/article-slug";
import { logActivity } from "@/server/activity-log";
import { isUniqueViolation } from "@/server/db/errors";
import { sectionInputSchema, sectionKindSchema, slugSchema } from "@/server/validation/common";

type Tx = Prisma.TransactionClient;

export interface SectionActor {
  adminId: number;
  ip?: string | null;
  userAgent?: string | null;
}

export interface SectionAdminRow {
  id: string;
  kind: SectionKind;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  articleCount: number;
  homepageUsageCount: number;
  updatedAt: string;
}

export const sectionCreateFormSchema = z.object({
  kind: sectionKindSchema,
  name: sectionInputSchema.shape.name,
  slug: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(300, { error: "Deskripsi maksimal 300 karakter." }).optional().default(""),
  sortOrder: z.coerce.number().int().min(0, { error: "Urutan minimal 0." }).max(999, { error: "Urutan maksimal 999." }).default(0),
  isActive: z.boolean().default(true),
});

export const sectionUpdateFormSchema = sectionCreateFormSchema.omit({ kind: true });

export type SectionCreateInput = z.input<typeof sectionCreateFormSchema>;
export type SectionUpdateInput = z.input<typeof sectionUpdateFormSchema>;

export type SectionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function freeSectionSlug(tx: Tx, kind: SectionKind, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || (kind === "KANAL" ? "kanal" : "rubrik");
  for (let n = 1; n <= 200; n += 1) {
    const candidate = slugCandidate(root, n).slice(0, 80);
    const exists = await tx.section.findFirst({
      where: { kind, slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error("Tidak menemukan slug kanal/rubrik yang bebas.");
}

async function resolveSectionSlug(
  tx: Tx,
  kind: SectionKind,
  requested: string,
  name: string,
  excludeId?: string,
): Promise<string | { error: string }> {
  const raw = requested.trim();
  if (!raw) return freeSectionSlug(tx, kind, name, excludeId);
  const cleaned = slugify(raw).slice(0, 80);
  const parsed = slugSchema(80).safeParse(cleaned);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Slug tidak valid." };
  const taken = await tx.section.findFirst({
    where: { kind, slug: parsed.data, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (taken) return { error: `Slug "${parsed.data}" sudah dipakai pada ${kind === "KANAL" ? "kanal" : "rubrik"} lain.` };
  return parsed.data;
}

export async function listSectionsForAdmin(db: PrismaClient): Promise<{
  kanal: SectionAdminRow[];
  rubrik: SectionAdminRow[];
}> {
  const rows = await db.section.findMany({
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          kanalArticles: true,
          rubrikArticles: true,
          homepageRubrics: true,
        },
      },
    },
  });

  const mapped: SectionAdminRow[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    articleCount: row._count.kanalArticles + row._count.rubrikArticles,
    homepageUsageCount: row._count.homepageRubrics,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return {
    kanal: mapped.filter((s) => s.kind === "KANAL"),
    rubrik: mapped.filter((s) => s.kind === "RUBRIK"),
  };
}

export async function createSection(
  db: PrismaClient,
  input: SectionCreateInput,
  actor: SectionActor,
): Promise<SectionResult<{ id: string; slug: string }>> {
  const parsed = sectionCreateFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data kanal/rubrik tidak valid." };
  const data = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const slug = await resolveSectionSlug(tx, data.kind, data.slug, data.name);
      if (typeof slug !== "string") return { ok: false, error: slug.error };

      const validCore = sectionInputSchema.safeParse({
        kind: data.kind,
        slug,
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
      });
      if (!validCore.success) return { ok: false, error: validCore.error.issues[0]?.message ?? "Data tidak valid." };

      const created = await tx.section.create({
        data: {
          kind: validCore.data.kind,
          slug: validCore.data.slug,
          name: validCore.data.name,
          description: validCore.data.description,
          sortOrder: validCore.data.sortOrder,
          isActive: data.isActive,
        },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "section.create",
        entityType: "section",
        entityId: created.id,
        summary: `${created.kind}: ${created.name}`,
        meta: { kind: created.kind, slug: created.slug, isActive: created.isActive },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { ok: true as const, id: created.id, slug: created.slug };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Slug tersebut sudah digunakan." };
    throw error;
  }
}

export async function updateSection(
  db: PrismaClient,
  id: string,
  input: SectionUpdateInput,
  actor: SectionActor,
): Promise<SectionResult<{ slug: string }>> {
  const parsed = sectionUpdateFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data kanal/rubrik tidak valid." };
  const data = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.section.findUnique({ where: { id } });
      if (!existing) return { ok: false, error: "Kanal/rubrik tidak ditemukan." };

      const slug = data.slug ? await resolveSectionSlug(tx, existing.kind, data.slug, data.name, id) : existing.slug;
      if (typeof slug !== "string") return { ok: false, error: slug.error };

      const validCore = sectionInputSchema.safeParse({
        kind: existing.kind,
        slug,
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
      });
      if (!validCore.success) return { ok: false, error: validCore.error.issues[0]?.message ?? "Data tidak valid." };

      // Penting: jangan pernah mengirim field `kind` saat update (guard section.kind immutable di guards.ts).
      await tx.section.update({
        where: { id },
        data: {
          slug: validCore.data.slug,
          name: validCore.data.name,
          description: validCore.data.description,
          sortOrder: validCore.data.sortOrder,
          isActive: data.isActive,
        },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "section.update",
        entityType: "section",
        entityId: id,
        summary: `${existing.kind}: ${validCore.data.name}`,
        meta:
          slug !== existing.slug
            ? { kind: existing.kind, slugFrom: existing.slug, slugTo: slug, isActive: data.isActive }
            : { kind: existing.kind, isActive: data.isActive },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { ok: true as const, slug };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Slug tersebut sudah digunakan." };
    throw error;
  }
}

export async function toggleSectionActive(db: PrismaClient, id: string, actor: SectionActor): Promise<SectionResult<{ isActive: boolean }>> {
  return db.$transaction(async (tx) => {
    const existing = await tx.section.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Kanal/rubrik tidak ditemukan." };
    const nextActive = !existing.isActive;
    await tx.section.update({ where: { id }, data: { isActive: nextActive } });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "section.toggle",
      entityType: "section",
      entityId: id,
      summary: `${existing.kind}: ${existing.name}`,
      meta: { kind: existing.kind, isActive: nextActive },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { ok: true as const, isActive: nextActive };
  });
}

export async function deleteSection(db: PrismaClient, id: string, actor: SectionActor): Promise<SectionResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.section.findUnique({
      where: { id },
      include: { _count: { select: { kanalArticles: true, rubrikArticles: true, homepageRubrics: true } } },
    });
    if (!existing) return { ok: false, error: "Kanal/rubrik tidak ditemukan." };
    const usedArticles = existing._count.kanalArticles + existing._count.rubrikArticles;
    if (usedArticles > 0 || existing._count.homepageRubrics > 0) {
      return {
        ok: false,
        error: `"${existing.name}" masih dipakai oleh ${usedArticles} artikel dan ${existing._count.homepageRubrics} slot beranda. Nonaktifkan alih-alih menghapus.`,
      };
    }
    await tx.section.delete({ where: { id } });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "section.delete",
      entityType: "section",
      entityId: id,
      summary: `${existing.kind}: ${existing.name}`,
      meta: { kind: existing.kind, slug: existing.slug },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { ok: true as const };
  });
}
