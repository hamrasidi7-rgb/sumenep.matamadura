"use client";

import { AlertTriangle, Archive, ArchiveRestore, ChevronDown, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { changeArticleStateAction, deleteArticleAction } from "@/app/(admin)/admin/(panel)/artikel/actions";
import { allowedListTransitions, type ArticleState, type ListStateAction } from "@/server/articles/status";

interface ArticleActionTarget {
  id: string;
  version: number;
  title: string;
  slug: string;
  state: ArticleState;
  everPublished: boolean;
}

const ACTION_CONFIG: Record<
  ListStateAction,
  {
    label: (state: ArticleState) => string;
    confirm?: (title: string, state: ArticleState) => string;
    pesan: string;
    icon: typeof Archive;
    danger?: boolean;
  }
> = {
  unpublish: {
    label: (state) => (state === "terjadwal" ? "Tarik jadwal ke draf" : "Tarik ke draf"),
    confirm: (title, state) =>
      state === "terjadwal"
        ? `Batalkan jadwal tayang "${title}" dan kembalikan ke draf?`
        : `Tarik "${title}" dari publikasi? Artikel kembali menjadi draf dan tidak tampil di situs.`,
    pesan: "tarik",
    icon: RotateCcw,
  },
  archive: {
    label: () => "Arsipkan",
    confirm: (title) => `Arsipkan "${title}"? Artikel tidak tampil di situs.`,
    pesan: "arsip",
    icon: Archive,
  },
  unarchive: {
    label: () => "Kembalikan ke draf",
    pesan: "buka-arsip",
    icon: ArchiveRestore,
  },
  trash: {
    label: () => "Pindahkan ke tempat sampah",
    confirm: (title) => `Pindahkan "${title}" ke tempat sampah? Artikel tidak tampil di situs dan bisa dipulihkan.`,
    pesan: "sampah",
    icon: Trash2,
    danger: true,
  },
  restore: {
    label: () => "Pulihkan",
    pesan: "pulih",
    icon: RotateCcw,
  },
};

function withMessageParam(listUrl: string, pesan: string): string {
  const url = new URL(listUrl, "http://local");
  url.searchParams.set("pesan", pesan);
  return `${url.pathname}${url.search}`;
}

export function ArticleListActions({
  article,
  listUrl,
  children,
}: {
  article: ArticleActionTarget;
  listUrl: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [error, setError] = useState<{ text: string; conflict?: boolean } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const modalTitleId = useId();
  const confirmInputId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!deleteOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setDeleteOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, pending]);

  const transitions = allowedListTransitions(article.state);

  function runTransition(action: ListStateAction) {
    const cfg = ACTION_CONFIG[action];
    setMenuOpen(false);
    if (cfg.confirm && !window.confirm(cfg.confirm(article.title, article.state))) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await changeArticleStateAction(article.id, article.version, action);
        if (!res.ok) {
          setError({ text: res.error, conflict: "conflict" in res && Boolean(res.conflict) });
          return;
        }
        router.replace(withMessageParam(listUrl, cfg.pesan), { scroll: false });
        router.refresh();
      } catch {
        setError({ text: "Gagal menghubungi server. Coba lagi." });
      }
    });
  }

  function openDeleteModal() {
    setError(null);
    setConfirmPhrase("");
    setDeleteOpen(true);
  }

  function closeDeleteModal() {
    if (pending) return;
    setDeleteOpen(false);
    setConfirmPhrase("");
  }

  function submitPermanentDelete() {
    if (confirmPhrase.trim() !== "HAPUS" || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await deleteArticleAction(article.id);
        if (!res.ok) {
          setError({ text: res.error });
          return;
        }
        setDeleteOpen(false);
        setConfirmPhrase("");
        router.replace(withMessageParam(listUrl, "dihapus"), { scroll: false });
        router.refresh();
      } catch {
        setError({ text: "Gagal menghapus artikel. Periksa koneksi lalu coba lagi." });
      }
    });
  }

  const canDelete = confirmPhrase.trim() === "HAPUS" && !pending;

  return (
    <div className="flex shrink-0 flex-col items-start gap-1.5 md:items-end">
      <div ref={barRef} className="relative flex flex-wrap items-center gap-2">
        {children}

        {article.state === "sampah" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => runTransition("restore")}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-warm disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
              Pulihkan
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={openDeleteModal}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-brand/30 bg-blush/70 px-2.5 text-xs font-semibold text-brand-deep transition-colors hover:bg-blush disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Hapus permanen
            </button>
          </>
        ) : (
          transitions.length > 0 && (
            <>
              <button
                type="button"
                disabled={pending}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-warm disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                <span>Kelola</span>
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label={`Tindakan untuk ${article.title}`}
                  className="absolute top-full left-0 z-30 mt-1 w-56 rounded-lg border border-line bg-paper p-1 shadow-lg md:right-0 md:left-auto"
                >
                  {transitions.map((action) => {
                    const cfg = ACTION_CONFIG[action];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={action}
                        type="button"
                        role="menuitem"
                        disabled={pending}
                        onClick={() => runTransition(action)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          cfg.danger
                            ? "text-brand-deep hover:bg-blush/70"
                            : "text-ink hover:bg-warm"
                        }`}
                      >
                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{cfg.label(article.state)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}
      </div>

      {error && !deleteOpen && (
        <p role="alert" className="text-xs text-brand-deep md:max-w-sm md:text-right">
          {error.text}{" "}
          {error.conflict && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                router.refresh();
              }}
              className="font-semibold underline"
            >
              Muat ulang daftar
            </button>
          )}
        </p>
      )}

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
          onClick={closeDeleteModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            className="w-full max-w-lg rounded-t-xl border border-line bg-paper p-5 shadow-xl sm:rounded-xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-blush text-brand-deep">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id={modalTitleId} className="font-display text-xl leading-snug font-semibold text-ink">
                    Hapus artikel secara permanen?
                  </h2>
                  <p className="mt-1 text-xs text-muted">Tindakan ini tidak dapat dibatalkan.</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup dialog konfirmasi hapus"
                disabled={pending}
                onClick={closeDeleteModal}
                className="admin-icon-button shrink-0"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 rounded-md border border-line bg-warm p-3 text-sm">
              <p className="font-semibold text-ink break-words">{article.title}</p>
              <p className="mt-0.5 font-mono text-xs text-muted break-all">/artikel/{article.slug}</p>
            </div>

            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>Seluruh riwayat revisi dan catatan status artikel ini akan ikut dihapus permanen.</li>
              <li>Berkas gambar di Pustaka Media tetap aman tersimpan dan tidak ikut dihapus.</li>
              {article.everPublished && (
                <li className="rounded-md border border-brand/25 bg-blush/70 px-3 py-2 text-xs font-medium text-brand-deep">
                  Perhatian: Artikel ini pernah terbit. Tautan publik dan pengalihan slug lama (301) akan ikut terhapus dan berhenti berfungsi.
                </li>
              )}
            </ul>

            <div className="mt-4">
              <label htmlFor={confirmInputId} className="admin-label">
                Ketik <span className="font-mono text-brand-deep">HAPUS</span> untuk mengonfirmasi
              </label>
              <input
                id={confirmInputId}
                type="text"
                autoFocus
                autoComplete="off"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canDelete) {
                    e.preventDefault();
                    submitPermanentDelete();
                  }
                }}
                placeholder="HAPUS"
                disabled={pending}
                className="admin-input mt-1.5 font-mono"
              />
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-md bg-blush px-3 py-2 text-xs font-medium text-brand-deep">
                {error.text}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={closeDeleteModal}
                className="admin-button-quiet"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!canDelete}
                onClick={submitPermanentDelete}
                className="admin-button disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                {pending ? "Menghapus…" : "Hapus permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
