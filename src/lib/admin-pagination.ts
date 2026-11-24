import { stateFilter, type StateFilter } from "@/server/articles/status";

// Pagination murni dan pembentuk tautan terpusat untuk daftar "Artikel" (/admin/artikel).
// Diadaptasi dari Busacare lib/pagination.ts dan lib/tautan-berita-admin.ts ke parameter
// URL SUMENEP (?q, ?status, ?kanal, ?rubrik, ?penulis, ?dari, ?sampai, ?urut, ?per, ?halaman)
// agar seluruh tautan masuk ke editor dan tombol "← Artikel" kembali memakai satu aturan.

export const ADMIN_ARTICLES_PATH = "/admin/artikel";
export const DEFAULT_PER_PAGE = 20;
export const PER_PAGE_OPTIONS = [10, 20, 50] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

export const ARTICLE_SORT_OPTIONS = [
  { value: "ubah", label: "Terbaru diubah" },
  { value: "terbit", label: "Terbaru terbit" },
  { value: "jadwal", label: "Jadwal terdekat" },
] as const;
export type ArticleSort = (typeof ARTICLE_SORT_OPTIONS)[number]["value"];

export const ELLIPSIS = "…";
export type PageToken = number | typeof ELLIPSIS;

const SLUG_FILTER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY_FILTER = /^\d{4}-\d{2}-\d{2}$/;

function toInt(value?: string | number | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
  const raw = (value ?? "").toString().trim();
  if (!/^-?\d{1,9}$/.test(raw)) return Number.NaN;
  return Number.parseInt(raw, 10);
}

export function parsePerPage(value?: string | number | null): PerPage {
  const n = toInt(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? (n as PerPage) : DEFAULT_PER_PAGE;
}

export function parseSort(value?: string | null): ArticleSort {
  return value === "terbit" || value === "jadwal" ? value : "ubah";
}

export function totalPages(total: number, perPage: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  if (!Number.isFinite(perPage) || perPage <= 0) return 1;
  return Math.max(1, Math.ceil(total / perPage));
}

export function clampPage(value?: string | number | null, maxPage?: number): number {
  const n = toInt(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (maxPage === undefined) return n;
  return Math.min(n, Math.max(1, maxPage));
}

export function pageOffset(page: number, perPage: number): number {
  return Math.max(0, (clampPage(page) - 1) * perPage);
}

export function pageRange(page: number, perPage: number, total: number): { from: number; to: number } {
  if (!Number.isFinite(total) || total <= 0) return { from: 0, to: 0 };
  const safePage = clampPage(page, totalPages(total, perPage));
  const from = pageOffset(safePage, perPage) + 1;
  return { from: Math.min(from, total), to: Math.min(safePage * perPage, total) };
}

export function pageNumbers(page: number, total: number, windowSize = 1): PageToken[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  if (total === 1) return [1];

  const current = clampPage(page, total);
  const keep = new Set<number>([1, total]);
  for (let p = current - windowSize; p <= current + windowSize; p += 1) {
    if (p >= 1 && p <= total) keep.add(p);
  }

  const tokens: PageToken[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (prev > 0 && p - prev > 1) tokens.push(ELLIPSIS);
    tokens.push(p);
    prev = p;
  }
  return tokens;
}

export function buildPageUrl(
  base: string,
  params: Record<string, string | number | undefined | null>,
  pageParam = "halaman",
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (key === pageParam && text === "1") continue;
    qs.set(key, text);
  }
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

export interface ArticleListUrlState {
  q: string;
  status: StateFilter;
  kanal: string;
  rubrik: string;
  penulis: string;
  dari: string;
  sampai: string;
  urut: ArticleSort;
  per: PerPage;
  halaman: number;
}

function firstParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function safeSlug(value: string): string {
  const trimmed = value.trim().toLowerCase().slice(0, 80);
  return trimmed && SLUG_FILTER.test(trimmed) ? trimmed : "";
}

function safeDay(value: string): string {
  const trimmed = value.trim();
  return trimmed && DAY_FILTER.test(trimmed) ? trimmed : "";
}

export function parseArticleListState(params: Record<string, string | string[] | undefined>): ArticleListUrlState {
  return {
    q: firstParam(params.q).trim().slice(0, 100),
    status: stateFilter(firstParam(params.status)),
    kanal: safeSlug(firstParam(params.kanal)),
    rubrik: safeSlug(firstParam(params.rubrik)),
    penulis: safeSlug(firstParam(params.penulis)),
    dari: safeDay(firstParam(params.dari)),
    sampai: safeDay(firstParam(params.sampai)),
    urut: parseSort(firstParam(params.urut)),
    per: parsePerPage(firstParam(params.per)),
    halaman: clampPage(firstParam(params.halaman)),
  };
}

export function hasActiveListFilters(state: ArticleListUrlState): boolean {
  return Boolean(
    state.q ||
      state.status !== "semua" ||
      state.kanal ||
      state.rubrik ||
      state.penulis ||
      state.dari ||
      state.sampai ||
      state.urut !== "ubah" ||
      state.per !== DEFAULT_PER_PAGE,
  );
}

export function nextArticleListState(
  current: ArticleListUrlState,
  patch: Partial<ArticleListUrlState>,
): ArticleListUrlState {
  return {
    q: patch.q ?? current.q,
    status: patch.status ?? current.status,
    kanal: patch.kanal ?? current.kanal,
    rubrik: patch.rubrik ?? current.rubrik,
    penulis: patch.penulis ?? current.penulis,
    dari: patch.dari ?? current.dari,
    sampai: patch.sampai ?? current.sampai,
    urut: patch.urut ?? current.urut,
    per: patch.per ?? current.per,
    halaman: patch.halaman ?? 1,
  };
}

function serializedListParams(state: ArticleListUrlState) {
  return {
    q: state.q || undefined,
    status: state.status === "semua" ? undefined : state.status,
    kanal: state.kanal || undefined,
    rubrik: state.rubrik || undefined,
    penulis: state.penulis || undefined,
    dari: state.dari || undefined,
    sampai: state.sampai || undefined,
    urut: state.urut === "ubah" ? undefined : state.urut,
    per: state.per === DEFAULT_PER_PAGE ? undefined : state.per,
    halaman: state.halaman > 1 ? state.halaman : undefined,
  };
}

export function articleListUrl(state: ArticleListUrlState): string {
  return buildPageUrl(ADMIN_ARTICLES_PATH, serializedListParams(state));
}

export function articleEditUrl(id: string, state: ArticleListUrlState): string {
  return buildPageUrl(`${ADMIN_ARTICLES_PATH}/${encodeURIComponent(id)}`, serializedListParams(state));
}
