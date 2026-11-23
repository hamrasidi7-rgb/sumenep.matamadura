"use server";

import { z } from "zod";

import type { ArticleFieldsInput } from "@/server/articles/fields";
import { refreshPublicArticles } from "@/server/articles/public";
import { searchPublishedForLink } from "@/server/articles/queries";
import {
  changeArticleState,
  createArticle,
  deleteArticlePermanently,
  publishArticle,
  revisionSnapshot,
  saveArticle,
  type Result,
  type StateAction,
} from "@/server/articles/service";
import { assertSameOrigin, requestMeta, requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { MediaError, updateMediaMeta, type MediaDto, type MediaMeta } from "@/server/media/service";

// Server Actions of the article CMS. Each one: Origin check (CSRF), session
// check in the database, then Zod — the service layer validates the fields
// again. Anything that changes what readers can see refreshes the public
// article cache immediately (updateTag).

const id = z.uuid();
const version = z.number().int().min(1);

async function actor() {
  await assertSameOrigin();
  const session = await requireAdmin();
  const meta = await requestMeta();
  return { adminId: session.admin.id, ip: meta.ip, userAgent: meta.userAgent };
}

const invalid = { ok: false as const, error: "Permintaan tidak valid." };

export async function createArticleAction(fields: ArticleFieldsInput) {
  return createArticle(getDb(), fields, await actor());
}

export async function saveArticleAction(articleId: string, expectedVersion: number, fields: ArticleFieldsInput, mode: "autosave" | "manual") {
  const who = await actor();
  if (!id.safeParse(articleId).success || !version.safeParse(expectedVersion).success || !["autosave", "manual"].includes(mode)) return invalid;
  const result = await saveArticle(getDb(), articleId, expectedVersion, fields, who, mode);
  // A manual save of a live article ("Perbarui") is public immediately.
  if (result.ok && mode === "manual" && (result.state === "terbit" || result.state === "terjadwal")) refreshPublicArticles();
  return result;
}

export async function publishArticleAction(articleId: string, expectedVersion: number, fields: ArticleFieldsInput, publishAt: string | null) {
  const who = await actor();
  if (!id.safeParse(articleId).success || !version.safeParse(expectedVersion).success) return invalid;
  const when = publishAt ? new Date(publishAt) : null;
  const result = await publishArticle(getDb(), articleId, expectedVersion, fields, when, who);
  if (result.ok) refreshPublicArticles();
  return result;
}

export async function changeArticleStateAction(articleId: string, expectedVersion: number, action: StateAction) {
  const who = await actor();
  if (!id.safeParse(articleId).success || !version.safeParse(expectedVersion).success) return invalid;
  if (!["unpublish", "archive", "unarchive", "trash", "restore"].includes(action)) return invalid;
  const result = await changeArticleState(getDb(), articleId, expectedVersion, action, who);
  if (result.ok) refreshPublicArticles();
  return result;
}

export async function deleteArticleAction(articleId: string) {
  const who = await actor();
  if (!id.safeParse(articleId).success) return invalid;
  const result = await deleteArticlePermanently(getDb(), articleId, who);
  if (result.ok) refreshPublicArticles();
  return result;
}

export async function searchLinkTargetsAction(query: string): Promise<{ slug: string; title: string }[]> {
  await actor();
  if (typeof query !== "string") return [];
  return searchPublishedForLink(getDb(), query);
}

export async function updateMediaMetaAction(mediaId: string, meta: MediaMeta): Promise<Result<{ media: MediaDto }>> {
  const who = await actor();
  if (!id.safeParse(mediaId).success) return invalid;
  try {
    const media = await updateMediaMeta(getDb(), mediaId, meta, who);
    refreshPublicArticles();
    return { ok: true, media };
  } catch (error) {
    if (error instanceof MediaError || error instanceof z.ZodError) return { ok: false, error: "Keterangan gambar tidak valid." };
    throw error;
  }
}

export async function revisionSnapshotAction(articleId: string, revisionId: string) {
  await actor();
  if (!id.safeParse(articleId).success || !/^\d{1,18}$/.test(revisionId)) return null;
  return revisionSnapshot(getDb(), articleId, BigInt(revisionId));
}
