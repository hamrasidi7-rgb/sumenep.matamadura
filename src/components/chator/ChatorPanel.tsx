"use client";

import { ArrowRight, Bot, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

// Chator AI is in development: integration with MataGen.ai is a separate,
// later project. This panel only explains what the feature will become.
// It has no input, no suggestions and never shows (simulated) AI answers.

const PLANNED_TOPICS = [
  "Berita dan tulisan SUMENEP",
  "Pemerintahan, APBD, dan data pembangunan",
  "Pendidikan, kesehatan, dan ekonomi",
  "Wilayah kepulauan",
  "Sejarah dan profil daerah",
];

export default function ChatorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(() => closeBtn.current?.focus({ preventScroll: true }));
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="chator-title"
      aria-describedby="chator-status"
      className="sheet chator"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full flex-col bg-paper">
        <div className="flex items-center gap-3 border-b border-line py-2.5 pr-2 pl-4 pt-[calc(0.625rem+env(safe-area-inset-top))] lg:pt-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <Bot aria-hidden className="size-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="chator-title" className="font-display text-[1.1875rem] leading-tight font-bold text-ink">
              Chator AI
            </h2>
            <p className="font-sans text-xs text-muted">Powered by MataGen.ai</p>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            className="tap rounded-full text-ink hover:text-brand"
            aria-label="Tutup Chator AI"
          >
            <X aria-hidden className="size-6" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-blush px-3 py-1 font-sans text-xs font-semibold text-brand">
            <span aria-hidden className="size-1.5 rounded-full bg-brand" />
            Dalam pengembangan
          </p>
          <p id="chator-status" className="font-display mt-4 text-[1.5rem] leading-tight font-bold text-ink">
            Chator AI sedang dalam pengembangan.
          </p>
          <p className="mt-3 font-serif text-[1rem] leading-relaxed text-ink">
            Nantinya, Chator AI akan menjadi asisten pengetahuan tentang Sumenep. Ia akan membantu Anda memahami berbagai
            hal tentang daerah ini, dengan jawaban yang bersumber dan menyertakan rujukan serta tanggal datanya.
          </p>

          <p className="mt-6 font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">Rencana cakupan</p>
          <ul className="mt-2 space-y-1.5 font-sans text-[0.9375rem] leading-snug text-ink">
            {PLANNED_TOPICS.map((t) => (
              <li key={t} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>

          <p className="mt-6 rounded-lg border border-line px-4 py-3 font-sans text-[0.8125rem] leading-relaxed text-muted">
            Fitur tanya-jawab belum aktif. Saat ini Chator AI tidak memberikan jawaban apa pun.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-line px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Link
            href="/terbaru"
            onClick={onClose}
            className="tap justify-between gap-2 rounded-full border border-line px-5 font-sans text-[0.9375rem] font-medium text-ink hover:border-ink"
          >
            Jelajahi tulisan terbaru
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full bg-ink px-5 font-sans text-[0.9375rem] font-medium text-white hover:bg-brand"
          >
            Tutup
          </button>
        </div>
      </div>
    </dialog>
  );
}
