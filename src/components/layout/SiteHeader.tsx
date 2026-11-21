import Link from "next/link";
import { Search } from "lucide-react";

import type { Section } from "@/content/types";
import { SITE } from "@/lib/site";

import { MobileNavigation } from "./MobileNavigation";

/**
 * Editorial header for SUMENEP – Mata Madura.
 * Reference: Logo Pertama Header.png
 * - Search icon (left)
 * - Centered serif logo SUMENEP with MATA MADURA subtitle & horizontal red rules
 * - Hamburger menu (right)
 * - Off-white background (#F5F2ED)
 */
export function SiteHeader({ sections }: { sections: Section[] }) {
  return (
    <header className="border-b border-[#DEDAD4] bg-[#F5F2ED]">
      <div className="container-site">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center py-3.5 md:py-5 xl:py-6">
          {/* Search icon (left) */}
          <Link
            href="/cari"
            className="tap -ml-2.5 gap-2 justify-self-start rounded-full px-2.5 text-ink hover:text-brand"
            aria-label="Cari artikel"
          >
            <Search aria-hidden className="size-6 md:size-[1.375rem]" strokeWidth={2} />
            <span className="hidden font-sans text-sm font-medium lg:inline">Cari</span>
          </Link>

          {/* Centered logo */}
          <Link
            href="/"
            className="group block justify-self-center py-1"
            aria-label={`${SITE.name} — Beranda`}
          >
            <div className="flex flex-col items-center select-none text-center">
              <span className="font-display text-[1.875rem] font-bold tracking-[0.18em] text-[#171717] uppercase leading-none sm:text-[2.25rem] md:text-[2.75rem] lg:text-[3.25rem] mr-[-0.18em]">
                SUMENEP
              </span>
              <div className="mt-1 flex items-center justify-center gap-2 sm:mt-1.5 sm:gap-3 md:mt-2 md:gap-3.5">
                <span className="h-px w-5 bg-[#A6192E] sm:w-8 md:w-11" aria-hidden="true" />
                <span className="font-display text-[9px] font-semibold tracking-[0.25em] text-[#A6192E] uppercase leading-none sm:text-[11px] md:text-[13px] mr-[-0.25em]">
                  MATA MADURA
                </span>
                <span className="h-px w-5 bg-[#A6192E] sm:w-8 md:w-11" aria-hidden="true" />
              </div>
            </div>
          </Link>

          {/* Hamburger menu (right) */}
          <div className="justify-self-end">
            <MobileNavigation sections={sections} />
          </div>
        </div>

        {/* Tagline for screen readers / SEO */}
        <p className="sr-only">{SITE.tagline}</p>
      </div>
    </header>
  );
}
