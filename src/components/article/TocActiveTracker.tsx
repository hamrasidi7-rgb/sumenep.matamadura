"use client";

import { useEffect } from "react";

/**
 * Marks the table-of-contents link of the section being read: the last
 * heading whose top has passed a line 30% down the viewport.
 */
export function TocActiveTracker({ ids }: { ids: string[] }) {
  useEffect(() => {
    const headings = ids.map((id) => document.getElementById(id)).filter((h): h is HTMLElement => h !== null);
    if (headings.length === 0) return;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-toc-link]"));
    let current = "";
    let raf = 0;

    const update = () => {
      raf = 0;
      const line = Math.min(160, window.innerHeight * 0.3);
      let active = headings[0].id;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= line) active = h.id;
        else break;
      }
      if (active === current) return;
      current = active;
      for (const a of links) {
        const on = a.dataset.tocLink === active;
        a.dataset.active = String(on);
        if (on) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);
  return null;
}
