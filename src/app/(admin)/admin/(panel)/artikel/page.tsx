import { CalendarClock, ExternalLink, FilePlus2, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ArticleFilterForm } from "@/components/admin/articles/ArticleFilterForm";
import { ArticleListActions } from "@/components/admin/articles/ArticleListActions";
import { StateBadge } from "@/components/admin/articles/StateBadge";
import { WhatsappChannelCopy } from "@/components/admin/articles/WhatsappChannelCopy";
import { formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import { PaginationNav } from "@/components/admin/PaginationNav";
import {
  articleEditUrl,
  articleListUrl,
  hasActiveListFilters,
  nextArticleListState,
  pageRange,
  parseArticleListState,
  PER_PAGE_OPTIONS,
} from "@/lib/admin-pagination";
import { SITE } from "@/lib/site";
import { editorOptions, listArticles } from "@/server/articles/queries";
import { STATE_FILTERS } from "@/server/articles/status";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Artikel" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const ACTION_NOTICES: Record<string, string> = {
  dihapus: "Artikel dihapus permanen.",
  tarik: "Artikel ditarik dari publikasi (kembali menjadi draf).",
  arsip: "Artikel diarsipkan dan tidak tampil di situs.",
  "buka-arsip": "Artikel dikembalikan dari arsip sebagai draf.",
  sampah: "Artikel dipindahkan ke tempat sampah.",
  pulih: "Artikel dipulihkan dari tempat sampah.",
};

// Daftar manajemen artikel. Saringan dan nomor halaman hidup di URL (form GET
// bekerja tanpa JavaScript) dan ikut dibawa saat membuka editor agar kembali
// mendarat di posisi yang sama.
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const urlState = parseArticleListState(params);
  const db = getDb();

  // Jalankan berurutan agar total koneksi serentak tetap <= 4 pada pool MariaDB limit 5.
  const [options, homepageRow] = await Promise.all([
    editorOptions(db, { includeUsedAuthors: true }),
    db.homepageSettings.findUnique({ where: { id: 1 }, select: { heroArticleId: true } }),
  ]);
  const activeHeroId = homepageRow?.heroArticleId ?? null;
  const { items, total, page, pages, perPage, counts } = await listArticles(db, {
    q: urlState.q,
    state: urlState.status,
    kanal: urlState.kanal,
    rubrik: urlState.rubrik,
    author: urlState.penulis,
    from: urlState.dari,
    to: urlState.sampai,
    sort: urlState.urut,
    perPage: urlState.per,
    page: urlState.halaman,
  });

  const effectiveState = { ...urlState, per: perPage, halaman: page };
  const currentListUrl = articleListUrl(effectiveState);
  const range = pageRange(page, perPage, total);
  const filtered = hasActiveListFilters(effectiveState);
  const noticeText = ACTION_NOTICES[one(params.pesan)];

  const tabUrl = (status: (typeof STATE_FILTERS)[number]["value"]) =>
    articleListUrl(nextArticleListState(effectiveState, { status }));
  const perUrl = (per: (typeof PER_PAGE_OPTIONS)[number]) =>
    articleListUrl(nextArticleListState(effectiveState, { per }));
  const pageUrl = (targetPage: number) =>
    articleListUrl(nextArticleListState(effectiveState, { halaman: targetPage }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">Artikel</h1>
          <p className="mt-1 text-sm text-muted">
            Kelola seluruh naskah berita, jadwal tayang, arsip, dan tempat sampah redaksi.
          </p>
        </div>
        <Link href="/admin/artikel/baru" className="admin-button shrink-0">
          <FilePlus2 className="size-4" aria-hidden="true" /> Tulis artikel
        </Link>
      </div>

      {noticeText && (
        <div className="mt-4">
          <Notice tone="success">{noticeText}</Notice>
        </div>
      )}

      <nav aria-label="Status artikel" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {STATE_FILTERS.map((f) => {
          const count = f.value === "semua" ? counts.draf + counts.terjadwal + counts.terbit + counts.arsip : counts[f.value];
          return (
            <Link
              key={f.value}
              href={tabUrl(f.value)}
              aria-current={effectiveState.status === f.value ? "page" : undefined}
              className={`admin-tab shrink-0 whitespace-nowrap ${effectiveState.status === f.value ? "admin-tab-active" : ""}`}
            >
              {f.label} <span className="text-xs text-muted tabular-nums">({count})</span>
            </Link>
          );
        })}
      </nav>

      {effectiveState.status === "sampah" && (
        <div className="mt-4">
          <Notice tone="info">
            Artikel di tempat sampah tidak tampil di situs publik. Gunakan tombol Pulihkan untuk mengembalikan ke status asal, atau Hapus permanen melalui konfirmasi.
          </Notice>
        </div>
      )}

      <ArticleFilterForm
        state={effectiveState}
        kanalOptions={options.kanal}
        rubrikOptions={options.rubrik}
        authorOptions={options.authors}
      />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted tabular-nums">
          {total === 0
            ? `0 artikel${effectiveState.q ? ` untuk “${effectiveState.q}”` : ""}.`
            : `Menampilkan ${range.from}–${range.to} dari ${total.toLocaleString("id-ID")} artikel${effectiveState.q ? ` untuk “${effectiveState.q}”` : ""}.`}{" "}
          Tanggal memakai waktu WIB.
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Tampilkan</span>
          {PER_PAGE_OPTIONS.map((n) => (
            <Link
              key={n}
              href={perUrl(n)}
              aria-current={perPage === n ? "page" : undefined}
              aria-label={`Tampilkan ${n} artikel per halaman`}
              className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 font-semibold tabular-nums transition-colors ${
                perPage === n ? "bg-brand text-white" : "border border-line bg-paper text-ink hover:border-ink/40 hover:bg-warm"
              }`}
            >
              {n}
            </Link>
          ))}
          <span>per halaman</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="admin-card mt-4 text-center">
          <p className="text-sm text-muted">
            {filtered
              ? "Tidak ada artikel yang cocok dengan saringan ini."
              : "Belum ada artikel. Mulai menulis lewat tombol Tulis artikel."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-paper shadow-sm">
          {items.map((a) => {
            const editHref = articleEditUrl(a.id, effectiveState);
            return (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {a.heroSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.heroSrc} alt="" className="hidden aspect-[16/10] w-24 shrink-0 rounded bg-warm object-cover sm:block" loading="lazy" />
                  ) : (
                    <span className="hidden aspect-[16/10] w-24 shrink-0 rounded bg-warm sm:block" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={editHref} className="font-semibold text-ink break-words hover:text-brand">
                      {a.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                      <StateBadge state={a.state} />
                      {activeHeroId === a.id && (
                        <Link
                          href="/admin/hero"
                          className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand/15"
                        >
                          <Star className="size-3 fill-current" aria-hidden="true" /> Hero Utama
                        </Link>
                      )}
                      <span>{[a.kanal, a.rubrik].filter(Boolean).join(" · ") || "Tanpa kanal/rubrik"}</span>
                      <span>{a.author}</span>
                      {a.state === "terjadwal" && a.publishedAt ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-900 tabular-nums">
                          <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                          Jadwal: {formatWib(new Date(a.publishedAt))}
                        </span>
                      ) : a.state === "terbit" && a.publishedAt ? (
                        <span className="tabular-nums">Terbit: {formatWib(new Date(a.publishedAt))}</span>
                      ) : (
                        <span className="tabular-nums">Diubah: {formatWib(new Date(a.updatedAt))}</span>
                      )}
                    </p>
                  </div>
                </div>

                <ArticleListActions
                  article={{
                    id: a.id,
                    version: a.version,
                    title: a.title,
                    slug: a.slug,
                    state: a.state,
                    everPublished: a.everPublished,
                  }}
                  listUrl={currentListUrl}
                >
                  {a.state === "terbit" && (
                    <>
                      <WhatsappChannelCopy title={a.title} standfirst={a.standfirst} slug={a.slug} siteUrl={SITE.url} />
                      <a
                        href={`/artikel/${a.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-warm"
                      >
                        Lihat <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </>
                  )}
                  <Link
                    href={editHref}
                    className="inline-flex min-h-8 items-center rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-warm"
                  >
                    Sunting
                  </Link>
                </ArticleListActions>
              </li>
            );
          })}
        </ul>
      )}

      <PaginationNav page={page} pages={pages} total={total} perPage={perPage} hrefForPage={pageUrl} />
    </main>
  );
}
