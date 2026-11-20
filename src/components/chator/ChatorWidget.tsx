"use client";

import { Bot } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// The conversation panel is only downloaded when a reader opens it.
const ChatorPanel = dynamic(() => import("./ChatorPanel"), { ssr: false });

/**
 * Floating Chator AI button (collapsed by default). On phones it slides away
 * while the reader scrolls down and returns on scroll-up or at the page end,
 * so it never sits on the text being read.
 */
export function ChatorWidget() {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const nearEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 80;
        const delta = y - lastY.current;
        if (Math.abs(delta) > 6) {
          setHidden(delta > 0 && y > 160 && !nearEnd);
          lastY.current = y;
        }
        if (nearEnd) setHidden(false);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

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
        data-hidden={hidden || undefined}
        className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex size-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-full bg-brand text-white shadow-[var(--shadow-float)] ring-2 ring-white/70 transition-[transform,opacity,background-color] duration-200 hover:bg-brand-deep data-hidden:pointer-events-none data-hidden:translate-y-[calc(100%+2rem)] data-hidden:opacity-0 motion-reduce:transition-none md:size-[4.5rem] lg:right-[calc(1.5rem+env(safe-area-inset-right))] lg:bottom-6 lg:data-hidden:pointer-events-auto lg:data-hidden:translate-y-0 lg:data-hidden:opacity-100"
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
