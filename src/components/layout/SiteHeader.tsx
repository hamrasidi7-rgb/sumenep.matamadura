import { Search } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import type { Section } from "@/content/types";
import { SITE } from "@/lib/site";

import { MobileNavigation } from "./MobileNavigation";

/**
 * One header for every breakpoint: search · centred logo · menu, tagline below,
 * thin rule. No horizontal category bar — categories live in the drawer.
 * The 1fr/auto/1fr grid keeps the logo optically centred whatever the side
 * controls measure.
 */
export function SiteHeader({ sections }: { sections: Section[] }) {
  return (
    <header className="bg-paper">
      <div className="container-site">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center pt-3 md:pt-6 xl:pt-7">
          <Link
            href="/cari"
            className="tap -ml-2.5 gap-2 justify-self-start rounded-full px-2.5 text-ink hover:text-brand"
            aria-label="Cari artikel"
          >
            <Search aria-hidden className="size-6 md:size-[1.375rem]" strokeWidth={2} />
            <span className="hidden font-sans text-sm font-medium lg:inline">Cari</span>
          </Link>

          <Link href="/" className="block justify-self-center" aria-label={`${SITE.name} — Beranda`}>
            <Logo eager alt="" className="h-auto w-[10.5rem] md:w-[13.5rem] xl:w-[15.5rem]" />
          </Link>

          <div className="justify-self-end">
            <MobileNavigation sections={sections} />
          </div>
        </div>

        <p className="font-display mt-1.5 text-center text-[0.875rem] leading-snug text-ink md:mt-2.5 md:text-base xl:text-[1.0625rem]">
          {SITE.tagline}
        </p>
        <div className="mt-3 border-b border-line md:mt-5" />
      </div>
    </header>
  );
}
