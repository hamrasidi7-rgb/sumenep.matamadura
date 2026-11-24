import type { Article, Prisma, PrismaClient } from "@prisma/client";

import { docMediaIds, docPlainText } from "@/lib/article-doc";
import { logActivity } from "@/server/activity-log";

import { articleFieldsSchema, bodyFacts, fieldErrors, snapshotOf, type ArticleFields, type ArticleFieldsInput } from "./fields";
import { lockArticleState, recordArticleChanged, recordArticleCreated } from "./history";
import { freeSlug, isValidSlug, slugify, slugTakenByOther } from "./slug";
import { articleState, type ArticleState } from "./status";

// Article writes. Every change after creation is guarded by optimistic
// locking: the caller sends the `version` it started from, the UPDATE only
// matches that version, and a mismatch is reported as a conflict — a newer
// save (another tab, another device) is never overwritten.
//
// Adapted from Busacare app/admin/(dashboard)/berita/actions.ts (create,
// update, autosave, delete): same rules for sanitising, slug choice and
// "autosave can never publish", with `version` instead of an updatedAt
// comparison, plus SUMENEP's archive, trash/restore and revisions.

type Tx = Prisma.TransactionClient;

export interface Actor {
  adminId: number;
  ip?: string | null;
  userAgent?: string | null;
}

export type Failure = {
  ok: false;
  error: string;
  fields?: Record<string, string>;
  /** Present when someone saved a newer version first. */
  conflict?: { version: number; updatedAt: string };
  /** Autosave refused because the article is live (save explicitly instead). */
  live?: boolean;
};
export type Success<T> = { ok: true } & T;
export type Result<T> = Success<T> | Failure;

const fail = (error: string, extra: Omit<Failure, "ok" | "error"> = {}): Failure => ({ ok: false, error, ...extra });

class Abort extends Error {
  constructor(public readonly failure: Failure) {
    super(failure.error);
  }
}

function parse(input: ArticleFieldsInput): ArticleFields | Failure {
  const parsed = articleFieldsSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fields = fieldErrors(parsed.error);
  return fail(Object.values(fields)[0] ?? "Isian tidak valid.", { fields });
}

/** References must exist and have the right kind; friendly errors instead of FK/CHECK failures. */
async function checkReferences(tx: Tx, fields: ArticleFields): Promise<void> {
  const author = await tx.author.findUnique({ where: { id: fields.authorId }, select: { id: true } });
  if (!author) throw new Abort(fail("Penulis tidak ditemukan.", { fields: { authorId: "Pilih penulis." } }));
  if (fields.kanalId) {
    const kanal = await tx.section.findUnique({ where: { id: fields.kanalId }, select: { kind: true } });
    if (kanal?.kind !== "KANAL") throw new Abort(fail("Kanal tidak valid.", { fields: { kanalId: "Pilih kanal." } }));
  }
  if (fields.rubrikId) {
    const rubrik = await tx.section.findUnique({ where: { id: fields.rubrikId }, select: { kind: true } });
    if (rubrik?.kind !== "RUBRIK") throw new Abort(fail("Rubrik tidak valid.", { fields: { rubrikId: "Pilih rubrik." } }));
  }
  const { body, gallery } = docMediaIds(fields.body);
  const wanted = [...new Set([...body, ...gallery, fields.heroMediaId, fields.ogMediaId].filter((v): v is string => Boolean(v)))];
  if (wanted.length) {
    const found = await tx.media.count({ where: { id: { in: wanted } } });
    if (found !== wanted.length) throw new Abort(fail("Ada gambar yang tidak ditemukan lagi. Pilih ulang gambarnya."));
  }
}

/** article_media mirrors the media used inside the body, so used media cannot be deleted. */
async function syncMediaUsage(tx: Tx, articleId: string, fields: ArticleFields): Promise<void> {
  const { body, gallery } = docMediaIds(fields.body);
  await tx.articleMedia.deleteMany({ where: { articleId } });
  const rows = [
    ...body.map((mediaId) => ({ articleId, mediaId, usage: "BODY" as const, position: 0 })),
    ...gallery.map((mediaId, position) => ({ articleId, mediaId, usage: "GALLERY" as const, position })),
  ];
  if (rows.length) await tx.articleMedia.createMany({ data: rows });
}

function columns(fields: ArticleFields) {
  return {
    title: fields.title,
    standfirst: fields.standfirst,
    template: fields.template,
    body: fields.body as unknown as Prisma.InputJsonValue,
    ...bodyFacts(fields.body),
    authorId: fields.authorId,
    kanalId: fields.kanalId,
    rubrikId: fields.rubrikId,
    heroMediaId: fields.heroMediaId,
    tags: fields.tags,
    seoTitle: fields.seoTitle,
    seoDescription: fields.seoDescription,
    canonicalUrl: fields.canonicalUrl,
    ogMediaId: fields.ogMediaId,
    hideFromHomepage: fields.hideFromHomepage,
  };
}

async function run<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Abort) return error.failure;
    throw error;
  }
}

async function load(tx: Tx, id: string): Promise<Article> {
  const article = await tx.article.findUnique({ where: { id } });
  if (!article) throw new Abort(fail("Artikel tidak ditemukan. Mungkin sudah dihapus permanen."));
  return article;
}

/**
 * UPDATE … WHERE version = expected; returns the new version or aborts with a
 * conflict. Records slug and status history in the same transaction (the
 * PostgreSQL version did this with triggers, see ./history.ts).
 */
async function bump(tx: Tx, id: string, expected: number, data: Prisma.ArticleUncheckedUpdateManyInput): Promise<number> {
  const before = await lockArticleState(tx, id);
  const { count } = await tx.article.updateMany({ where: { id, version: expected }, data: { ...data, version: { increment: 1 } } });
  if (count === 1 && before) {
    await recordArticleChanged(tx, id, before, {
      slug: typeof data.slug === "string" ? data.slug : before.slug,
      status: typeof data.status === "string" ? data.status : before.status,
    });
  }
  if (count === 0) {
    const current = await tx.article.findUnique({ where: { id }, select: { version: true, updatedAt: true } });
    if (!current) throw new Abort(fail("Artikel tidak ditemukan. Mungkin sudah dihapus permanen."));
    throw new Abort(
      fail("Artikel ini sudah disimpan dari tempat lain (tab atau perangkat lain) sejak Anda membukanya.", {
        conflict: { version: current.version, updatedAt: current.updatedAt.toISOString() },
      }),
    );
  }
  return expected + 1;
}

/** Slug the article should have after this save. Explicit slugs must be valid and free. */
async function chooseSlug(tx: Tx, article: Pick<Article, "id" | "slug"> | null, requested: string, title: string): Promise<string> {
  if (!requested) return article ? article.slug : freeSlug(tx, title);
  const slug = slugify(requested);
  if (article && slug === article.slug) return slug;
  if (!isValidSlug(slug)) throw new Abort(fail("Slug tidak valid.", { fields: { slug: "Huruf kecil, angka, dan tanda hubung; maks. 120 karakter." } }));
  if (await slugTakenByOther(tx, slug, article?.id)) {
    throw new Abort(fail("Slug sudah dipakai artikel lain (atau masih dialihkan ke artikel lain).", { fields: { slug: "Pilih slug lain." } }));
  }
  return slug;
}

async function revision(tx: Tx, articleId: string, reason: "MANUAL_SAVE" | "PUBLISH" | "RESTORE") {
  const article = await tx.article.findUniqueOrThrow({ where: { id: articleId } });
  await tx.articleRevision.create({
    data: { articleId, version: article.version, reason, snapshot: snapshotOf(article) as Prisma.InputJsonValue },
  });
}

function log(tx: Tx, actor: Actor, action: string, article: { id: string; title: string }, meta: Prisma.InputJsonObject = {}) {
  return logActivity(tx, {
    actor: "ADMIN",
    adminId: actor.adminId,
    action,
    entityType: "article",
    entityId: article.id,
    summary: article.title.slice(0, 160),
    meta,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}

// ─── Create & save ───────────────────────────────────────────────────────────

export async function createArticle(db: PrismaClient, input: ArticleFieldsInput, actor: Actor): Promise<Result<{ id: string; version: number; slug: string }>> {
  const fields = parse(input);
  if ("ok" in fields) return fields;
  return run(() =>
    db.$transaction(async (tx) => {
      await checkReferences(tx, fields);
      const slug = await chooseSlug(tx, null, fields.slug, fields.title);
      const article = await tx.article.create({ data: { ...columns(fields), slug, status: "DRAFT" } });
      await recordArticleCreated(tx, article);
      await syncMediaUsage(tx, article.id, fields);
      await log(tx, actor, "article.create", article);
      return { ok: true as const, id: article.id, version: article.version, slug };
    }),
  );
}

/**
 * Autosave or manual save of the editable fields. Never changes the
 * publication state. Autosave is refused for a live (PUBLISHED) article: its
 * changes must be saved on purpose ("Perbarui"), or they would go public
 * half-written while the Admin is still typing.
 */
export async function saveArticle(
  db: PrismaClient,
  id: string,
  version: number,
  input: ArticleFieldsInput,
  actor: Actor,
  mode: "autosave" | "manual",
): Promise<Result<{ version: number; slug: string; updatedAt: string; state: ArticleState }>> {
  const fields = parse(input);
  if ("ok" in fields) return fields;
  return run(() =>
    db.$transaction(async (tx) => {
      const article = await load(tx, id);
      if (article.deletedAt) return fail("Artikel ada di tempat sampah. Pulihkan dulu sebelum menyunting.");
      if (mode === "autosave" && article.status === "PUBLISHED") {
        return fail("Artikel sudah terbit atau terjadwal: simpan perubahan dengan tombol Perbarui.", { live: true });
      }
      await checkReferences(tx, fields);
      const slug = await chooseSlug(tx, article, fields.slug, fields.title);
      const next = await bump(tx, id, version, { ...columns(fields), slug });
      // Slugs of an article that was never public are not URLs anyone knows:
      // no redirect history for them (it would only block those slugs).
      if (slug !== article.slug && !article.publishedAt) await tx.articleSlugHistory.deleteMany({ where: { articleId: id } });
      await syncMediaUsage(tx, id, fields);
      if (mode === "manual") {
        await revision(tx, id, "MANUAL_SAVE");
        await log(tx, actor, article.status === "PUBLISHED" ? "article.update" : "article.save", { id, title: fields.title }, slug !== article.slug ? { slugFrom: article.slug, slugTo: slug } : {});
      }
      const saved = await tx.article.findUniqueOrThrow({ where: { id }, select: { updatedAt: true, status: true, publishedAt: true, deletedAt: true } });
      return { ok: true as const, version: next, slug, updatedAt: saved.updatedAt.toISOString(), state: articleState(saved) };
    }),
  );
}

// ─── Publish & state changes ────────────────────────────────────────────────

export function publishProblems(fields: ArticleFields): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!fields.standfirst) problems.standfirst = "Lead wajib diisi sebelum terbit.";
  if (!fields.heroMediaId) problems.heroMediaId = "Gambar utama wajib dipilih sebelum terbit.";
  if (!fields.kanalId && !fields.rubrikId) problems.kanalId = "Pilih kanal atau rubrik.";
  const hasContent = docPlainText(fields.body).length > 0 || (fields.body.content ?? []).some((n) => n.type !== "paragraph");
  if (!hasContent) problems.body = "Isi artikel masih kosong.";
  return problems;
}

/** Publish now (publishAt empty / in the past) or schedule (publishAt in the future). */
export async function publishArticle(
  db: PrismaClient,
  id: string,
  version: number,
  input: ArticleFieldsInput,
  publishAt: Date | null,
  actor: Actor,
  now = new Date(),
): Promise<Result<{ version: number; slug: string; publishedAt: string; state: ArticleState }>> {
  const fields = parse(input);
  if ("ok" in fields) return fields;
  const problems = publishProblems(fields);
  if (Object.keys(problems).length) return fail(Object.values(problems)[0], { fields: problems });
  if (publishAt && Number.isNaN(publishAt.getTime())) return fail("Tanggal terbit tidak valid.", { fields: { publishedAt: "Tanggal tidak valid." } });
  return run(() =>
    db.$transaction(async (tx) => {
      const article = await load(tx, id);
      if (article.deletedAt) return fail("Artikel ada di tempat sampah. Pulihkan dulu.");
      await checkReferences(tx, fields);
      const slug = await chooseSlug(tx, article, fields.slug, fields.title);
      const publishedAt = publishAt ?? now;
      const next = await bump(tx, id, version, { ...columns(fields), slug, status: "PUBLISHED", publishedAt, archivedAt: null });
      if (slug !== article.slug && !article.publishedAt) await tx.articleSlugHistory.deleteMany({ where: { articleId: id } });
      await syncMediaUsage(tx, id, fields);
      await revision(tx, id, "PUBLISH");
      const scheduled = publishedAt > now;
      await log(tx, actor, scheduled ? "article.schedule" : "article.publish", { id, title: fields.title }, { publishedAt: publishedAt.toISOString() });
      return { ok: true as const, version: next, slug, publishedAt: publishedAt.toISOString(), state: scheduled ? ("terjadwal" as const) : ("terbit" as const) };
    }),
  );
}

export type StateAction = "unpublish" | "archive" | "unarchive" | "trash" | "restore";

const ACTION_LOG: Record<StateAction, string> = {
  unpublish: "article.unpublish",
  archive: "article.archive",
  unarchive: "article.unarchive",
  trash: "article.trash",
  restore: "article.restore",
};

export async function changeArticleState(
  db: PrismaClient,
  id: string,
  version: number,
  action: StateAction,
  actor: Actor,
  now = new Date(),
): Promise<Result<{ version: number; state: ArticleState }>> {
  return run(() =>
    db.$transaction(async (tx) => {
      const article = await load(tx, id);
      let data: Prisma.ArticleUncheckedUpdateManyInput;
      switch (action) {
        case "unpublish":
          if (article.status !== "PUBLISHED" || article.deletedAt) return fail("Hanya artikel terbit atau terjadwal yang bisa ditarik.");
          data = { status: "DRAFT" };
          break;
        case "archive":
          if (article.status === "ARCHIVED" || article.deletedAt) return fail("Artikel ini tidak bisa diarsipkan.");
          data = { status: "ARCHIVED", archivedAt: now };
          break;
        case "unarchive":
          if (article.status !== "ARCHIVED" || article.deletedAt) return fail("Artikel ini tidak sedang diarsipkan.");
          data = { status: "DRAFT", archivedAt: null };
          break;
        case "trash":
          if (article.deletedAt) return fail("Artikel sudah ada di tempat sampah.");
          data = { deletedAt: now };
          break;
        case "restore":
          if (!article.deletedAt) return fail("Artikel tidak ada di tempat sampah.");
          data = { deletedAt: null };
          break;
        default:
          return fail("Aksi tidak dikenal.");
      }
      const next = await bump(tx, id, version, data);
      await log(tx, actor, ACTION_LOG[action], article);
      const after = await tx.article.findUniqueOrThrow({ where: { id }, select: { status: true, publishedAt: true, deletedAt: true } });
      return { ok: true as const, version: next, state: articleState(after, now) };
    }),
  );
}

/** Permanent delete — only from the trash. Revisions, history and media usage go with it. */
export async function deleteArticlePermanently(db: PrismaClient, id: string, actor: Actor): Promise<Result<{ slug: string }>> {
  return run(() =>
    db.$transaction(async (tx) => {
      const article = await load(tx, id);
      if (!article.deletedAt) return fail("Pindahkan ke tempat sampah dulu sebelum menghapus permanen.");
      await tx.article.delete({ where: { id } });
      await log(tx, actor, "article.delete", article, { slug: article.slug });
      return { ok: true as const, slug: article.slug };
    }),
  );
}

export function revisionList(db: PrismaClient, articleId: string) {
  return db.articleRevision.findMany({
    where: { articleId },
    orderBy: { id: "desc" },
    take: 20,
    select: { id: true, version: true, reason: true, createdAt: true },
  });
}

export async function revisionSnapshot(db: PrismaClient, articleId: string, revisionId: bigint) {
  const row = await db.articleRevision.findFirst({ where: { id: revisionId, articleId }, select: { snapshot: true, version: true, createdAt: true } });
  return row ? { snapshot: row.snapshot as Record<string, unknown>, version: row.version, createdAt: row.createdAt.toISOString() } : null;
}
