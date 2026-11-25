"use server";

import { revalidatePath } from "next/cache";

import { refreshPublicArticles } from "@/server/articles/public";
import { assertSameOrigin, requestMeta, requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import {
  updateHomepageSettings,
  updateSiteSettings,
  type HomepageSettingsFormInput,
  type SiteSettingsFormInput,
} from "@/server/settings/service";

async function actor() {
  await assertSameOrigin();
  const session = await requireAdmin();
  const meta = await requestMeta();
  return { adminId: session.admin.id, ip: meta.ip, userAgent: meta.userAgent };
}

function revalidateSettingsConsumers() {
  refreshPublicArticles();
  revalidatePath("/");
  revalidatePath("/admin/hero");
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/artikel");
  revalidatePath("/admin");
}

export async function updateSiteSettingsAction(input: SiteSettingsFormInput) {
  const who = await actor();
  const result = await updateSiteSettings(getDb(), input, who);
  if (result.ok) revalidateSettingsConsumers();
  return result;
}

export async function updateHomepageSettingsAction(input: HomepageSettingsFormInput) {
  const who = await actor();
  const result = await updateHomepageSettings(getDb(), input, who);
  if (result.ok) revalidateSettingsConsumers();
  return result;
}
