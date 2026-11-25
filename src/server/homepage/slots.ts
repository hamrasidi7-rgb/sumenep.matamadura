import type { ArticleTemplate, Section } from "@/content/types";
import type { ArticleView } from "@/lib/content";

// Logika murni (tanpa I/O / database) untuk penyusunan slot beranda editorial
// SUMENEP dan penguraian metadata riwayat Hero Utama. Dipisah agar seluruh
// aturan penempatan konten dapat diuji secara deterministik lewat unit test.

export const CATATAN_SUMENEP_SLUG = "catatan-sumenep";
export const DEFAULT_LATEST_COUNT = 4;
export const MAX_AUTO_FEATURED = 3;

export interface HomepageSlotArticle {
  id: string;
  slug: string;
  kanalSlug: string | null;
  rubrikId: string | null;
  rubrikSlug: string | null;
  template: ArticleTemplate;
  view: ArticleView;
}

export interface HomepageRubricConfig {
  section: Section & { id: string };
  itemCount: number;
}

export interface HomepageRubricBand {
  section: Section;
  articles: ArticleView[];
}

export interface ResolveHomepageSlotsInput {
  configuredHeroId: string | null;
  featuredIds: readonly string[];
  rubricConfigs: readonly HomepageRubricConfig[];
  latestCount: number;
  /** Sudah tersaring oleh eligibleHeroWhere(now) dan terurut publishedAt DESC. */
  eligibleArticles: readonly HomepageSlotArticle[];
}

export interface ResolvedHomepageSlots {
  hero: ArticleView;
  heroArticleId: string;
  heroMode: "manual" | "auto";
  featured: ArticleView[];
  /** Artikel non-Hero milik rubrik Catatan Sumenep (jika terpasang di homepage_rubric). */
  catatanArticles: ArticleView[];
  /** Pita rubrik beranda lain selain Catatan Sumenep yang memiliki minimal 1 artikel non-Hero. */
  rubricBands: HomepageRubricBand[];
  /** Alur berita reguler (tanpa rubrik, template standard), tidak memaksa konten rubrik/feature masuk. */
  latest: ArticleView[];
}

export function clampLatestCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_LATEST_COUNT;
  return Math.max(1, Math.min(24, Math.floor(count)));
}

/**
 * Menempatkan artikel publik yang layak ke kelompok editorial homepage:
 * 1. Hero Utama (1 konten aktif, manual atau otomatis artikel terbaru).
 * 2. Tulisan Pilihan (kurasi homepage_featured; bila kosong, fallback editorial feature/spotlight non-rubrik).
 * 3. Kelompok Rubrik (Catatan Sumenep + pita rubrik lain di homepage_rubric, mis. Opini, Suara Kepulauan).
 * 4. Alur Berita / Artikel Terbaru (khusus berita reguler tanpa rubrik & template standard).
 *
 * Saat Hero diganti, artikel sebelumnya tidak lagi masuk usedIds Hero sehingga
 * otomatis kembali ke kelompok kategori/rubrik aslinya tanpa duplikasi dan
 * tanpa memaksa konten rubrik/feature masuk ke Artikel Terbaru.
 */
export function resolveHomepageSlots(input: ResolveHomepageSlotsInput): ResolvedHomepageSlots | null {
  const { configuredHeroId, featuredIds, rubricConfigs, eligibleArticles } = input;
  if (eligibleArticles.length === 0) return null;

  const byId = new Map(eligibleArticles.map((item) => [item.id, item]));
  const configuredHero = configuredHeroId ? byId.get(configuredHeroId) : undefined;
  const heroItem = configuredHero ?? eligibleArticles[0];
  const heroMode: "manual" | "auto" = configuredHero ? "manual" : "auto";

  const usedIds = new Set<string>([heroItem.id]);

  // 2. Tulisan Pilihan: patuhi urutan kurasi homepage_featured terlebih dulu.
  const featuredItems: HomepageSlotArticle[] = [];
  if (featuredIds.length > 0) {
    for (const id of featuredIds) {
      if (usedIds.has(id)) continue;
      const match = byId.get(id);
      if (!match) continue;
      featuredItems.push(match);
      usedIds.add(match.id);
    }
  } else {
    // Bila redaksi belum menyematkan Tulisan Pilihan secara manual, tampilkan
    // artikel feature/spotlight non-rubrik agar konten Feature tetap kembali ke
    // kelompok editorialnya dan tidak tercampur ke alur berita reguler.
    for (const item of eligibleArticles) {
      if (featuredItems.length >= MAX_AUTO_FEATURED) break;
      if (usedIds.has(item.id)) continue;
      if (item.rubrikId !== null) continue;
      if (item.template !== "feature" && item.template !== "spotlight") continue;
      featuredItems.push(item);
      usedIds.add(item.id);
    }
  }

  // 3. Kelompok Rubrik (Catatan Sumenep & pita rubrik lain dari homepage_rubric).
  let catatanArticles: ArticleView[] = [];
  const rubricBands: HomepageRubricBand[] = [];

  for (const config of rubricConfigs) {
    const limit = Math.max(1, Math.min(12, Math.floor(config.itemCount) || 3));
    const picked: HomepageSlotArticle[] = [];
    for (const item of eligibleArticles) {
      if (picked.length >= limit) break;
      if (usedIds.has(item.id)) continue;
      if (item.rubrikId !== config.section.id) continue;
      picked.push(item);
      usedIds.add(item.id);
    }
    const views = picked.map((p) => p.view);
    if (config.section.slug === CATATAN_SUMENEP_SLUG) {
      catatanArticles = views;
    } else if (views.length > 0) {
      rubricBands.push({
        section: {
          slug: config.section.slug,
          kind: config.section.kind,
          name: config.section.name,
          description: config.section.description,
        },
        articles: views,
      });
    }
  }

  // 4. Alur Berita / Artikel Terbaru: hanya berita reguler (tanpa rubrik & template standard).
  // Artikel rubrik (Catatan Sumenep, Opini, Suara Kepulauan, dll.) dan Feature
  // tidak dipaksa masuk ke alur berita ini.
  const latestLimit = clampLatestCount(input.latestCount);
  const latestItems: HomepageSlotArticle[] = [];
  for (const item of eligibleArticles) {
    if (latestItems.length >= latestLimit) break;
    if (usedIds.has(item.id)) continue;
    if (item.rubrikId !== null) continue;
    if (item.template !== "standard") continue;
    latestItems.push(item);
    usedIds.add(item.id);
  }

  return {
    hero: heroItem.view,
    heroArticleId: heroItem.id,
    heroMode,
    featured: featuredItems.map((item) => item.view),
    catatanArticles,
    rubricBands,
    latest: latestItems.map((item) => item.view),
  };
}

export interface HeroHistoryMeta {
  source: "admin-hero" | "admin-settings";
  heroArticleId: string | null;
  heroTitle: string | null;
  heroSlug: string | null;
  heroSection: string | null;
  heroTemplate: string | null;
  previousHeroArticleId: string | null;
  previousHeroTitle: string | null;
  previousHeroSlug: string | null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseHeroHistoryMeta(raw: unknown): HeroHistoryMeta {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const source = obj.source === "admin-settings" ? "admin-settings" : "admin-hero";
  return {
    source,
    heroArticleId: asNullableString(obj.heroArticleId),
    heroTitle: asNullableString(obj.heroTitle),
    heroSlug: asNullableString(obj.heroSlug),
    heroSection: asNullableString(obj.heroSection),
    heroTemplate: asNullableString(obj.heroTemplate),
    previousHeroArticleId: asNullableString(obj.previousHeroArticleId),
    previousHeroTitle: asNullableString(obj.previousHeroTitle),
    previousHeroSlug: asNullableString(obj.previousHeroSlug),
  };
}

const TEMPLATE_LABELS: Record<string, string> = {
  STANDARD: "Berita",
  standard: "Berita",
  FEATURE: "Feature",
  feature: "Feature",
  SPOTLIGHT: "Spotlight",
  spotlight: "Spotlight",
};

export function templateEditorialLabel(template: string | null | undefined): string {
  if (!template) return "Berita";
  return TEMPLATE_LABELS[template] ?? template;
}
