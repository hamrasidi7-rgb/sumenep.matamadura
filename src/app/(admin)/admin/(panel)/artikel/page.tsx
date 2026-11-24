import { FilePlus2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StateBadge } from "@/components/admin/articles/StateBadge";
import { formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import { editorOptions, listArticles, type ListFilters } from "@/server/articles/queries";
import { STATE_FILTERS, stateFilter } from "@/server/articles/status";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Artikel" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Article list. Filters live in the URL (plain GET form: works without
// JavaScript and can be bookmarked) — same approach as Busacare's
// "Semua berita" page; paging happens in the database.
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const filters: ListFilters = {
    q: one(params.q).slice(0, 100),
    state: stateFilter(one(params.status)),
    kanal: one(params.kanal),
    rubrik: one(params.rubrik),
    from: one(params.dari),
    to: one(params.sampai),
    page: Number(one(params.halaman)) || 1,
  };
  const db = getDb();
  const [{ items, total, page, pages, counts }, options] = await Promise.all([listArticles(db, filters), editorOptions(db)]);

  const link = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: filters.q, status: filters.state === "semua" ? "" : filters.state, kanal: filters.kanal, rubrik: filters.rubrik, dari: filters.from, sampai: filters.to, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "halaman" && String(v) === "1")) next.set(k, String(v));
    const query = next.toString();
    return `/admin/artikel${query ? `?${query}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[2rem] leading-tight font-semibold">Artikel</h1>
          <Link href="/admin/artikel/baru" className="admin-button">
            <FilePlus2 className="size-4" aria-hidden /> Tulis artikel
          </Link>
        </div>
        {one(params.pesan) === "dihapus" && (
          <div className="mt-4">
            <Notice tone="success">Artikel dihapus permanen.</Notice>
          </div>
        )}

        <nav aria-label="Status artikel" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
          {STATE_FILTERS.map((f) => {
            const count = f.value === "semua" ? counts.draf + counts.terjadwal + counts.terbit + counts.arsip : counts[f.value];
            return (
              <Link key={f.value} href={link({ status: f.value === "semua" ? "" : f.value, halaman: 1 })} aria-current={filters.state === f.value ? "page" : undefined} className={`admin-tab whitespace-nowrap ${filters.state === f.value ? "admin-tab-active" : ""}`}>
                {f.label} <span className="text-xs text-muted">({count})</span>
              </Link>
            );
          })}
        </nav>

        <form method="get" action="/admin/artikel" className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-line bg-paper p-4 md:grid-cols-[2fr_1fr_1fr_auto_auto_auto]" role="search">
          {filters.state !== "semua" && <input type="hidden" name="status" value={filters.state} />}
          <label className="relative block md:col-span-1">
            <span className="sr-only">Cari</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" defaultValue={filters.q} placeholder="Cari judul, lead, isi, slug, tag" className="admin-input pl-9" />
          </label>
          <select name="kanal" defaultValue={filters.kanal} className="admin-input" aria-label="Kanal">
            <option value="">Semua kanal</option>
            {options.kanal.map((k) => <option key={k.id} value={k.slug}>{k.name}</option>)}
          </select>
          <select name="rubrik" defaultValue={filters.rubrik} className="admin-input" aria-label="Rubrik">
            <option value="">Semua rubrik</option>
            {options.rubrik.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
          </select>
          <input type="date" name="dari" defaultValue={filters.from} className="admin-input" aria-label="Dari tanggal" />
          <input type="date" name="sampai" defaultValue={filters.to} className="admin-input" aria-label="Sampai tanggal" />
          <button type="submit" className="admin-button">Terapkan</button>
        </form>

        <p className="mt-4 text-sm text-muted">{total} artikel{filters.q ? ` untuk “${filters.q}”` : ""}. Tanggal = tanggal terbit, atau tanggal dibuat bila belum terbit (WIB).</p>

        {items.length === 0 ? (
          <p className="mt-8 text-center text-muted">Tidak ada artikel yang cocok.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-paper">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                {a.heroSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.heroSrc} alt="" className="hidden h-12 w-18 shrink-0 rounded bg-warm object-cover sm:block" loading="lazy" />
                ) : (
                  <span className="hidden h-12 w-18 shrink-0 rounded bg-warm sm:block" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/artikel/${a.id}`} className="font-semibold hover:text-brand">{a.title}</Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <StateBadge state={a.state} />
                    <span>{[a.kanal, a.rubrik].filter(Boolean).join(" · ") || "Tanpa kanal/rubrik"}</span>
                    <span>{a.author}</span>
                    <span>{a.publishedAt ? `${a.state === "terjadwal" ? "Tayang" : "Terbit"} ${formatWib(new Date(a.publishedAt))}` : `Diubah ${formatWib(new Date(a.updatedAt))}`}</span>
                  </p>
                </div>
                {a.state === "terbit" && (
                  <a href={`/artikel/${a.slug}`} target="_blank" rel="noopener" className="hidden text-xs font-semibold text-brand hover:underline md:inline">Lihat</a>
                )}
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label="Halaman" className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? <Link href={link({ halaman: page - 1 })} className="admin-button-quiet">← Sebelumnya</Link> : <span />}
            <span className="text-muted">Halaman {page} dari {pages}</span>
            {page < pages ? <Link href={link({ halaman: page + 1 })} className="admin-button-quiet">Berikutnya →</Link> : <span />}
          </nav>
        )}
    </main>
  );
}
