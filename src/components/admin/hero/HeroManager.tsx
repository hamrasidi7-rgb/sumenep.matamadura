"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  History,
  ImageIcon,
  RotateCcw,
  Search,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { clearHeroArticleAction, setHeroArticleAction } from "@/app/(admin)/admin/(panel)/hero/actions";
import { formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import { PaginationNav } from "@/components/admin/PaginationNav";
import { ADMIN_HERO_PATH, buildHeroAdminHref, HERO_SET_ACTION } from "@/server/homepage/constants";
import type { HeroArticleCard, HeroManagerData } from "@/server/homepage/hero";

const TEMPLATE_FILTER_OPTIONS = [
  { value: "semua", label: "Semua format" },
  { value: "STANDARD", label: "Berita (Standar)" },
  { value: "FEATURE", label: "Feature" },
  { value: "SPOTLIGHT", label: "Spotlight" },
] as const;

export function HeroManager({ data }: { data: HeroManagerData }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const { active, candidates, filters, filterOptions, history } = data;
  const hasFilters = Boolean(filters.q || filters.kanal || filters.rubrik || filters.template !== "semua");

  function handleSelectHero(article: { id: string; title: string }, fromHistory = false) {
    const replacingTitle =
      active.configuredArticle && active.configuredArticle.id !== article.id
        ? active.configuredArticle.title
        : null;
    const confirmText = replacingTitle
      ? `Jadikan "${article.title}" sebagai Hero Utama?\n\nKonten sebelumnya ("${replacingTitle}") akan otomatis kembali ke kelompok kategori/rubrik aslinya tanpa mengubah URL, slug, atau tanggal terbitnya.`
      : `Jadikan "${article.title}" sebagai Hero Utama beranda?`;

    if (!window.confirm(confirmText)) return;

    setNotice(null);
    setActiveActionId(article.id);
    startTransition(async () => {
      try {
        const res = await setHeroArticleAction(article.id);
        if (!res.ok) {
          setNotice({ tone: "error", message: res.error });
          return;
        }
        setNotice({
          tone: res.unchanged ? "info" : "success",
          message: res.unchanged
            ? `"${article.title}" sudah menjadi Hero Utama aktif.`
            : fromHistory
              ? `"${article.title}" kembali ditetapkan sebagai Hero Utama aktif.`
              : `"${article.title}" ditetapkan sebagai Hero Utama aktif.`,
        });
        router.refresh();
      } finally {
        setActiveActionId(null);
      }
    });
  }

  function handleClearHero() {
    const currentTitle = active.configuredArticle?.title ?? "konten pilihan saat ini";
    const ok = window.confirm(
      `Kembalikan Hero Utama ke mode otomatis (artikel terbit terbaru)?\n\n"${currentTitle}" akan otomatis kembali ke kelompok kategori/rubrik aslinya.`,
    );
    if (!ok) return;

    setNotice(null);
    setActiveActionId("__clear__");
    startTransition(async () => {
      try {
        const res = await clearHeroArticleAction();
        if (!res.ok) {
          setNotice({ tone: "error", message: res.error });
          return;
        }
        setNotice({
          tone: res.unchanged ? "info" : "success",
          message: res.unchanged
            ? "Hero Utama sudah dalam mode otomatis."
            : "Hero Utama dikembalikan ke mode otomatis (artikel terbit terbaru).",
        });
        router.refresh();
      } finally {
        setActiveActionId(null);
      }
    });
  }

  const pageHref = (targetPage: number) =>
    buildHeroAdminHref({ ...filters, page: targetPage }, ADMIN_HERO_PATH);

  const effective = active.effectiveArticle;

  return (
    <div className="space-y-6">
      {!data.cmsPublicEnabled && (
        <Notice tone="info">
          Mode penuh artikel CMS (<code>CMS_PUBLIC_ARTICLES</code>) masih nonaktif. Konten{" "}
          <strong>Hero Utama yang Anda pilih di sini tetap langsung tampil di beranda publik</strong> (beserta halaman detail artikel &amp; profil penulisnya), sedangkan artikel CMS lainnya tetap terkunci.
        </Notice>
      )}

      {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}

      {/* 1. Hero Utama Aktif */}
      <section aria-labelledby="hero-aktif-heading" className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="hero-aktif-heading" className="font-display text-xl font-semibold text-ink">
              Hero Utama Aktif
            </h2>
            {active.mode === "manual" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                <Star className="size-3.5 fill-current" aria-hidden="true" /> Dipilih Redaksi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-warm px-2.5 py-0.5 text-xs font-semibold text-muted">
                Otomatis (Terbit Terbaru)
              </span>
            )}
          </div>

          {active.configuredId && (
            <button
              type="button"
              disabled={pending}
              onClick={handleClearHero}
              className="admin-button-quiet h-9 px-3 text-xs disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {activeActionId === "__clear__" ? "Mengembalikan…" : "Kembalikan ke Otomatis"}
            </button>
          )}
        </div>

        {active.configuredIneligibleReason && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">
                Hero pilihan sebelumnya ({active.configuredArticle?.title ?? active.configuredId}) saat ini tidak layak tampil di beranda.
              </p>
              <p className="mt-0.5">
                Alasan: {active.configuredIneligibleReason} Beranda sementara menampilkan artikel terbit terbaru secara otomatis sampai Anda memilih pengganti atau mengembalikan ke otomatis.
              </p>
            </div>
          </div>
        )}

        {effective ? (
          <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-line bg-warm">
              {effective.heroSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={effective.heroSrc}
                  alt={effective.heroAlt}
                  className="aspect-[16/10] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[16/10] w-full items-center justify-center text-muted">
                  <ImageIcon className="size-8" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex flex-col justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                    {effective.sectionLabel}
                  </span>
                  {effective.kanalName && effective.rubrikName && (
                    <span className="rounded border border-line bg-warm px-2 py-0.5 font-medium text-muted">
                      Kanal: {effective.kanalName}
                    </span>
                  )}
                  <span className="rounded border border-line bg-paper px-2 py-0.5 font-medium text-muted">
                    {effective.templateLabel}
                  </span>
                </div>

                <h3 className="font-display mt-2 text-xl leading-snug font-semibold text-ink break-words md:text-2xl">
                  {effective.title}
                </h3>

                {effective.standfirst && (
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
                    {effective.standfirst}
                  </p>
                )}

                <p className="mt-2.5 text-xs text-muted">
                  Oleh <span className="font-semibold text-ink">{effective.authorName}</span>
                  {effective.publishedAtIso && (
                    <>
                      {" "}
                      · Terbit{" "}
                      <span className="tabular-nums">{formatWib(new Date(effective.publishedAtIso))}</span>
                    </>
                  )}
                  {" "}
                  · <span className="font-mono text-[11px]">/artikel/{effective.slug}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`/artikel/${effective.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-button-quiet h-9 px-3 text-xs"
                >
                  Buka Artikel <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
                <Link
                  href={`/admin/artikel/${effective.id}`}
                  className="admin-button-quiet h-9 px-3 text-xs"
                >
                  Sunting Artikel
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-warm/40 p-6 text-center text-sm text-muted">
            Belum ada artikel terbit yang memenuhi syarat untuk tampil sebagai Hero Utama. Terbitkan minimal satu artikel yang tidak disembunyikan dari beranda.
          </div>
        )}
      </section>

      {/* 2. Pemilih Konten Hero Utama */}
      <section aria-labelledby="pilih-hero-heading" className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="pilih-hero-heading" className="font-display text-xl font-semibold text-ink">
              Pilih Konten untuk Hero Utama
            </h2>
            <p className="mt-1 text-xs text-muted">
              Menampilkan seluruh konten terbit yang layak beranda (Berita, Catatan Sumenep, Feature, Opini, dan rubrik lain). Artikel bertanda{" "}
              <em>Sembunyikan dari beranda</em> tidak ditampilkan.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted tabular-nums">
            {candidates.total} konten layak
          </span>
        </div>

        {/* Form Filter GET */}
        <form action={ADMIN_HERO_PATH} method="get" className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="block min-w-0">
            <span className="sr-only">Cari judul atau slug artikel</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="Cari judul, ringkasan, atau slug…"
                className="admin-input w-full pl-9 text-sm"
              />
            </div>
          </label>

          <label className="block min-w-0">
            <span className="sr-only">Filter Kanal</span>
            <select name="kanal" defaultValue={filters.kanal} aria-label="Filter Kanal" className="admin-input w-full text-sm">
              <option value="">Semua Kanal</option>
              {filterOptions.kanal.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="sr-only">Filter Rubrik</span>
            <select name="rubrik" defaultValue={filters.rubrik} aria-label="Filter Rubrik" className="admin-input w-full text-sm">
              <option value="">Semua Rubrik</option>
              {filterOptions.rubrik.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="sr-only">Filter Format Editorial</span>
            <select name="template" defaultValue={filters.template} aria-label="Filter Format" className="admin-input w-full text-sm">
              {TEMPLATE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <button type="submit" className="admin-button h-10 px-4 text-sm">
              Saring
            </button>
            {hasFilters && (
              <Link href={ADMIN_HERO_PATH} className="admin-button-quiet h-10 px-3 text-sm">
                Reset
              </Link>
            )}
          </div>
        </form>

        {/* Daftar Kandidat */}
        {candidates.items.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-line bg-warm/30 p-6 text-center text-sm text-muted">
            {hasFilters
              ? "Tidak ada konten terbit yang cocok dengan saringan ini."
              : "Belum ada konten terbit yang memenuhi syarat Hero Utama."}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-paper">
            {candidates.items.map((item) => (
              <CandidateRow
                key={item.id}
                item={item}
                isConfiguredHero={active.configuredId === item.id}
                isEffectiveHero={active.mode === "auto" && active.effectiveArticle?.id === item.id}
                pending={pending}
                busy={activeActionId === item.id}
                onSelect={() => handleSelectHero(item)}
              />
            ))}
          </ul>
        )}

        <PaginationNav
          page={candidates.page}
          pages={candidates.pages}
          total={candidates.total}
          perPage={candidates.perPage}
          hrefForPage={pageHref}
        />
      </section>

      {/* 3. Riwayat Hero Utama */}
      <section aria-labelledby="riwayat-hero-heading" className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="size-5 text-brand" aria-hidden="true" />
            <h2 id="riwayat-hero-heading" className="font-display text-xl font-semibold text-ink">
              Riwayat Hero Utama
            </h2>
          </div>
          <Link href="/admin/aktivitas?kategori=site" className="text-xs font-semibold text-brand hover:underline">
            Lihat di Log Aktivitas →
          </Link>
        </div>

        <p className="mt-1 text-xs text-muted">
          Catatan kronologis konten yang pernah ditetapkan atau diganti sebagai Hero Utama (tersimpan otomatis pada log audit redaksi).
        </p>

        {history.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line bg-warm/30 p-5 text-center text-sm text-muted">
            Belum ada riwayat perubahan Hero Utama.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-paper">
            {history.map((entry) => {
              const isSet = entry.action === HERO_SET_ACTION;
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className={
                          isSet
                            ? "rounded bg-brand/10 px-2 py-0.5 font-semibold text-brand"
                            : "rounded border border-line bg-warm px-2 py-0.5 font-semibold text-muted"
                        }
                      >
                        {isSet ? "Ditetapkan sebagai Hero" : "Dikembalikan ke Otomatis"}
                      </span>
                      {entry.heroSection && (
                        <span className="rounded border border-line bg-paper px-2 py-0.5 font-medium text-ink">
                          {entry.heroSection}
                        </span>
                      )}
                      {entry.heroTemplateLabel && (
                        <span className="text-muted">· {entry.heroTemplateLabel}</span>
                      )}
                      {entry.isCurrentlyHero ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                          <CheckCircle2 className="size-3" aria-hidden="true" /> Sedang Aktif
                        </span>
                      ) : entry.currentStatusLabel ? (
                        <span className="rounded-full border border-line bg-warm/60 px-2 py-0.5 text-muted">
                          Status kini: {entry.currentStatusLabel}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-ink break-words">
                      {isSet && entry.heroTitle ? entry.heroTitle : entry.summary}
                    </p>

                    <p className="mt-0.5 text-xs text-muted">
                      <span className="tabular-nums">{formatWib(new Date(entry.createdAtIso))}</span>
                      {entry.adminName && <> · oleh {entry.adminName}</>}
                      {" · "}
                      <span>{entry.source === "admin-settings" ? "via Pengaturan" : "via Hero Utama"}</span>
                      {isSet && entry.previousHeroTitle && (
                        <> · menggantikan &ldquo;{entry.previousHeroTitle}&rdquo;</>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {entry.heroArticleId && entry.currentStatusLabel !== "Dihapus permanen" && (
                      <Link
                        href={`/admin/artikel/${entry.heroArticleId}`}
                        className="admin-button-quiet h-8 px-2.5 text-xs"
                      >
                        Sunting
                      </Link>
                    )}
                    {entry.canRestoreAsHero && entry.heroArticleId && entry.heroTitle && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          handleSelectHero(
                            { id: entry.heroArticleId!, title: entry.heroTitle! },
                            true,
                          )
                        }
                        className="admin-button-quiet h-8 px-2.5 text-xs font-semibold text-brand disabled:opacity-50"
                      >
                        {activeActionId === entry.heroArticleId ? "Menetapkan…" : "Jadikan Hero Lagi"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function CandidateRow({
  item,
  isConfiguredHero,
  isEffectiveHero,
  pending,
  busy,
  onSelect,
}: {
  item: HeroArticleCard;
  isConfiguredHero: boolean;
  isEffectiveHero: boolean;
  pending: boolean;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {item.heroSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.heroSrc}
            alt=""
            loading="lazy"
            className="hidden aspect-[16/10] w-28 shrink-0 rounded border border-line bg-warm object-cover sm:block"
          />
        ) : (
          <div className="hidden aspect-[16/10] w-28 shrink-0 items-center justify-center rounded border border-line bg-warm text-muted sm:flex">
            <ImageIcon className="size-5" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-warm px-2 py-0.5 font-semibold text-ink">
              {item.sectionLabel}
            </span>
            {item.kanalName && item.rubrikName && (
              <span className="text-muted">({item.kanalName})</span>
            )}
            <span className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {item.templateLabel}
            </span>
            {isConfiguredHero && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                <Star className="size-3 fill-current" aria-hidden="true" /> Hero Aktif
              </span>
            )}
            {!isConfiguredHero && isEffectiveHero && (
              <span className="rounded-full border border-line bg-warm px-2 py-0.5 font-medium text-muted">
                Tampil Otomatis
              </span>
            )}
          </div>

          <p className="mt-1 font-semibold text-ink break-words">{item.title}</p>

          <p className="mt-0.5 text-xs text-muted">
            {item.authorName}
            {item.publishedAtIso && (
              <> · Terbit <span className="tabular-nums">{formatWib(new Date(item.publishedAtIso))}</span></>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a
          href={`/artikel/${item.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-button-quiet h-9 px-2.5 text-xs"
        >
          Lihat <ExternalLink className="size-3" aria-hidden="true" />
        </a>
        {isConfiguredHero ? (
          <span className="inline-flex h-9 items-center gap-1 rounded-md border border-brand/30 bg-brand/5 px-3 text-xs font-semibold text-brand">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Hero Utama Aktif
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={onSelect}
            className="admin-button h-9 px-3 text-xs disabled:opacity-50"
          >
            <Star className="size-3.5" aria-hidden="true" />
            {busy ? "Menetapkan…" : "Jadikan Hero Utama"}
          </button>
        )}
      </div>
    </li>
  );
}
