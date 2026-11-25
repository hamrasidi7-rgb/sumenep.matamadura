import { clampPage } from "@/lib/admin-pagination";

// Konstanta & helper URL murni untuk Modul Hero Utama — aman diimpor oleh
// komponen klien (`HeroManager.tsx`) maupun layanan server (`hero.ts`).

export const ADMIN_HERO_PATH = "/admin/hero";
export const HERO_SET_ACTION = "homepage.hero.set";
export const HERO_CLEAR_ACTION = "homepage.hero.clear";
export const HERO_HISTORY_ACTIONS = [HERO_SET_ACTION, HERO_CLEAR_ACTION] as const;
export const HERO_CANDIDATES_PER_PAGE = 12;
export const HERO_HISTORY_LIMIT = 25;

export type HeroTemplateValue = "STANDARD" | "FEATURE" | "SPOTLIGHT";
export type HeroTemplateFilter = "semua" | HeroTemplateValue;

export interface HeroListFilters {
  q: string;
  kanal: string;
  rubrik: string;
  template: HeroTemplateFilter;
  page: number;
}

export function parseHeroFilters(raw: Record<string, string | string[] | undefined>): HeroListFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = first(raw.q).trim().slice(0, 100);
  const kanal = first(raw.kanal).trim().slice(0, 120);
  const rubrik = first(raw.rubrik).trim().slice(0, 120);
  const rawTemplate = first(raw.template).trim().toUpperCase();
  const template: HeroTemplateFilter =
    rawTemplate === "STANDARD" || rawTemplate === "FEATURE" || rawTemplate === "SPOTLIGHT"
      ? rawTemplate
      : "semua";
  const page = clampPage(first(raw.halaman));
  return { q, kanal, rubrik, template, page };
}

export function buildHeroAdminHref(filters: Partial<HeroListFilters>, basePath = ADMIN_HERO_PATH): string {
  const sp = new URLSearchParams();
  if (filters.q?.trim()) sp.set("q", filters.q.trim());
  if (filters.kanal?.trim()) sp.set("kanal", filters.kanal.trim());
  if (filters.rubrik?.trim()) sp.set("rubrik", filters.rubrik.trim());
  if (filters.template && filters.template !== "semua") sp.set("template", filters.template);
  if (filters.page && filters.page > 1) sp.set("halaman", String(filters.page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
