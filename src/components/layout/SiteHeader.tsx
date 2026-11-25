import Link from "next/link";
import { Search } from "lucide-react";

import type { Section } from "@/content/types";
import { SITE } from "@/lib/site";

import { MobileNavigation } from "./MobileNavigation";

/**
 * Editorial header for SUMENEP – Mata Madura.
 * - Search icon (left)
 * - Centered serif masthead SUMENEP with two-tone sans-serif "matamadura" wordmark
 * - Hamburger menu (right)
 * - Off-white background (#F5F2ED)
 */
export function SiteHeader({ sections }: { sections: Section[] }) {
  return (
    <header className="border-b border-[#DEDAD4] bg-[#F5F2ED]">
      <div className="container-site">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center py-3 md:py-4 xl:py-5">
          {/* Search icon (left) */}
          <Link
            href="/cari"
            className="tap -ml-2.5 gap-2 justify-self-start rounded-full px-2.5 text-ink hover:text-brand"
            aria-label="Cari artikel"
          >
            <Search aria-hidden className="size-6 md:size-[1.375rem]" strokeWidth={2} />
            <span className="hidden font-sans text-sm font-medium lg:inline">Cari</span>
          </Link>

          {/* Centered wordmark */}
          <Link
            href="/"
            className="group block justify-self-center py-0.5"
            aria-label={`${SITE.name} — Beranda`}
          >
            <div className="flex flex-col items-center select-none text-center">
              <span className="font-display text-[1.875rem] font-bold tracking-[0.18em] text-[#171717] uppercase leading-none sm:text-[2.25rem] md:text-[2.75rem] lg:text-[3.25rem] mr-[-0.18em]">
                SUMENEP
              </span>
              <span className="mt-1 inline-flex items-baseline justify-center font-[family-name:var(--font-wordmark)] text-[1.4375rem] font-medium lowercase leading-[0.82] tracking-[0.01em] sm:mt-1.5 sm:text-[1.625rem] md:text-[1.875rem] lg:text-[2.125rem]">
                <span className="text-[#171717]">mata</span>
                <span className="text-[#CC0000]">madura</span>
              </span>
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
