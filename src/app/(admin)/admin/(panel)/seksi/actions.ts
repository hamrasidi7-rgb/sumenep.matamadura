"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { refreshPublicArticles } from "@/server/articles/public";
import { assertSameOrigin, requestMeta, requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import {
  createSection,
  deleteSection,
  toggleSectionActive,
  updateSection,
  type SectionCreateInput,
  type SectionUpdateInput,
} from "@/server/sections/service";

const idSchema = z.uuid();

async function actor() {
  await assertSameOrigin();
  const session = await requireAdmin();
  const meta = await requestMeta();
  return { adminId: session.admin.id, ip: meta.ip, userAgent: meta.userAgent };
}

function revalidateSectionConsumers() {
  refreshPublicArticles();
  revalidatePath("/admin/seksi");
  revalidatePath("/admin/artikel");
  revalidatePath("/admin/artikel/baru");
  revalidatePath("/admin");
}

export async function createSectionAction(input: SectionCreateInput) {
  const who = await actor();
  const result = await createSection(getDb(), input, who);
  if (result.ok) revalidateSectionConsumers();
  return result;
}

export async function updateSectionAction(sectionId: string, input: SectionUpdateInput) {
  const who = await actor();
  if (!idSchema.safeParse(sectionId).success) return { ok: false as const, error: "ID kanal/rubrik tidak valid." };
  const result = await updateSection(getDb(), sectionId, input, who);
  if (result.ok) revalidateSectionConsumers();
  return result;
}

export async function toggleSectionAction(sectionId: string) {
  const who = await actor();
  if (!idSchema.safeParse(sectionId).success) return { ok: false as const, error: "ID kanal/rubrik tidak valid." };
  const result = await toggleSectionActive(getDb(), sectionId, who);
  if (result.ok) revalidateSectionConsumers();
  return result;
}

export async function deleteSectionAction(sectionId: string) {
  const who = await actor();
  if (!idSchema.safeParse(sectionId).success) return { ok: false as const, error: "ID kanal/rubrik tidak valid." };
  const result = await deleteSection(getDb(), sectionId, who);
  if (result.ok) revalidateSectionConsumers();
  return result;
}
