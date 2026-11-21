import Link from "next/link";

import { sectionHref } from "@/content/sections";
import type { Section } from "@/content/types";
import { MediaImage } from "@/components/ui/MediaImage";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ArticleView } from "@/lib/content";

/**
 * Artikel Terbaru — a list of latest articles displayed horizontally.
 * Mobile: vertical stack after HeroArticle.
 * Desktop: placed in the right column next to HeroArticle (if layout permits).
 */
export function LatestArticles({ articles, rubrics }: { articles: ArticleView[]; rubrics: Section[] }) {
  if (articles.length === 0) return null;
  return (
    <section aria-labelledby="artikel-terbaru" className="container-site mt-12 md:mt-16 xl:mt-20">
      <div className="xl:grid xl:grid-cols-12 xl:gap-14">
        {/* Main list – occupies 8 columns on xl screens */}
        <div className="xl:col-span-8">
          <SectionHeading id="artikel-terbaru" title="Artikel Terbaru" href="/terbaru" />
          <ul className="mt-4 space-y-6 md:mt-6 md:space-y-8">
            {articles.map((a) => (
              <li key={a.slug} className="border-b border-border pb-4 md:pb-6 last:border-0">
                <div className="flex flex-row items-center gap-6 flex-wrap">
                  {/* Text side */}
                  <div className="flex-1 min-w-0">
                    {a.section && (
                      <Link href={sectionHref(a.section)}
                        className="text-[var(--color-primary)] font-sans text-base font-medium tracking-[0.04em] link-underline"
                      >
                        {a.section.name}
                      </Link>
                    )}
                    <h3
                      className="font-display mt-1.5 text-[clamp(1.5rem,5vw,2rem)] leading-[1.05] font-bold tracking-[-0.018em] text-[var(--color-text-primary)]"
                    >
                      <Link href={`/artikel/${a.slug}`} className="hover:text-brand-deep">
                        {a.title}
                      </Link>
                    </h3>
                    <p className="mt-2 text-[var(--color-text-secondary)] font-sans text-base leading-[1.5]">
                      {a.standfirst}
                    </p>
                    <p className="mt-2 text-[var(--color-text-primary)] font-sans text-sm">
                      Oleh{' '}
                      <Link href={`/penulis/${a.author.slug}`} className="link-underline font-medium">
                        {a.author.name}
                      </Link>{' '}
                      • {new Date(a.publishedAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {/* Image side */}
                  <Link href={`/artikel/${a.slug}`} className="mt-4 md:mt-0 block w-32 flex-shrink-0" aria-hidden tabIndex={-1}>
                    <MediaImage
                      media={a.hero}
                      ratio="5/4"
                      eager
                      className="object-cover w-full h-full"
                    />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Rubric index – stays hidden on mobile, shown on xl */}
        <aside aria-labelledby="indeks-rubrik" className="hidden xl:col-span-4 xl:block">
          <div className="sticky top-8 border-t-2 border-[var(--color-text-primary)] pt-5">
            <h2 id="indeks-rubrik" className="font-display text-[1.625rem] leading-none font-bold">
              Rubrik
            </h2>
            <ul className="mt-2">
              {rubrics.map((r) => (
                <li key={r.slug} className="border-b border-border last:border-0 py-3">
                  <Link href={sectionHref(r)} className="group block">
                    <span className="font-display text-[1.25rem] leading-tight font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                      {r.name}
                    </span>
                    <span className="mt-1 block font-sans text-[0.9375rem] leading-snug text-[var(--color-text-secondary)]">
                      {r.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
