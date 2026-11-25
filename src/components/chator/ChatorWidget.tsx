"use client";

import { Bot } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

// The conversation panel is only downloaded when a reader opens it.
const ChatorPanel = dynamic(() => import("./ChatorPanel"), { ssr: false });

/**
 * Floating Chator AI button permanently fixed at the center of the viewport
 * (top: 50%; left: 50%; transform: translate(-50%, -50%)) while scrolling up or down.
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
        title="Chator AI"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        className="fixed z-40 flex size-9 items-center justify-center rounded-full border border-[#D5CFC4] bg-[#FAF6F0]/90 text-[#444444] shadow-sm backdrop-blur-sm transition-colors duration-200 hover:border-[#171717] hover:bg-white hover:text-[#171717] motion-reduce:transition-none md:size-10"
      >
        <Bot aria-hidden className="size-4 md:size-[1.125rem]" strokeWidth={1.75} />
      </button>
      {loaded && <ChatorPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
