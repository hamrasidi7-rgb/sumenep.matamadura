"use client";

import { RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  ADMIN_ARTICLES_PATH,
  ARTICLE_SORT_OPTIONS,
  articleListUrl,
  DEFAULT_PER_PAGE,
  hasActiveListFilters,
  nextArticleListState,
  parseArticleListState,
  type ArticleListUrlState,
} from "@/lib/admin-pagination";

interface OptionItem {
  id: string;
  name: string;
  slug: string;
}

// Form filter artikel berbasis GET (tetap berfungsi tanpa JavaScript).
// Saat JS aktif, submit membangun URL kanonik bersih tanpa parameter kosong.
export function ArticleFilterForm({
  state,
  kanalOptions,
  rubrikOptions,
  authorOptions,
}: {
  state: ArticleListUrlState;
  kanalOptions: OptionItem[];
  rubrikOptions: OptionItem[];
  authorOptions: OptionItem[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(state.q);
  const [kanal, setKanal] = useState(state.kanal);
  const [rubrik, setRubrik] = useState(state.rubrik);
  const [penulis, setPenulis] = useState(state.penulis);
  const [dari, setDari] = useState(state.dari);
  const [sampai, setSampai] = useState(state.sampai);
  const [urut, setUrut] = useState(state.urut);

  useEffect(() => {
    setQ(state.q);
    setKanal(state.kanal);
    setRubrik(state.rubrik);
    setPenulis(state.penulis);
    setDari(state.dari);
    setSampai(state.sampai);
    setUrut(state.urut);
  }, [state.q, state.kanal, state.rubrik, state.penulis, state.dari, state.sampai, state.urut]);

  const filtered = hasActiveListFilters(state);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseArticleListState({
      q,
      status: state.status,
      kanal,
      rubrik,
      penulis,
      dari,
      sampai,
      urut,
      per: String(state.per),
    });
    router.push(articleListUrl(nextArticleListState(parsed, { halaman: 1 })));
  }

  return (
    <form
      method="get"
      action={ADMIN_ARTICLES_PATH}
      onSubmit={handleSubmit}
      className="mt-4 rounded-lg border border-line bg-paper p-4 shadow-sm"
      role="search"
    >
      {state.status !== "semua" && <input type="hidden" name="status" value={state.status} />}
      {state.per !== DEFAULT_PER_PAGE && <input type="hidden" name="per" value={state.per} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Cari artikel</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul, lead, isi, slug, tag"
            className="admin-input pl-9"
          />
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <button type="submit" className="admin-button flex-1 sm:flex-none">Terapkan</button>
          {filtered && (
            <Link href={ADMIN_ARTICLES_PATH} className="admin-button-quiet shrink-0">
              <RotateCcw className="size-4" aria-hidden="true" /> Reset
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label htmlFor="filter-kanal" className="mb-1 block text-xs font-medium text-muted">Kanal</label>
          <select id="filter-kanal" name="kanal" value={kanal} onChange={(e) => setKanal(e.target.value)} className="admin-input text-sm">
            <option value="">Semua kanal</option>
            {kanalOptions.map((k) => <option key={k.id} value={k.slug}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-rubrik" className="mb-1 block text-xs font-medium text-muted">Rubrik</label>
          <select id="filter-rubrik" name="rubrik" value={rubrik} onChange={(e) => setRubrik(e.target.value)} className="admin-input text-sm">
            <option value="">Semua rubrik</option>
            {rubrikOptions.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-penulis" className="mb-1 block text-xs font-medium text-muted">Penulis</label>
          <select id="filter-penulis" name="penulis" value={penulis} onChange={(e) => setPenulis(e.target.value)} className="admin-input text-sm">
            <option value="">Semua penulis</option>
            {authorOptions.map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-dari" className="mb-1 block text-xs font-medium text-muted">Dari tanggal</label>
          <input id="filter-dari" type="date" name="dari" value={dari} onChange={(e) => setDari(e.target.value)} className="admin-input text-sm" />
        </div>
        <div>
          <label htmlFor="filter-sampai" className="mb-1 block text-xs font-medium text-muted">Sampai tanggal</label>
          <input id="filter-sampai" type="date" name="sampai" value={sampai} onChange={(e) => setSampai(e.target.value)} className="admin-input text-sm" />
        </div>
        <div>
          <label htmlFor="filter-urut" className="mb-1 block text-xs font-medium text-muted">Urutan</label>
          <select id="filter-urut" name="urut" value={urut} onChange={(e) => setUrut(e.target.value as ArticleListUrlState["urut"])} className="admin-input text-sm">
            {ARTICLE_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
    </form>
  );
}
