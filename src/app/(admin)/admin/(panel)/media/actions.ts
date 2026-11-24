"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { refreshPublicArticles } from "@/server/articles/public";
import { assertSameOrigin, requestMeta, requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { createMediaFolder, deleteMediaFolder, renameMediaFolder } from "@/server/media/library";
import { deleteMedia, MediaError, updateMediaMeta } from "@/server/media/service";

const idSchema = z.uuid();

async function actor() {
  await assertSameOrigin();
  const session = await requireAdmin();
  const meta = await requestMeta();
  return { adminId: session.admin.id, ip: meta.ip, userAgent: meta.userAgent };
}

function revalidateMediaConsumers() {
  refreshPublicArticles();
  revalidatePath("/admin/media");
  revalidatePath("/admin/artikel");
  revalidatePath("/admin/penulis");
  revalidatePath("/admin");
}

export async function updateMediaMetaAction(
  mediaId: string,
  input: { alt: string; caption: string; credit: string; folderId: string | null },
) {
  const who = await actor();
  if (!idSchema.safeParse(mediaId).success) {
    return { ok: false as const, error: "ID media tidak valid." };
  }
  if (input.folderId !== null && !idSchema.safeParse(input.folderId).success) {
    return { ok: false as const, error: "Folder media tidak valid." };
  }
  try {
    const updated = await updateMediaMeta(getDb(), mediaId, input, who);
    revalidateMediaConsumers();
    return { ok: true as const, media: updated };
  } catch (error) {
    if (error instanceof MediaError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false as const, error: "Gambar tidak ditemukan." };
    }
    throw error;
  }
}

export async function deleteMediaAction(mediaId: string) {
  const who = await actor();
  if (!idSchema.safeParse(mediaId).success) {
    return { ok: false as const, error: "ID media tidak valid." };
  }
  const result = await deleteMedia(getDb(), mediaId, who);
  if (result.ok) {
    revalidateMediaConsumers();
    return { ok: true as const };
  }
  return { ok: false as const, error: result.error };
}

export async function createMediaFolderAction(name: string) {
  const who = await actor();
  const result = await createMediaFolder(getDb(), { name }, who);
  if (result.ok) revalidateMediaConsumers();
  return result;
}

export async function renameMediaFolderAction(folderId: string, name: string) {
  const who = await actor();
  const result = await renameMediaFolder(getDb(), folderId, { name }, who);
  if (result.ok) revalidateMediaConsumers();
  return result;
}

export async function deleteMediaFolderAction(folderId: string) {
  const who = await actor();
  const result = await deleteMediaFolder(getDb(), folderId, who);
  if (result.ok) revalidateMediaConsumers();
  return result;
}
