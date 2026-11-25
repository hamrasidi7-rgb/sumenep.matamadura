"use client";

import { Bot } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

// The conversation panel is only downloaded when a reader opens it.
const ChatorPanel = dynamic(() => import("./ChatorPanel"), { ssr: false });

/**
 * Floating Chator AI button (collapsed by default), permanently fixed in the
 * bottom-right corner while scrolling up or down.
 */
export function ChatorWidget() {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label="Buka Chator AI (sedang dalam pengembangan)"
        className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex size-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-full bg-brand text-white shadow-[var(--shadow-float)] ring-2 ring-white/70 transition-[transform,opacity,background-color] duration-200 hover:bg-brand-deep motion-reduce:transition-none md:size-[4.5rem] lg:right-[calc(1.5rem+env(safe-area-inset-right))] lg:bottom-6"
      >
        <Bot aria-hidden className="size-6 md:size-[1.625rem]" strokeWidth={1.9} />
        <span aria-hidden className="font-sans text-[0.625rem] leading-none font-semibold tracking-[0.01em] md:text-[0.6875rem]">
          Chator AI
        </span>
      </button>
      {loaded && <ChatorPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
