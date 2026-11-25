import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { MediaImage } from "@/components/ui/MediaImage";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { HomepageRubricBand } from "@/server/homepage/slots";

/**
 * Kelompok pita rubrik beranda (di luar Catatan Sumenep), misalnya Opini,
 * Suara Kepulauan, Membaca Sumenep, sesuai konfigurasi `homepage_rubric`.
 * Tidak dirender bila kosong agar tata letak beranda bawaan tetap identik.
 */
export function RubricBands({ bands }: { bands: HomepageRubricBand[] }) {
  if (bands.length === 0) return null;

  return (
    <>
      {bands.map((band) => {
        if (band.articles.length === 0) return null;
        const headingId = `rubrik-${band.section.slug}`;
        return (
          <section key={band.section.slug} aria-labelledby={headingId} className="container-site mt-8 md:mt-14 xl:mt-16">
            <SectionHeading id={headingId} title={band.section.name} href={sectionHref(band.section)} />

            <ul className="mt-4 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
              {band.articles.map((a) => {
                const href = `/artikel/${a.slug}`;
                return (
                  <li key={a.slug} className="border-b border-border pb-6 last:border-0">
                    <Link href={href} className="block" aria-hidden tabIndex={-1}>
                      <MediaImage
                        media={a.hero}
                        ratio="16/10"
                        className="object-cover w-full h-full"
                      />
                    </Link>
                    <div className="mt-3 text-left">
                      <h3 className="font-display mt-1 text-left text-[clamp(1.125rem,4vw,1.5rem)] leading-[1.05] font-bold tracking-[-0.018em] text-[var(--color-text-primary)]">
                        <Link href={href} className="hover:text-brand-deep">
                          {a.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-left text-[var(--color-text-secondary)] font-sans text-base leading-[1.5]">
                        {a.standfirst}
                      </p>
                      <ArticleMeta
                        publishedAt={a.publishedAt}
                        readingMinutes={a.readingMinutes}
                        compact
                        className="mt-2"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
