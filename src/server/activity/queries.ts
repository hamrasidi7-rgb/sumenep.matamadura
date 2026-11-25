import { ActivityActor, type ArticleStatus, Prisma, type PrismaClient } from "@prisma/client";

import { clampPage, pageOffset, totalPages } from "@/lib/admin-pagination";

// Kueri & penyaring halaman Aktivitas & Keamanan (/admin/aktivitas) untuk Fase 7.
// Mengadaptasi log aktivitas & audit keamanan Busacare untuk arsitektur
// Single-Admin SUMENEP: membaca `activity_log`, `login_attempt`, `admin_session`,
// serta `article_status_change` dengan tetap membatasi kueri paralel <= 4.

export const ADMIN_ACTIVITY_PATH = "/admin/aktivitas";
export const ACTIVITY_PER_PAGE = 30;

export type ActivityActorFilter = "semua" | ActivityActor;
export type ActivityCategoryFilter = "semua" | "article" | "media" | "author" | "section" | "auth" | "site";

export interface ActivityQuery {
  q: string;
  actor: ActivityActorFilter;
  kategori: ActivityCategoryFilter;
  dari: string;
  sampai: string;
  page: number;
}

export interface ActivityLogRow {
  id: string;
  actor: ActivityActor;
  adminName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityHref: string | null;
  summary: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface LoginAttemptRow {
  id: string;
  email: string;
  ip: string | null;
  success: boolean;
  reason: string;
  userAgent: string | null;
  createdAt: Date;
}

export interface ArticleStatusHistoryRow {
  id: string;
  fromStatus: ArticleStatus | null;
  toStatus: ArticleStatus;
  changedAt: string;
}

export interface ActivityPageData {
  query: ActivityQuery;
  stats: {
    activityLast7Days: number;
    failedLoginsLast7Days: number;
    activeSessions: number;
    filteredTotal: number;
  };
  logs: ActivityLogRow[];
  loginAttempts: LoginAttemptRow[];
  page: number;
  pages: number;
  perPage: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeDay(value: string): string {
  const clean = value.trim();
  if (!DAY_RE.test(clean)) return "";
  const parsed = new Date(`${clean}T00:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? "" : clean;
}

function wibDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`);
}

function wibDayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999+07:00`);
}

export function parseActivityQuery(raw: Record<string, string | string[] | undefined>): ActivityQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = first(raw.q).trim().slice(0, 100);
  const rawActor = first(raw.actor).trim();
  const actor: ActivityActorFilter =
    rawActor === "ADMIN" || rawActor === "CLI" || rawActor === "SYSTEM" ? rawActor : "semua";
  const rawCat = first(raw.kategori).trim();
  const kategori: ActivityCategoryFilter =
    rawCat === "article" ||
    rawCat === "media" ||
    rawCat === "author" ||
    rawCat === "section" ||
    rawCat === "auth" ||
    rawCat === "site"
      ? rawCat
      : "semua";
  const dari = safeDay(first(raw.dari));
  const sampai = safeDay(first(raw.sampai));
  const page = clampPage(first(raw.halaman));
  return { q, actor, kategori, dari, sampai, page };
}

export function buildActivityHref(
  query: Partial<ActivityQuery> & { page?: number },
  basePath = ADMIN_ACTIVITY_PATH,
): string {
  const sp = new URLSearchParams();
  if (query.q?.trim()) sp.set("q", query.q.trim());
  if (query.actor && query.actor !== "semua") sp.set("actor", query.actor);
  if (query.kategori && query.kategori !== "semua") sp.set("kategori", query.kategori);
  if (query.dari) sp.set("dari", query.dari);
  if (query.sampai) sp.set("sampai", query.sampai);
  if (query.page && query.page > 1) sp.set("halaman", String(query.page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function buildActivityWhere(query: Pick<ActivityQuery, "q" | "actor" | "kategori" | "dari" | "sampai">): Prisma.ActivityLogWhereInput {
  const and: Prisma.ActivityLogWhereInput[] = [];
  if (query.actor !== "semua") {
    and.push({ actor: query.actor });
  }
  if (query.kategori === "auth") {
    and.push({ OR: [{ action: { startsWith: "auth." } }, { action: { startsWith: "admin." } }] });
  } else if (query.kategori === "site") {
    and.push({
      OR: [
        { action: { startsWith: "site." } },
        { action: { startsWith: "homepage." } },
        { action: { startsWith: "system." } },
      ],
    });
  } else if (query.kategori !== "semua") {
    and.push({ action: { startsWith: `${query.kategori}.` } });
  }
  if (query.q) {
    and.push({
      OR: [
        { summary: { contains: query.q } },
        { action: { contains: query.q } },
        { entityId: { contains: query.q } },
        { ip: { contains: query.q } },
      ],
    });
  }
  if (query.dari || query.sampai) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dari) createdAt.gte = wibDayStart(query.dari);
    if (query.sampai) createdAt.lte = wibDayEnd(query.sampai);
    and.push({ createdAt });
  }
  return and.length > 0 ? { AND: and } : {};
}

export function resolveEntityHref(
  entityType: string | null,
  entityId: string | null,
  action: string,
): string | null {
  if (action === "article.delete") return null;
  if (entityType === "article" && entityId) return `/admin/artikel/${encodeURIComponent(entityId)}`;
  if (entityType === "author") return "/admin/penulis";
  if (entityType === "section") return "/admin/seksi";
  if (entityType === "media" || entityType === "media_folder") return "/admin/media";
  if (action.startsWith("homepage.hero.")) return "/admin/hero";
  if (entityType === "site_settings" || entityType === "homepage_settings") return "/admin/pengaturan";
  if (entityType === "admin_session" || entityType === "admin_user") return "/admin/akun";
  return null;
}

export async function listActivityLogPage(
  db: PrismaClient,
  query: ActivityQuery,
  now = new Date(),
  perPage = ACTIVITY_PER_PAGE,
): Promise<ActivityPageData> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const where = buildActivityWhere(query);

  // Wave 1: 4 kueri ringkas paralel (< connectionLimit 5)
  const [filteredTotal, activityLast7Days, failedLoginsLast7Days, activeSessions] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    db.loginAttempt.count({ where: { createdAt: { gte: sevenDaysAgo }, success: false } }),
    db.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
  ]);

  const pages = totalPages(filteredTotal, perPage);
  const safePage = clampPage(query.page, pages);

  // Wave 2: 2 kueri daftar paralel
  const [rawLogs, rawAttempts] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pageOffset(safePage, perPage),
      take: perPage,
      include: { admin: { select: { name: true } } },
    }),
    db.loginAttempt.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 15,
    }),
  ]);

  return {
    query: { ...query, page: safePage },
    stats: {
      activityLast7Days,
      failedLoginsLast7Days,
      activeSessions,
      filteredTotal,
    },
    logs: rawLogs.map((row) => ({
      id: row.id.toString(),
      actor: row.actor,
      adminName: row.admin?.name ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityHref: resolveEntityHref(row.entityType, row.entityId, row.action),
      summary: row.summary,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    })),
    loginAttempts: rawAttempts.map((a) => ({
      id: a.id.toString(),
      email: a.email,
      ip: a.ip,
      success: a.success,
      reason: a.reason,
      userAgent: a.userAgent,
      createdAt: a.createdAt,
    })),
    page: safePage,
    pages,
    perPage,
  };
}

export async function articleStatusHistory(
  db: PrismaClient,
  articleId: string,
): Promise<ArticleStatusHistoryRow[]> {
  const rows = await db.articleStatusChange.findMany({
    where: { articleId },
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    take: 30,
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    changedAt: r.changedAt.toISOString(),
  }));
}
