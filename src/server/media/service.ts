import { createHash } from "node:crypto";

import type { Media, Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";

import type { MediaAsset } from "@/content/types";
import { logActivity } from "@/server/activity-log";

import { buildMediaUrl, getMediaStorage } from "./storage";

// Image upload for the CMS (Fase 4 minimum: upload + recent list; the full
// Media Library — folders, search, delete — is Fase 6).
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
}

export function toMediaDto(media: Pick<Media, "id" | "storageKey" | "width" | "height" | "alt" | "caption" | "credit">): MediaDto {
  return {
    id: media.id,
    src: mediaUrl(media.storageKey),
    width: media.width ?? 1200,
    height: media.height ?? 800,
    alt: media.alt,
    caption: media.caption ?? "",
    credit: media.credit ?? "",
  };
}

/** Media row → the frontend's MediaAsset. Per-use alt/caption win over the media defaults. */
export function toMediaAsset(media: MediaDto, override: { alt?: string; caption?: string } = {}): MediaAsset {
  const caption = override.caption?.trim() || media.caption.trim();
  return {
    src: media.src,
    width: media.width,
    height: media.height,
    alt: override.alt?.trim() || media.alt,
    ...(caption ? { caption } : {}),
    ...(media.credit ? { credit: media.credit } : {}),
    fullSrc: media.src,
  };
}

/** Decodes, checks and converts an uploaded image. Throws MediaError for anything unacceptable. */
export async function processImage(bytes: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
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
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function uploadImage(
  db: PrismaClient,
  file: { name: string; bytes: Buffer },
  meta: MediaMeta,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
  now = new Date(),
): Promise<{ media: MediaDto; duplicate: boolean }> {
  const fields = mediaMetaSchema.parse(meta);
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const existing = await db.media.findUnique({ where: { sha256 } });
  if (existing) return { media: toMediaDto(existing), duplicate: true };

  const processed = await processImage(file.bytes);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${now.getUTCFullYear()}/${month}/${sha256.slice(0, 16)}.webp`;
  await getMediaStorage().put(key, processed.data, "image/webp");

  let media: Media;
  try {
    media = await db.$transaction(async (tx) => {
      const created = await tx.media.create({
        data: {
          storageKey: key,
          originalName: file.name.slice(0, 200) || "gambar",
          mimeType: "image/webp",
          sizeBytes: processed.data.length,
          width: processed.width,
          height: processed.height,
          sha256,
          alt: fields.alt,
          caption: fields.caption || null,
          credit: fields.credit || null,
        },
      });
      await logActivity(tx, {
        actor: "ADMIN",
        adminId: actor.adminId,
        action: "media.upload",
        entityType: "media",
        entityId: created.id,
        summary: `Gambar diunggah: ${created.originalName}`,
        meta: { width: processed.width, height: processed.height, bytes: processed.data.length },
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

export async function updateMediaMeta(
  db: PrismaClient,
  id: string,
  meta: MediaMeta,
  actor: { adminId: number; ip?: string | null; userAgent?: string | null },
): Promise<MediaDto> {
  const fields = mediaMetaSchema.parse(meta);
  return db.$transaction(async (tx) => {
    const media = await tx.media.update({
      where: { id },
      data: { alt: fields.alt, caption: fields.caption || null, credit: fields.credit || null },
    });
    await logActivity(tx, {
      actor: "ADMIN",
      adminId: actor.adminId,
      action: "media.update",
      entityType: "media",
      entityId: id,
      summary: "Keterangan gambar diubah.",
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return toMediaDto(media);
  });
}

export async function recentMedia(db: PrismaClient, query = "", limit = 30): Promise<MediaDto[]> {
  const q = query.trim().slice(0, 100);
  const where: Prisma.MediaWhereInput = q
    ? { OR: [{ alt: { contains: q, mode: "insensitive" } }, { caption: { contains: q, mode: "insensitive" } }, { originalName: { contains: q, mode: "insensitive" } }] }
    : {};
  const rows = await db.media.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 60) });
  return rows.map(toMediaDto);
}

export async function mediaByIds(db: PrismaClient | Prisma.TransactionClient, ids: string[]): Promise<Map<string, MediaDto>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db.media.findMany({ where: { id: { in: unique } } });
  return new Map(rows.map((m) => [m.id, toMediaDto(m)]));
}
