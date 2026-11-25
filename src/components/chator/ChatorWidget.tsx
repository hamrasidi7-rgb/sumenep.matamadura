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
        title="Chator AI"
        data-hidden={hidden || undefined}
        className="fixed right-[calc(0.75rem+env(safe-area-inset-right))] bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex size-9 items-center justify-center rounded-full border border-[#D5CFC4] bg-[#FAF6F0]/90 text-[#444444] shadow-sm backdrop-blur-sm transition-[transform,opacity,background-color,color,border-color] duration-200 hover:border-[#171717] hover:bg-white hover:text-[#171717] data-hidden:pointer-events-none data-hidden:translate-y-[calc(100%+1.5rem)] data-hidden:opacity-0 motion-reduce:transition-none md:size-10 lg:right-[calc(1.25rem+env(safe-area-inset-right))] lg:bottom-5 lg:data-hidden:pointer-events-auto lg:data-hidden:translate-y-0 lg:data-hidden:opacity-100"
      >
        <Bot aria-hidden className="size-4 md:size-[1.125rem]" strokeWidth={1.75} />
      </button>
      {loaded && <ChatorPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
