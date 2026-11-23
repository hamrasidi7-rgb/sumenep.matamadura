"use client";

import type { Editor } from "@tiptap/react";
import { Link2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { searchLinkTargetsAction } from "@/app/(admin)/admin/(panel)/artikel/actions";
import { safeHref } from "@/lib/article-utils";

// Insert or edit a link. Ported from Busacare components/admin/editor/
// link-dialog.tsx: the selection is remembered when the dialog opens (focus
// moving into the dialog collapses the editor selection, so the mark would
// otherwise attach to nothing), external links open in a new tab, and an
// "internal" tab searches published articles. SUMENEP changes: the article URL
// is /artikel/<slug>, and mailto:/tel: are accepted like on the public site.

export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [tab, setTab] = useState<"luar" | "dalam">(existing.startsWith("/artikel/") ? "dalam" : "luar");
  const [url, setUrl] = useState(existing);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ slug: string; title: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = useRef(editor.state.selection);

  useEffect(() => {
    if (tab !== "dalam" || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchLinkTargetsAction(query)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query, tab]);

  function apply(href: string) {
    const safe = safeHref(href);
    if (!safe || safe.startsWith("#")) {
      setError("Gunakan https://…, mailto:, tel:, atau alamat di situs ini yang diawali /.");
      return;
    }
    const { from, to } = range.current;
    if (from === to) {
      setError("Pilih dulu teks yang akan dijadikan tautan.");
      return;
    }
    const external = !safe.startsWith("/");
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .extendMarkRange("link")
      .setLink(external ? { href: safe, target: "_blank", rel: "noopener noreferrer" } : { href: safe })
      .run();
    onClose();
  }

  function remove() {
    const { from, to } = range.current;
    editor.chain().focus().setTextSelection({ from, to }).extendMarkRange("link").unsetLink().run();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-24" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Tautan" className="w-full max-w-md rounded-lg border border-line bg-paper p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold"><Link2 className="size-4" aria-hidden /> Sisipkan / ubah tautan</h3>
          <button type="button" onClick={onClose} aria-label="Tutup"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="mt-3 flex gap-1 rounded-md bg-warm p-1">
          {(["luar", "dalam"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 rounded py-1.5 text-sm font-semibold ${tab === t ? "bg-paper text-brand shadow-sm" : "text-muted"}`}>
              {t === "luar" ? "Tautan luar" : "Artikel SUMENEP"}
            </button>
          ))}
        </div>
        {tab === "luar" ? (
          <div className="mt-3">
            <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} placeholder="https://…" className="admin-input" aria-label="Alamat tautan" />
            {error && <p className="mt-1 text-xs text-brand-deep" role="alert">{error}</p>}
            <div className="mt-3 flex justify-between gap-2">
              {existing && <button type="button" onClick={remove} className="admin-button-quiet text-brand">Hapus tautan</button>}
              <button type="button" onClick={() => apply(url.trim())} className="admin-button ml-auto">Terapkan</button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari judul artikel terbit…" className="admin-input pl-9" aria-label="Cari artikel" />
            </label>
            <div className="mt-2 max-h-64 overflow-y-auto">
              {searching && <p className="py-2 text-xs text-muted">Mencari…</p>}
              {!searching && query.trim().length >= 2 && !results.length && <p className="py-2 text-xs text-muted">Tidak ada artikel terbit yang cocok.</p>}
              {results.map((r) => (
                <button key={r.slug} type="button" onClick={() => apply(`/artikel/${r.slug}`)} className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-warm">
                  <span className="font-medium">{r.title}</span>
                  <span className="ml-2 text-xs text-muted">/artikel/{r.slug}</span>
                </button>
              ))}
            </div>
            {error && <p className="mt-1 text-xs text-brand-deep" role="alert">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
