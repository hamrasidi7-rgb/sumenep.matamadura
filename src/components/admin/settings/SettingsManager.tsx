"use client";

import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  updateHomepageSettingsAction,
  updateSiteSettingsAction,
} from "@/app/(admin)/admin/(panel)/pengaturan/actions";
import { useMedia } from "@/components/admin/editor/MediaContext";
import { formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/server/settings/constants";
import type { CmsSettingsData } from "@/server/settings/service";

export function SettingsManager({ data }: { data: CmsSettingsData }) {
  const router = useRouter();
  const { media, pick } = useMedia();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // State Identitas & SEO Situs
  const [tagline, setTagline] = useState(data.site.tagline);
  const [description, setDescription] = useState(data.site.description);
  const [contactEmail, setContactEmail] = useState(data.site.contactEmail);
  const [defaultOgMediaId, setDefaultOgMediaId] = useState<string | null>(data.site.defaultOgMediaId);
  const [socialLinks, setSocialLinks] = useState<Record<SocialKey, string>>(data.site.socialLinks);

  // State Kurasi Beranda
  const [heroArticleId, setHeroArticleId] = useState<string>(data.homepage.heroArticleId ?? "");
  const [latestCount, setLatestCount] = useState<number>(data.homepage.latestCount);
  const [featuredIds, setFeaturedIds] = useState<string[]>(data.homepage.featuredArticleIds);
  const [addFeaturedId, setAddFeaturedId] = useState<string>("");
  const [rubrics, setRubrics] = useState<{ sectionId: string; itemCount: number }[]>(
    data.homepage.rubrics,
  );
  const [addRubricId, setAddRubricId] = useState<string>("");

  const ogMedia = defaultOgMediaId ? media[defaultOgMediaId] : undefined;
  const articleLookup = new Map(data.publishedArticles.map((a) => [a.id, a]));
  const rubricLookup = new Map(data.rubrikOptions.map((r) => [r.id, r]));

  const availableFeaturedOptions = data.publishedArticles.filter(
    (a) => !featuredIds.includes(a.id),
  );
  const availableRubricOptions = data.rubrikOptions.filter(
    (r) => !rubrics.some((band) => band.sectionId === r.id),
  );

  async function pickDefaultOg() {
    const chosen = await pick({ title: "Pilih gambar Open Graph bawaan" });
    if (chosen && chosen[0]) setDefaultOgMediaId(chosen[0].id);
  }

  function handleSaveSite(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const res = await updateSiteSettingsAction({
        tagline,
        description,
        contactEmail,
        defaultOgMediaId,
        socialLinks,
      });
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setNotice({ tone: "success", message: "Pengaturan situs & media sosial berhasil disimpan." });
      router.refresh();
    });
  }

  function handleSaveHomepage(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const res = await updateHomepageSettingsAction({
        heroArticleId: heroArticleId || null,
        latestCount,
        featuredArticleIds: featuredIds,
        rubrics,
      });
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setNotice({ tone: "success", message: "Susunan kurasi beranda berhasil disimpan." });
      router.refresh();
    });
  }

  function moveItem<T>(list: T[], idx: number, dir: -1 | 1): T[] {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return list;
    const copy = [...list];
    const [picked] = copy.splice(idx, 1);
    copy.splice(target, 0, picked);
    return copy;
  }

  return (
    <div className="space-y-6">
      {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Form 1: Identitas & Pengaturan Situs */}
        <form onSubmit={handleSaveSite} className="min-w-0 space-y-5 rounded-xl border border-line bg-paper p-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Identitas &amp; SEO Situs</h2>
            <p className="mt-1 text-xs text-muted">
              Kolom kosong otomatis kembali ke bawaan portal.{" "}
              {data.site.updatedAtIso
                ? `Terakhir diubah ${formatWib(new Date(data.site.updatedAtIso))}.`
                : "Belum pernah disesuaikan di CMS."}
            </p>
          </div>

          <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
            <label className="block text-sm font-semibold text-ink" htmlFor="site-tagline">
              Tagline portal
              <input
                id="site-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={300}
                placeholder={data.portalInfo.fallbackTagline}
                className="admin-input mt-1 w-full font-normal"
              />
            </label>

            <label className="block text-sm font-semibold text-ink" htmlFor="site-description">
              Deskripsi situs
              <textarea
                id="site-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={data.portalInfo.fallbackDescription}
                className="admin-input mt-1 w-full py-2 font-normal"
              />
            </label>

            <label className="block text-sm font-semibold text-ink" htmlFor="site-email">
              Email kontak redaksi
              <input
                id="site-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                maxLength={254}
                placeholder="redaksi@matamaduranews.com"
                className="admin-input mt-1 w-full font-normal"
              />
            </label>

            <div>
              <span className="admin-label">Gambar Open Graph bawaan</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-warm/40 p-3">
                {ogMedia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ogMedia.src}
                    alt={ogMedia.alt || "Gambar OG bawaan"}
                    className="h-14 w-24 rounded border border-line bg-warm object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-24 items-center justify-center rounded border border-dashed border-line bg-paper text-muted">
                    <ImageIcon className="size-5" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">
                    {ogMedia ? ogMedia.alt || "Gambar dipilih" : "Belum dipilih"}
                  </p>
                  <p className="text-xs text-muted">Dipakai saat halaman utama atau tautan situs dibagikan.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={pickDefaultOg} className="admin-button-quiet h-8 px-2.5 text-xs">
                    {ogMedia ? "Ganti" : "Pilih gambar"}
                  </button>
                  {defaultOgMediaId && (
                    <button
                      type="button"
                      onClick={() => setDefaultOgMediaId(null)}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 border-t border-line pt-3">
              <p className="text-sm font-semibold text-ink">Tautan media sosial (HTTPS)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {SOCIAL_PLATFORMS.map((platform) => (
                  <label key={platform.key} className="block text-xs font-semibold text-muted">
                    {platform.label}
                    <input
                      type="url"
                      value={socialLinks[platform.key]}
                      onChange={(e) =>
                        setSocialLinks({ ...socialLinks, [platform.key]: e.target.value })
                      }
                      maxLength={300}
                      placeholder={platform.placeholder}
                      className="admin-input mt-1 w-full text-sm font-normal"
                    />
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <button type="submit" disabled={pending} className="admin-button w-full sm:w-auto">
            {pending ? "Menyimpan…" : "Simpan Pengaturan Situs"}
          </button>
        </form>

        {/* Form 2: Kurasi Halaman Beranda */}
        <form onSubmit={handleSaveHomepage} className="min-w-0 space-y-5 rounded-xl border border-line bg-paper p-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Kurasi Beranda Portal</h2>
            <p className="mt-1 text-xs text-muted">
              Atur berita utama (Hero), jumlah berita terbaru (1–24), Tulisan Pilihan (maks. 12), dan pita rubrik (maks. 6).
            </p>
          </div>

          <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-semibold text-ink" htmlFor="hero-article">
                  Berita utama (Hero)
                </label>
                <Link href="/admin/hero" className="text-xs font-semibold text-brand hover:underline">
                  Kelola pencarian &amp; riwayat di Hero Utama →
                </Link>
              </div>
              <select
                id="hero-article"
                value={heroArticleId}
                onChange={(e) => setHeroArticleId(e.target.value)}
                className="admin-input mt-1 w-full font-normal"
              >
                <option value="">Otomatis (artikel terbit terbaru)</option>
                {data.publishedArticles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.title} ({article.sectionLabel})
                  </option>
                ))}
              </select>
            </div>

            <label className="block text-sm font-semibold text-ink" htmlFor="latest-count">
              Jumlah item Berita Terbaru (1–24)
              <input
                id="latest-count"
                type="number"
                min={1}
                max={24}
                value={latestCount}
                onChange={(e) => setLatestCount(Number(e.target.value) || 1)}
                className="admin-input mt-1 w-32 font-normal tabular-nums"
              />
            </label>

            {/* Tulisan Pilihan */}
            <div className="space-y-2 border-t border-line pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  Tulisan Pilihan ({featuredIds.length}/12)
                </span>
              </div>
              {featuredIds.length === 0 ? (
                <p className="text-xs text-muted">Belum ada artikel pilihan yang disematkan.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line bg-warm/30">
                  {featuredIds.map((articleId, idx) => {
                    const article = articleLookup.get(articleId);
                    return (
                      <li key={articleId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-ink">
                          {idx + 1}. {article?.title ?? articleId}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setFeaturedIds(moveItem(featuredIds, idx, -1))}
                            disabled={idx === 0}
                            aria-label="Geser pilihan ke atas"
                            className="admin-icon-button h-7 w-7 disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setFeaturedIds(moveItem(featuredIds, idx, 1))}
                            disabled={idx === featuredIds.length - 1}
                            aria-label="Geser pilihan ke bawah"
                            className="admin-icon-button h-7 w-7 disabled:opacity-30"
                          >
                            <ArrowDown className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFeaturedIds(featuredIds.filter((id) => id !== articleId))
                            }
                            aria-label="Hapus dari pilihan"
                            className="admin-icon-button h-7 w-7 text-brand-deep"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {featuredIds.length < 12 && (
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Pilih artikel untuk Tulisan Pilihan"
                    value={addFeaturedId}
                    onChange={(e) => setAddFeaturedId(e.target.value)}
                    className="admin-input min-w-0 flex-1 text-sm"
                  >
                    <option value="">— Pilih artikel terbit —</option>
                    {availableFeaturedOptions.map((article) => (
                      <option key={article.id} value={article.id}>
                        {article.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!addFeaturedId}
                    onClick={() => {
                      if (!addFeaturedId) return;
                      setFeaturedIds([...featuredIds, addFeaturedId]);
                      setAddFeaturedId("");
                    }}
                    className="admin-button-quiet shrink-0 disabled:opacity-40"
                  >
                    <Plus className="size-4" aria-hidden /> Tambah
                  </button>
                </div>
              )}
            </div>

            {/* Pita Rubrik Beranda */}
            <div className="space-y-2 border-t border-line pt-3">
              <span className="block text-sm font-semibold text-ink">
                Pita Rubrik Beranda ({rubrics.length}/6)
              </span>
              {rubrics.length === 0 ? (
                <p className="text-xs text-muted">Belum ada pita rubrik terpasang.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line bg-warm/30">
                  {rubrics.map((band, idx) => {
                    const sec = rubricLookup.get(band.sectionId);
                    return (
                      <li
                        key={band.sectionId}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                          {idx + 1}. {sec?.name ?? band.sectionId}
                        </span>
                        <label className="flex items-center gap-1.5 text-muted">
                          Item:
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={band.itemCount}
                            onChange={(e) =>
                              setRubrics(
                                rubrics.map((item, i) =>
                                  i === idx
                                    ? { ...item, itemCount: Math.max(1, Math.min(12, Number(e.target.value) || 1)) }
                                    : item,
                                ),
                              )
                            }
                            aria-label={`Jumlah artikel pita ${sec?.name ?? idx + 1}`}
                            className="admin-input h-7 w-16 px-2 text-xs tabular-nums"
                          />
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRubrics(moveItem(rubrics, idx, -1))}
                            disabled={idx === 0}
                            aria-label="Geser rubrik ke atas"
                            className="admin-icon-button h-7 w-7 disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRubrics(moveItem(rubrics, idx, 1))}
                            disabled={idx === rubrics.length - 1}
                            aria-label="Geser rubrik ke bawah"
                            className="admin-icon-button h-7 w-7 disabled:opacity-30"
                          >
                            <ArrowDown className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRubrics(rubrics.filter((item) => item.sectionId !== band.sectionId))
                            }
                            aria-label="Hapus pita rubrik"
                            className="admin-icon-button h-7 w-7 text-brand-deep"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {rubrics.length < 6 && (
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Pilih rubrik untuk beranda"
                    value={addRubricId}
                    onChange={(e) => setAddRubricId(e.target.value)}
                    className="admin-input min-w-0 flex-1 text-sm"
                  >
                    <option value="">— Pilih rubrik —</option>
                    {availableRubricOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!addRubricId}
                    onClick={() => {
                      if (!addRubricId) return;
                      setRubrics([...rubrics, { sectionId: addRubricId, itemCount: 3 }]);
                      setAddRubricId("");
                    }}
                    className="admin-button-quiet shrink-0 disabled:opacity-40"
                  >
                    <Plus className="size-4" aria-hidden /> Tambah
                  </button>
                </div>
              )}
            </div>
          </fieldset>

          <button type="submit" disabled={pending} className="admin-button w-full sm:w-auto">
            {pending ? "Menyimpan…" : "Simpan Susunan Beranda"}
          </button>
        </form>
      </div>

      {/* Ringkasan Lingkungan & Indexing Portal (Read-only) */}
      <section className="rounded-xl border border-line bg-paper p-5" aria-labelledby="env-portal">
        <h2 id="env-portal" className="font-display text-lg font-semibold text-ink">
          Konfigurasi Lingkungan Portal
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-warm/60 p-3">
            <dt className="text-xs font-semibold text-muted">Nama Portal</dt>
            <dd className="mt-0.5 font-semibold text-ink">{data.portalInfo.name}</dd>
          </div>
          <div className="rounded-lg bg-warm/60 p-3">
            <dt className="text-xs font-semibold text-muted">Alamat Dasar</dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-ink">{data.portalInfo.url}</dd>
          </div>
          <div className="rounded-lg bg-warm/60 p-3">
            <dt className="text-xs font-semibold text-muted">Status Pengindeksan Mesin Pencari</dt>
            <dd className="mt-0.5 font-semibold text-ink">{data.portalInfo.indexingLabel}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
