import { Search } from "lucide-react";
import type { Metadata } from "next";

import { ArchiveView } from "@/components/article/ArchiveView";
import { searchArticles } from "@/lib/content";

export const metadata: Metadata = {
  title: "Cari",
  robots: { index: false, follow: true },
};

export default async function CariPage({ searchParams }: { searchParams: Promise<{ q?: string; halaman?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 120);
  const result = await searchArticles(q, Number(sp.halaman ?? 1));
  return (
    <ArchiveView
      title={q ? `Hasil untuk “${q}”` : "Cari tulisan"}
      result={result}
      basePath="/cari"
      query={q ? { q } : undefined}
      empty={q ? "Tidak ada tulisan yang cocok. Coba kata kunci lain." : "Ketik kata kunci untuk mencari tulisan."}
    >
      <form action="/cari" role="search" className="mt-6 flex items-center gap-2 rounded-full border border-ink py-1 pr-1 pl-5 focus-within:ring-2 focus-within:ring-brand/30">
        <label htmlFor="q" className="sr-only">
          Kata kunci
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          autoFocus={!q}
          placeholder="Cari judul, topik, atau tempat…"
          className="min-h-11 flex-1 bg-transparent font-sans text-base text-ink outline-none placeholder:text-muted"
        />
        <button type="submit" className="tap rounded-full bg-ink text-white hover:bg-brand" aria-label="Cari">
          <Search aria-hidden className="size-5" />
        </button>
      </form>
    </ArchiveView>
  );
}
