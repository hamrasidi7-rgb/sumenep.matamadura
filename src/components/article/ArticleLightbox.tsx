"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Item {
  src: string;
  alt: string;
  caption: string;
}

const toItem = (el: HTMLElement): Item => ({
  src: el.dataset.src ?? "",
  alt: el.dataset.alt ?? "",
  caption: el.dataset.caption ?? "",
});

/**
 * One lightbox per page. Any element with [data-lightbox] opens it; images
 * sharing data-group can be browsed with the arrow buttons or ← → keys.
 * Built on <dialog>: Esc closes it and focus returns to the image.
 */
export function ArticleLightbox() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const trigger = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-lightbox]");
      if (!trigger) return;
      e.preventDefault();
      const group = trigger.dataset.group;
      const all = group
        ? Array.from(document.querySelectorAll<HTMLElement>(`[data-lightbox][data-group="${CSS.escape(group)}"]`))
        : [trigger];
      setItems(all.map(toItem));
      setIndex(Math.max(0, all.indexOf(trigger)));
      dialog.current?.showModal();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const go = useCallback((delta: number) => setIndex((i) => (items.length ? (i + delta + items.length) % items.length : 0)), [items.length]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (!d.open) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [go]);

  const item = items[index];
  const many = items.length > 1;
  const btn = "flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20";

  return (
    <dialog
      ref={dialog}
      aria-label="Penampil gambar"
      className="sheet lightbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
    >
      {item && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <p className="px-2 font-sans text-sm text-white/70" aria-live="polite">
              {many ? `${index + 1} / ${items.length}` : ""}
            </p>
            <button type="button" onClick={() => dialog.current?.close()} className={btn} aria-label="Tutup penampil gambar">
              <X aria-hidden className="size-6" />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-3 py-3"
            onClick={(e) => {
              if (e.target === e.currentTarget) dialog.current?.close();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- full-size original for zooming */}
            <img src={item.src} alt={item.alt} className="max-h-full max-w-full rounded object-contain" />
          </div>
          <div className="flex items-center gap-3 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {many && (
              <button type="button" onClick={() => go(-1)} className={btn} aria-label="Gambar sebelumnya">
                <ChevronLeft aria-hidden className="size-6" />
              </button>
            )}
            <p className="min-w-0 flex-1 text-center font-sans text-[0.8125rem] leading-snug text-white/85">{item.caption}</p>
            {many && (
              <button type="button" onClick={() => go(1)} className={btn} aria-label="Gambar berikutnya">
                <ChevronRight aria-hidden className="size-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
