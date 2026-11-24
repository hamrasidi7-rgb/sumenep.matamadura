import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { slugCandidate, slugify } from "@/lib/article-slug";
import { logActivity } from "@/server/activity-log";
import { isUniqueViolation } from "@/server/db/errors";
import { mediaUrl, toMediaDto, type MediaDto } from "@/server/media/service";
import { slugSchema } from "@/server/validation/common";

type Tx = Prisma.TransactionClient;

export interface AuthorActor {
  adminId: number;
  ip?: string | null;
  userAgent?: string | null;
}

const optionalUuid = z
  .union([z.uuid({ error: "Gambar profil tidak valid." }), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const authorFormSchema = z.object({
  name: z
    .string({ error: "Nama penulis wajib diisi." })
    .trim()
    .min(1, { error: "Nama penulis wajib diisi." })
    .max(200, { error: "Nama penulis maksimal 200 karakter." }),
  slug: z.string().trim().max(80).optional().default(""),
  role: z.string().trim().max(200, { error: "Peran maksimal 200 karakter." }).optional().default(""),
  bio: z
    .string()
    .trim()
    .max(3000, { error: "Bio maksimal 3000 karakter." })
    .optional()
    .nullable()
    .transform((v) => v || null),
  avatarId: optionalUuid,
  isActive: z.boolean().default(true),
});

export type AuthorFormInput = z.input<typeof authorFormSchema>;

export interface AuthorAdminRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatarId: string | null;
  avatarSrc: string | null;
  isActive: boolean;
  articleCount: number;
  updatedAt: string;
}

export type AuthorResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function freeAuthorSlug(tx: Tx, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "penulis";
  for (let n = 1; n <= 200; n += 1) {
    const candidate = slugCandidate(root, n).slice(0, 80);
    const exists = await tx.author.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error("Tidak menemukan slug penulis yang bebas.");
}

async function resolveAuthorSlug(tx: Tx, requested: string, name: string, excludeId?: string): Promise<string | { error: string }> {
  const raw = requested.trim();
  if (!raw) return freeAuthorSlug(tx, name, excludeId);
  const cleaned = slugify(raw).slice(0, 80);
  const parsed = slugSchema(80).safeParse(cleaned);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Slug penulis tidak valid." };
  const taken = await tx.author.findFirst({
    where: { slug: parsed.data, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (taken) return { error: "Slug penulis tersebut sudah dipakai profil lain." };
  return parsed.data;
}

export async function listAuthorsForAdmin(db: PrismaClient): Promise<{
  authors: AuthorAdminRow[];
  avatarMedia: Record<string, MediaDto>;
}> {
  const rows = await db.author.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      avatar: { select: { id: true, storageKey: true, width: true, height: true, alt: true, caption: true, credit: true } },
      _count: { select: { articles: true } },
    },
  });

  const avatarMedia: Record<string, MediaDto> = {};
  const authors: AuthorAdminRow[] = rows.map((row) => {
    if (row.avatar) avatarMedia[row.avatar.id] = toMediaDto(row.avatar);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      bio: row.bio ?? "",
      avatarId: row.avatarId,
      avatarSrc: row.avatar ? mediaUrl(row.avatar.storageKey) : null,
      isActive: row.isActive,
      articleCount: row._count.articles,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  return { authors, avatarMedia };
}

export async function createAuthor(db: PrismaClient, input: AuthorFormInput, actor: AuthorActor): Promise<AuthorResult<{ id: string; slug: string }>> {
  const parsed = authorFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data penulis tidak valid." };
  const data = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      if (data.avatarId) {
        const media = await tx.media.findUnique({ where: { id: data.avatarId }, select: { id: true } });
        if (!media) return { ok: false, error: "Foto profil yang dipilih tidak ditemukan." };
      }
      const slug = await resolveAuthorSlug(tx, data.slug, data.name);
      if (typeof slug !== "string") return { ok: false, error: slug.error };

      const created = await tx.author.create({
        data: {
          slug,
          name: data.name,
          role: data.role,
          bio: data.bio,
          avatarId: data.avatarId,
          isActive: data.isActive,
        },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "author.create",
        entityType: "author",
        entityId: created.id,
        summary: created.name,
        meta: { slug: created.slug, isActive: created.isActive },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { ok: true as const, id: created.id, slug: created.slug };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Slug penulis baru saja dipakai profil lain." };
    throw error;
  }
}

export async function updateAuthor(db: PrismaClient, id: string, input: AuthorFormInput, actor: AuthorActor): Promise<AuthorResult<{ slug: string }>> {
  const parsed = authorFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data penulis tidak valid." };
  const data = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.author.findUnique({ where: { id } });
      if (!existing) return { ok: false, error: "Profil penulis tidak ditemukan." };

      if (existing.isActive && !data.isActive) {
        const otherActive = await tx.author.count({ where: { isActive: true, id: { not: id } } });
        if (otherActive === 0) return { ok: false, error: "Minimal satu penulis aktif harus dipertahankan agar penulisan artikel tetap berfungsi." };
      }

      if (data.avatarId) {
        const media = await tx.media.findUnique({ where: { id: data.avatarId }, select: { id: true } });
        if (!media) return { ok: false, error: "Foto profil yang dipilih tidak ditemukan." };
      }

      const slug = data.slug ? await resolveAuthorSlug(tx, data.slug, data.name, id) : existing.slug;
      if (typeof slug !== "string") return { ok: false, error: slug.error };

      await tx.author.update({
        where: { id },
        data: {
          slug,
          name: data.name,
          role: data.role,
          bio: data.bio,
          avatarId: data.avatarId,
          isActive: data.isActive,
        },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "author.update",
        entityType: "author",
        entityId: id,
        summary: data.name,
        meta: slug !== existing.slug ? { slugFrom: existing.slug, slugTo: slug, isActive: data.isActive } : { isActive: data.isActive },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { ok: true as const, slug };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Slug penulis baru saja dipakai profil lain." };
    throw error;
  }
}

export async function toggleAuthorActive(db: PrismaClient, id: string, actor: AuthorActor): Promise<AuthorResult<{ isActive: boolean }>> {
  return db.$transaction(async (tx) => {
    const existing = await tx.author.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Profil penulis tidak ditemukan." };
    const nextActive = !existing.isActive;
    if (!nextActive) {
      const otherActive = await tx.author.count({ where: { isActive: true, id: { not: id } } });
      if (otherActive === 0) return { ok: false, error: "Minimal satu penulis aktif harus dipertahankan agar penulisan artikel tetap berfungsi." };
    }
    await tx.author.update({ where: { id }, data: { isActive: nextActive } });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "author.toggle",
      entityType: "author",
      entityId: id,
      summary: existing.name,
      meta: { isActive: nextActive },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { ok: true as const, isActive: nextActive };
  });
}

export async function deleteAuthor(db: PrismaClient, id: string, actor: AuthorActor): Promise<AuthorResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.author.findUnique({
      where: { id },
      include: { _count: { select: { articles: true } } },
    });
    if (!existing) return { ok: false, error: "Profil penulis tidak ditemukan." };
    if (existing._count.articles > 0) {
      return {
        ok: false,
        error: `Penulis "${existing.name}" masih terhubung dengan ${existing._count.articles} artikel. Nonaktifkan profil alih-alih menghapus.`,
      };
    }
    if (existing.isActive) {
      const otherActive = await tx.author.count({ where: { isActive: true, id: { not: id } } });
      if (otherActive === 0) return { ok: false, error: "Minimal satu penulis aktif harus dipertahankan." };
    }
    await tx.author.delete({ where: { id } });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "author.delete",
      entityType: "author",
      entityId: id,
      summary: existing.name,
      meta: { slug: existing.slug },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { ok: true as const };
  });
}
