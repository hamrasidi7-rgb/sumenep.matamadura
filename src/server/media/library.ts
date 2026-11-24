import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { clampPage, pageOffset, totalPages } from "@/lib/admin-pagination";
import { logActivity } from "@/server/activity-log";

import { toMediaDto, type MediaDto } from "./service";

// Layanan Media Library & Folder (/admin/media) untuk Fase 5.
// Mengadaptasi ringkasan statistik, filter pemakaian/folder, pemeriksaan dependensi
// relasi DB sebelum hapus, serta paginasi server-side dari Busacare ke skema
// MariaDB SUMENEP (tabel media + media_folder).

export const ADMIN_MEDIA_PATH = "/admin/media";
export const MEDIA_PER_PAGE = 24;

export type MediaUsageFilter = "semua" | "dipakai" | "tidak-dipakai";

export interface MediaLibraryQuery {
  q: string;
  folder: string; // "semua" | "tanpa-folder" | <folderId>
  usage: MediaUsageFilter;
  page: number;
}

export interface MediaUsageRef {
  kind: "Gambar utama" | "Gambar OG" | "Isi/Galeri" | "Avatar penulis" | "OG situs";
  label: string;
  href?: string;
}

export interface MediaLibraryItem extends MediaDto {
  originalName: string;
  sizeBytes: number;
  sha256Prefix: string;
  folderName: string | null;
  createdAtIso: string;
  usages: MediaUsageRef[];
  totalUsages: number;
}

export interface MediaFolderSummary {
  id: string;
  name: string;
  mediaCount: number;
}

export interface MediaLibraryStats {
  totalCount: number;
  totalBytes: number;
  usedCount: number;
  unusedCount: number;
  withoutFolderCount: number;
}

export interface MediaLibraryData {
  query: MediaLibraryQuery;
  stats: MediaLibraryStats;
  folders: MediaFolderSummary[];
  items: MediaLibraryItem[];
  filteredTotal: number;
  page: number;
  pages: number;
  perPage: number;
}

export const MEDIA_USED_WHERE: Prisma.MediaWhereInput = {
  OR: [
    { heroOf: { some: {} } },
    { ogOf: { some: {} } },
    { usages: { some: {} } },
    { authorAvatars: { some: {} } },
    { siteDefaultOg: { some: {} } },
  ],
};

export const folderNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama folder wajib diisi.")
    .max(100, "Nama folder maksimal 100 karakter."),
});

const uuidCheck = z.uuid();

export function parseMediaQuery(raw: Record<string, string | string[] | undefined>): MediaLibraryQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const q = first(raw.q).trim().slice(0, 100);
  const rawFolder = first(raw.folder).trim();
  const folder =
    rawFolder === "tanpa-folder" || uuidCheck.safeParse(rawFolder).success ? rawFolder : "semua";
  const rawUsage = first(raw.pemakaian).trim();
  const usage: MediaUsageFilter =
    rawUsage === "dipakai" || rawUsage === "tidak-dipakai" ? rawUsage : "semua";
  const page = clampPage(first(raw.halaman));
  return { q, folder, usage, page };
}

export function buildMediaHref(
  query: Partial<MediaLibraryQuery> & { page?: number },
  basePath = ADMIN_MEDIA_PATH,
): string {
  const sp = new URLSearchParams();
  if (query.q?.trim()) sp.set("q", query.q.trim());
  if (query.folder && query.folder !== "semua") sp.set("folder", query.folder);
  if (query.usage && query.usage !== "semua") sp.set("pemakaian", query.usage);
  if (query.page && query.page > 1) sp.set("halaman", String(query.page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function buildMediaLibraryWhere(query: Pick<MediaLibraryQuery, "q" | "folder" | "usage">): Prisma.MediaWhereInput {
  const conditions: Prisma.MediaWhereInput[] = [];
  if (query.q) {
    conditions.push({
      OR: [
        { alt: { contains: query.q } },
        { caption: { contains: query.q } },
        { credit: { contains: query.q } },
        { originalName: { contains: query.q } },
      ],
    });
  }
  if (query.folder === "tanpa-folder") {
    conditions.push({ folderId: null });
  } else if (query.folder !== "semua" && uuidCheck.safeParse(query.folder).success) {
    conditions.push({ folderId: query.folder });
  }
  if (query.usage === "dipakai") {
    conditions.push(MEDIA_USED_WHERE);
  } else if (query.usage === "tidak-dipakai") {
    conditions.push({ NOT: MEDIA_USED_WHERE });
  }
  return conditions.length > 0 ? { AND: conditions } : {};
}

type MediaUsageInput = {
  heroOf: { id: string; title: string }[];
  ogOf: { id: string; title: string }[];
  usages: { article: { id: string; title: string } }[];
  authorAvatars: { id: string; name: string }[];
  siteDefaultOg: { id: number }[];
  _count: {
    heroOf: number;
    ogOf: number;
    usages: number;
    authorAvatars: number;
    siteDefaultOg: number;
  };
};

export function summarizeMediaUsage(row: MediaUsageInput): { usages: MediaUsageRef[]; totalUsages: number } {
  const refs: MediaUsageRef[] = [];
  const seen = new Set<string>();
  const pushUnique = (ref: MediaUsageRef, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  for (const a of row.heroOf) {
    pushUnique({ kind: "Gambar utama", label: a.title, href: `/admin/artikel/${a.id}` }, `hero:${a.id}`);
  }
  for (const a of row.ogOf) {
    pushUnique({ kind: "Gambar OG", label: a.title, href: `/admin/artikel/${a.id}` }, `og:${a.id}`);
  }
  for (const u of row.usages) {
    pushUnique({ kind: "Isi/Galeri", label: u.article.title, href: `/admin/artikel/${u.article.id}` }, `body:${u.article.id}`);
  }
  for (const author of row.authorAvatars) {
    pushUnique({ kind: "Avatar penulis", label: author.name, href: "/admin/penulis" }, `author:${author.id}`);
  }
  if (row.siteDefaultOg.length > 0) {
    pushUnique({ kind: "OG situs", label: "Gambar share bawaan portal", href: "/admin/pengaturan" }, "site:og");
  }

  const totalUsages =
    row._count.heroOf +
    row._count.ogOf +
    row._count.usages +
    row._count.authorAvatars +
    row._count.siteDefaultOg;

  return { usages: refs, totalUsages };
}

const mediaLibraryInclude = {
  folder: { select: { id: true, name: true } },
  heroOf: { select: { id: true, title: true }, take: 5 },
  ogOf: { select: { id: true, title: true }, take: 5 },
  usages: { select: { article: { select: { id: true, title: true } } }, take: 5 },
  authorAvatars: { select: { id: true, name: true }, take: 5 },
  siteDefaultOg: { select: { id: true }, take: 1 },
  _count: { select: { heroOf: true, ogOf: true, usages: true, authorAvatars: true, siteDefaultOg: true } },
} satisfies Prisma.MediaInclude;

export async function listMediaLibrary(
  db: PrismaClient,
  query: MediaLibraryQuery,
  perPage = MEDIA_PER_PAGE,
): Promise<MediaLibraryData> {
  // Wave 1 (<= 4 query paralel untuk connectionLimit MariaDB Hostinger).
  const [agg, usedCount, rawFolders] = await Promise.all([
    db.media.aggregate({ _count: true, _sum: { sizeBytes: true } }),
    db.media.count({ where: MEDIA_USED_WHERE }),
    db.mediaFolder.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { media: true } } },
    }),
  ]);

  const totalCount = agg._count;
  const totalBytes = agg._sum.sizeBytes ?? 0;
  const folders: MediaFolderSummary[] = rawFolders.map((f) => ({
    id: f.id,
    name: f.name,
    mediaCount: f._count.media,
  }));
  const countInFolders = folders.reduce((acc, f) => acc + f.mediaCount, 0);

  // Jika folder filter menunjuk ID yang baru dihapus, jatuhkan ke "semua" agar list tidak terkunci.
  const activeQuery: MediaLibraryQuery =
    query.folder !== "semua" &&
    query.folder !== "tanpa-folder" &&
    !folders.some((f) => f.id === query.folder)
      ? { ...query, folder: "semua" }
      : query;

  const where = buildMediaLibraryWhere(activeQuery);
  const filteredTotal = await db.media.count({ where });
  const pages = totalPages(filteredTotal, perPage);
  const safePage = clampPage(activeQuery.page, pages);

  const rows = await db.media.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pageOffset(safePage, perPage),
    take: perPage,
    include: mediaLibraryInclude,
  });

  const items: MediaLibraryItem[] = rows.map((row) => {
    const { usages, totalUsages } = summarizeMediaUsage(row);
    return {
      ...toMediaDto(row),
      originalName: row.originalName,
      sizeBytes: row.sizeBytes,
      sha256Prefix: row.sha256.slice(0, 10),
      folderName: row.folder?.name ?? null,
      createdAtIso: row.createdAt.toISOString(),
      usages,
      totalUsages,
    };
  });

  return {
    query: { ...activeQuery, page: safePage },
    stats: {
      totalCount,
      totalBytes,
      usedCount,
      unusedCount: Math.max(0, totalCount - usedCount),
      withoutFolderCount: Math.max(0, totalCount - countInFolders),
    },
    folders,
    items,
    filteredTotal,
    page: safePage,
    pages,
    perPage,
  };
}

export type FolderMutationResult =
  | { ok: true; folder: { id: string; name: string } }
  | { ok: false; error: string };

export async function createMediaFolder(
  db: PrismaClient,
  input: { name: string },
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<FolderMutationResult> {
  const parsed = folderNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nama folder tidak valid." };

  const duplicate = await db.mediaFolder.findFirst({ where: { name: parsed.data.name }, select: { id: true } });
  if (duplicate) return { ok: false, error: `Folder "${parsed.data.name}" sudah ada.` };

  try {
    const folder = await db.$transaction(async (tx) => {
      const created = await tx.mediaFolder.create({ data: { name: parsed.data.name } });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "media.folder_create",
        entityType: "media_folder",
        entityId: created.id,
        summary: `Folder media dibuat: ${created.name}`,
        meta: { name: created.name },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return created;
    });
    return { ok: true, folder: { id: folder.id, name: folder.name } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: `Folder "${parsed.data.name}" sudah ada.` };
    }
    throw error;
  }
}

export async function renameMediaFolder(
  db: PrismaClient,
  id: string,
  input: { name: string },
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<FolderMutationResult> {
  if (!uuidCheck.safeParse(id).success) return { ok: false, error: "ID folder tidak valid." };
  const parsed = folderNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nama folder tidak valid." };

  const existing = await db.mediaFolder.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) return { ok: false, error: "Folder media tidak ditemukan." };

  const duplicate = await db.mediaFolder.findFirst({
    where: { name: parsed.data.name, id: { not: id } },
    select: { id: true },
  });
  if (duplicate) return { ok: false, error: `Folder "${parsed.data.name}" sudah ada.` };

  try {
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.mediaFolder.update({
        where: { id },
        data: { name: parsed.data.name },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "media.folder_rename",
        entityType: "media_folder",
        entityId: id,
        summary: `Folder media diubah: ${existing.name} → ${row.name}`,
        meta: { from: existing.name, to: row.name },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return row;
    });
    return { ok: true, folder: { id: updated.id, name: updated.name } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: `Folder "${parsed.data.name}" sudah ada.` };
    }
    throw error;
  }
}

export type DeleteFolderResult =
  | { ok: true; id: string; name: string; movedCount: number }
  | { ok: false; error: string };

export async function deleteMediaFolder(
  db: PrismaClient,
  id: string,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<DeleteFolderResult> {
  if (!uuidCheck.safeParse(id).success) return { ok: false, error: "ID folder tidak valid." };
  const existing = await db.mediaFolder.findUnique({
    where: { id },
    include: { _count: { select: { media: true } } },
  });
  if (!existing) return { ok: false, error: "Folder media tidak ditemukan." };

  await db.$transaction(async (tx) => {
    // FK media_folder -> media menggunakan onDelete: SetNull sehingga gambar otomatis kembali ke Tanpa folder.
    await tx.mediaFolder.delete({ where: { id } });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "media.folder_delete",
      entityType: "media_folder",
      entityId: id,
      summary: `Folder media dihapus: ${existing.name}`,
      meta: { name: existing.name, movedCount: existing._count.media },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  });

  return { ok: true, id: existing.id, name: existing.name, movedCount: existing._count.media };
}
