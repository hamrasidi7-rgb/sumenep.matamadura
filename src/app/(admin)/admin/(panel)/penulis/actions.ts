"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { refreshPublicArticles } from "@/server/articles/public";
import { assertSameOrigin, requestMeta, requireAdmin } from "@/server/auth/next";
import {
  createAuthor,
  deleteAuthor,
  toggleAuthorActive,
  updateAuthor,
  type AuthorFormInput,
} from "@/server/authors/service";
import { getDb } from "@/server/db";

const idSchema = z.uuid();

async function actor() {
  await assertSameOrigin();
  const session = await requireAdmin();
  const meta = await requestMeta();
  return { adminId: session.admin.id, ip: meta.ip, userAgent: meta.userAgent };
}

function revalidateAuthorConsumers() {
  refreshPublicArticles();
  revalidatePath("/penulis/[slug]", "page");
  revalidatePath("/artikel/[slug]", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/penulis");
  revalidatePath("/admin/artikel");
  revalidatePath("/admin/artikel/baru");
  revalidatePath("/admin");
}

export async function createAuthorAction(input: AuthorFormInput) {
  const who = await actor();
  const result = await createAuthor(getDb(), input, who);
  if (result.ok) revalidateAuthorConsumers();
  return result;
}

export async function updateAuthorAction(authorId: string, input: AuthorFormInput) {
  const who = await actor();
  if (!idSchema.safeParse(authorId).success) return { ok: false as const, error: "ID penulis tidak valid." };
  const result = await updateAuthor(getDb(), authorId, input, who);
  if (result.ok) revalidateAuthorConsumers();
  return result;
}

export async function toggleAuthorAction(authorId: string) {
  const who = await actor();
  if (!idSchema.safeParse(authorId).success) return { ok: false as const, error: "ID penulis tidak valid." };
  const result = await toggleAuthorActive(getDb(), authorId, who);
  if (result.ok) revalidateAuthorConsumers();
  return result;
}

export async function deleteAuthorAction(authorId: string) {
  const who = await actor();
  if (!idSchema.safeParse(authorId).success) return { ok: false as const, error: "ID penulis tidak valid." };
  const result = await deleteAuthor(getDb(), authorId, who);
  if (result.ok) revalidateAuthorConsumers();
  return result;
}
