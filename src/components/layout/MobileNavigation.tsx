"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import type { Section } from "@/content/types";
import { sectionHref } from "@/content/sections";

/**
 * Hamburger drawer (right side) used at every breakpoint. Built on the native
 * <dialog> element: focus trap, Esc-to-close, inert page and top-layer
 * stacking come from the browser. A tap on the dimmed area closes it.
 */
export function MobileNavigation({ sections }: { sections: Section[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  const open = () => ref.current?.showModal();
  const close = () => ref.current?.close();

  // Close after client-side navigation.
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  const kanal = sections.filter((s) => s.kind === "kanal");
  const rubrik = sections.filter((s) => s.kind === "rubrik");

  const item = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={`font-display flex min-h-[3.25rem] items-center justify-between border-b border-line text-[1.1875rem] leading-tight font-semibold transition-colors hover:text-brand ${
            active ? "text-brand" : "text-ink"
          }`}
        >
          {label}
          {active && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
        </Link>
      </li>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-controls="navigasi-utama"
        className="tap -mr-2.5 gap-2 rounded-full px-2.5 text-ink hover:text-brand"
      >
        <span className="hidden font-sans text-sm font-medium lg:inline">Menu</span>
        <Menu aria-hidden className="size-7 md:size-6" strokeWidth={2} />
        <span className="sr-only lg:hidden">Buka menu</span>
      </button>

      <dialog
        id="navigasi-utama"
        ref={ref}
        aria-label="Navigasi utama"
        className="sheet drawer"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex h-full flex-col bg-paper shadow-2xl">
          <div className="flex items-center justify-between border-b border-line py-2 pr-2 pl-6">
            <span className="font-sans text-xs font-semibold tracking-[0.14em] text-muted uppercase">Menu</span>
            <button type="button" onClick={close} className="tap rounded-full text-ink hover:text-brand" aria-label="Tutup menu">
              <X aria-hidden className="size-7" strokeWidth={2} />
            </button>
          </div>

          <nav aria-label="Kanal dan rubrik" className="flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-6">
            <ul>
              {item("/", "Beranda")}
              {kanal.map((s) => item(sectionHref(s), s.name))}
            </ul>
            <p className="mt-7 mb-1 font-sans text-xs font-semibold tracking-[0.14em] text-brand uppercase">Rubrik</p>
            <ul>{rubrik.map((s) => item(sectionHref(s), s.name))}</ul>
          </nav>

          <div className="border-t border-line bg-warm px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Link href="/cari" className="flex min-h-11 items-center gap-3 font-sans text-[0.9375rem] font-medium text-ink hover:text-brand">
              <Search aria-hidden className="size-5" strokeWidth={2} />
              Cari artikel
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
