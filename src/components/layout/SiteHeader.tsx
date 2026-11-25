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
    <header className="sticky top-0 z-40 border-b border-[#DEDAD4] bg-[#F5F2ED]">
      <div className="container-site">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center py-2.5 md:py-3.5 xl:py-4">
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
            <div data-logo-wordmark="" className="flex flex-col items-center text-center select-none">
              <span
                data-logo-title=""
                className="font-display pl-[0.03em] text-[clamp(1.78125rem,3.3vw,2.4375rem)] leading-[0.95] font-normal tracking-[0.03em] text-[#171717] uppercase md:pl-[0.04em] md:tracking-[0.04em]"
              >
                SUMENEP
              </span>
              <span
                data-logo-subtext=""
                className="mt-0.5 inline-flex items-baseline justify-center font-sans text-[clamp(0.96875rem,1.6vw,1.25rem)] leading-none font-semibold tracking-[-0.01em] lowercase md:mt-1"
              >
                <span className="text-[#171717]">mata</span>
                <span className="text-[#A6192E]">madura</span>
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
