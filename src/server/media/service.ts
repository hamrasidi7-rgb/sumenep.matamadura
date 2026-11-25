import { createHash } from "node:crypto";

import { Prisma, type Media, type PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";

import type { MediaAsset } from "@/content/types";
import {
  clampFocal,
  computeCoverCrop,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_WIDTH,
  type MediaUploadPreset,
} from "@/lib/media-crop";
import { logActivity } from "@/server/activity-log";

import { buildMediaUrl, getMediaStorage } from "./storage";

// Image upload for the CMS (Fase 4 minimum: upload + recent list; delete was
// added with the move to disk storage — API only, the Media Library UI with
// folders, search and delete buttons is Fase 6).
//
// Adapted from Busacare's upload route + sharp pipeline: decode with sharp
// (the bytes, not the file name or the browser's MIME type, decide what the
// file is), auto-rotate, strip all metadata (EXIF/GPS), cap the size, store
// WebP. Duplicates (same original bytes) return the existing media row.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_EDGE = 2400;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "gif"]);

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

export const mediaMetaSchema = z.object({
  alt: z.string().trim().max(500).default(""),
  caption: z.string().trim().max(500).default(""),
  credit: z.string().trim().max(200).default(""),
  folderId: z.uuid().nullable().optional(),
});
export type MediaMeta = z.input<typeof mediaMetaSchema>;

export const mediaUrl = (key: string) => buildMediaUrl(key);

export interface MediaDto {
  id: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  credit: string;
  folderId: string | null;
}

export interface ProcessImageOptions {
  preset?: MediaUploadPreset;
  focalX?: number;
  focalY?: number;
}

export function toMediaDto(
  media: Pick<Media, "id" | "storageKey" | "width" | "height" | "alt" | "caption" | "credit"> & {
    folderId?: string | null;
  },
): MediaDto {
  return {
    id: media.id,
    src: mediaUrl(media.storageKey),
    width: media.width ?? FEATURED_IMAGE_WIDTH,
    height: media.height ?? FEATURED_IMAGE_HEIGHT,
    alt: media.alt,
    caption: media.caption ?? "",
    credit: media.credit ?? "",
    folderId: media.folderId ?? null,
  };
}

/** Media row → the frontend's MediaAsset. Per-use alt/caption/credit win over the media defaults. */
export function toMediaAsset(media: MediaDto, override: { alt?: string; caption?: string; credit?: string } = {}): MediaAsset {
  const caption = override.caption?.trim() || media.caption.trim();
  const credit = override.credit?.trim() || media.credit.trim();
  return {
    src: media.src,
    width: media.width,
    height: media.height,
    alt: override.alt?.trim() || media.alt,
    ...(caption ? { caption } : {}),
    ...(credit ? { credit } : {}),
    fullSrc: media.src,
  };
}

/** Decodes, checks and converts an uploaded image. Throws MediaError for anything unacceptable. */
export async function processImage(
  bytes: Buffer,
  options: ProcessImageOptions = {},
): Promise<{ data: Buffer; width: number; height: number }> {
  if (bytes.length === 0) throw new MediaError("Berkas kosong.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new MediaError("Berkas lebih dari 15 MB.");
  let format: string | undefined;
  try {
    format = (await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new MediaError("Berkas bukan gambar yang bisa dibaca.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new MediaError("Format tidak didukung. Gunakan JPEG, PNG, WebP, AVIF, atau GIF.");
  }

  if (options.preset === "featured") {
    const focalX = clampFocal(options.focalX);
    const focalY = clampFocal(options.focalY);
    const { data: rawPixels, info: rawInfo } = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    })
      .rotate()
      .toColorspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const crop = computeCoverCrop(
      rawInfo.width,
      rawInfo.height,
      FEATURED_IMAGE_WIDTH,
      FEATURED_IMAGE_HEIGHT,
      focalX,
      focalY,
    );

    const { data, info } = await sharp(rawPixels, {
      raw: { width: rawInfo.width, height: rawInfo.height, channels: rawInfo.channels },
    })
      .extract(crop)
      .resize(FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT, { fit: "fill" })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });

    return { data, width: info.width, height: info.height };
  }

  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function assertFolderExists(db: PrismaClient | Prisma.TransactionClient, folderId: string | null | undefined) {
  if (!folderId) return;
  const folder = await db.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } });
  if (!folder) throw new MediaError("Folder media tidak ditemukan.");
}

export async function uploadImage(
  db: PrismaClient,
  file: { name: string; bytes: Buffer },
  meta: MediaMeta,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
  now = new Date(),
  options: ProcessImageOptions = {},
): Promise<{ media: MediaDto; duplicate: boolean }> {
  const fields = mediaMetaSchema.parse(meta);
  const featured = options.preset === "featured";
  const focalX = clampFocal(options.focalX);
  const focalY = clampFocal(options.focalY);

  const hasher = createHash("sha256").update(file.bytes);
  if (featured) hasher.update(`|featured:${FEATURED_IMAGE_WIDTH}x${FEATURED_IMAGE_HEIGHT}:${focalX}:${focalY}`);
  const sha256 = hasher.digest("hex");

  const existing = await db.media.findUnique({ where: { sha256 } });
  if (existing) return { media: toMediaDto(existing), duplicate: true };

  await assertFolderExists(db, fields.folderId);
  const processed = await processImage(file.bytes, featured ? { preset: "featured", focalX, focalY } : {});
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${now.getUTCFullYear()}/${month}/${sha256.slice(0, 16)}.webp`;
  await getMediaStorage().put(key, processed.data, "image/webp");

  let media: Media;
  try {
    media = await db.$transaction(async (tx) => {
      const created = await tx.media.create({
        data: {
          storageKey: key,
          originalName: safeOriginalName(file.name),
          mimeType: "image/webp",
          sizeBytes: processed.data.length,
          width: processed.width,
          height: processed.height,
          sha256,
          alt: fields.alt,
          caption: fields.caption || null,
          credit: fields.credit || null,
          folderId: fields.folderId ?? null,
        },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "media.upload",
        entityType: "media",
        entityId: created.id,
        summary: `Gambar diunggah: ${created.originalName}`,
        meta: {
          width: processed.width,
          height: processed.height,
          bytes: processed.data.length,
          ...(featured ? { preset: "featured", focalX, focalY } : {}),
          ...(fields.folderId ? { folderId: fields.folderId } : {}),
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return created;
    });
  } catch (error) {
    // Hapus objek orphan di storage bila DB gagal menyimpan, kecuali sudah ada baris sha256 yang sama.
    const existingAfter = await db.media.findUnique({ where: { sha256 } }).catch(() => null);
    if (!existingAfter) await getMediaStorage().remove(key).catch(() => {});
    throw error;
  }
  return { media: toMediaDto(media), duplicate: false };
}

/**
 * Generates a 1200 × 750 (16:10) featured-image crop from an existing Media Library item
 * anchored on `(focalX%, focalY%)` without mutating the original asset shared by other articles.
 */
export async function cropExistingMediaToFeatured(
  db: PrismaClient,
  sourceMediaId: string,
  focal: { focalX?: number; focalY?: number },
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
  now = new Date(),
): Promise<{ media: MediaDto; duplicate: boolean }> {
  const source = await db.media.findUnique({ where: { id: sourceMediaId } });
  if (!source) throw new MediaError("Gambar sumber tidak ditemukan.");
  const bytes = await getMediaStorage().get(source.storageKey);
  if (!bytes) throw new MediaError("Berkas gambar sumber tidak tersedia di penyimpanan.");

  return uploadImage(
    db,
    { name: source.originalName, bytes },
    {
      alt: source.alt,
      caption: source.caption ?? "",
      credit: source.credit ?? "",
      folderId: source.folderId,
    },
    actor,
    now,
    {
      preset: "featured",
      focalX: clampFocal(focal.focalX),
      focalY: clampFocal(focal.focalY),
    },
  );
}

export async function updateMediaMeta(
  db: PrismaClient,
  id: string,
  meta: MediaMeta,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<MediaDto> {
  const fields = mediaMetaSchema.parse(meta);
  if (fields.folderId) await assertFolderExists(db, fields.folderId);
  return db.$transaction(async (tx) => {
    const media = await tx.media.update({
      where: { id },
      data: {
        alt: fields.alt,
        caption: fields.caption || null,
        credit: fields.credit || null,
        ...(fields.folderId !== undefined ? { folderId: fields.folderId } : {}),
      },
    });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "media.update",
      entityType: "media",
      entityId: id,
      summary: "Keterangan gambar diubah.",
      meta: fields.folderId !== undefined ? { folderId: fields.folderId } : {},
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return toMediaDto(media);
  });
}

export type DeleteMediaResult = { ok: true; storageKey: string } | { ok: false; status: 404 | 409; error: string };

/**
 * Deletes an image: the database row first (foreign keys refuse an image that
 * is still used as a featured/OG image, in an article body or gallery, as an
 * author photo or the site's default share image), then the file. A file that
 * cannot be removed is only logged: an orphan file is harmless, a row without
 * its file is not.
 */
export async function deleteMedia(
  db: PrismaClient,
  id: string,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<DeleteMediaResult> {
  let media: Media | null;
  try {
    media = await db.$transaction(async (tx) => {
      const row = await tx.media.findUnique({ where: { id } });
      if (!row) return null;
      await tx.media.delete({ where: { id } });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "media.delete",
        entityType: "media",
        entityId: id,
        summary: `Gambar dihapus: ${row.originalName}`,
        meta: { storageKey: row.storageKey, sha256: row.sha256 },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return row;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false, status: 409, error: "Gambar masih dipakai (artikel, penulis, atau pengaturan situs). Lepaskan dulu sebelum menghapus." };
    }
    throw error;
  }
  if (!media) return { ok: false, status: 404, error: "Gambar tidak ditemukan." };
  const key = media.storageKey;
  await getMediaStorage()
    .remove(key)
    .catch((error: unknown) => console.warn(`[media] berkas ${key} tidak terhapus: ${error instanceof Error ? error.message : String(error)}`));
  return { ok: true, storageKey: key };
}

/** Original file name, for display only: no folders, no control characters. */
export function safeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "gambar";
}

export async function recentMedia(
  db: PrismaClient,
  query = "",
  limit = 30,
  folder?: string | null,
): Promise<MediaDto[]> {
  const q = query.trim().slice(0, 100);
  const conditions: Prisma.MediaWhereInput[] = [];
  if (q) {
    // Case-insensitive: the columns use the utf8mb4_unicode_ci collation.
    conditions.push({ OR: [{ alt: { contains: q } }, { caption: { contains: q } }, { originalName: { contains: q } }] });
  }
  const cleanFolder = folder?.trim() ?? "";
  if (cleanFolder === "none" || cleanFolder === "tanpa-folder") {
    conditions.push({ folderId: null });
  } else if (cleanFolder && z.uuid().safeParse(cleanFolder).success) {
    conditions.push({ folderId: cleanFolder });
  }
  const where: Prisma.MediaWhereInput = conditions.length > 0 ? { AND: conditions } : {};
  const rows = await db.media.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 60) });
  return rows.map(toMediaDto);
}

export async function mediaByIds(db: PrismaClient | Prisma.TransactionClient, ids: string[]): Promise<Map<string, MediaDto>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db.media.findMany({ where: { id: { in: unique } } });
  return new Map(rows.map((m) => [m.id, toMediaDto(m)]));
}
