"use server";

import { revalidatePath } from "next/cache";

import { refreshPublicArticles } from "@/server/articles/public";
import { assertSameOrigin, requestMeta, requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { clearHomepageHero, setHomepageHero, type HeroMutationResult } from "@/server/homepage/hero";

async function actor() {
  await assertSameOrigin();
  const session = await requireAdmin();
  const meta = await requestMeta();
  return { adminId: session.admin.id, ip: meta.ip, userAgent: meta.userAgent };
}

function revalidateHeroConsumers() {
  refreshPublicArticles();
  revalidatePath("/");
  revalidatePath("/terbaru");
  revalidatePath("/pilihan");
  revalidatePath("/admin/hero");
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/artikel");
  revalidatePath("/admin");
}

export async function setHeroArticleAction(articleId: string): Promise<HeroMutationResult> {
  const who = await actor();
  const result = await setHomepageHero(getDb(), articleId, who);
  if (result.ok) revalidateHeroConsumers();
  return result;
}

export async function clearHeroArticleAction(): Promise<HeroMutationResult> {
  const who = await actor();
  const result = await clearHomepageHero(getDb(), who);
  if (result.ok) revalidateHeroConsumers();
  return result;
}
