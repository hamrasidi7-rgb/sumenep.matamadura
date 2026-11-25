import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { MediaImage } from "@/components/ui/MediaImage";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ArticleView } from "@/lib/content";

/**
 * FeaturedArticles – a grid of editorial stories.
 * Desktop: three‑column grid, each item with a 16:9 hero image on top.
 * Mobile: single column, image above headline.
 * Uses the final design‑system tokens (primary red, off‑white bg, etc.).
 */
export function FeaturedArticles({ articles }: { articles: ArticleView[] }) {
  if (articles.length === 0) return null;
  return (
    <section aria-labelledby="tulisan-pilihan" className="container-site mt-8 md:mt-14 xl:mt-16">
      <SectionHeading id="tulisan-pilihan" title="Tulisan Pilihan" href="/pilihan" />

      <ul className="mt-4 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {articles.map((a) => {
          const href = `/artikel/${a.slug}`;
          return (
            <li key={a.slug} className="border-b border-border pb-6 last:border-0">
              <Link href={href} className="block" aria-hidden tabIndex={-1}>
                <MediaImage
                  media={a.hero}
                  ratio="16/10"
                  eager
                  className="object-cover w-full h-full"
                />
              </Link>
              <div className="mt-3">
                {a.section && (
                  <Link href={sectionHref(a.section)}
                    className="text-[var(--color-primary)] font-sans text-base font-medium tracking-[0.04em] link-underline">
                    {a.section.name}
                  </Link>
                )}
                <h3
                  className="font-display mt-1.5 text-[clamp(1.125rem,4vw,1.5rem)] leading-[1.05] font-bold tracking-[-0.018em] text-[var(--color-text-primary)]"
                >
                  <Link href={href} className="hover:text-brand-deep">
                    {a.title}
                  </Link>
                </h3>
                <p className="mt-2 text-[var(--color-text-secondary)] font-sans text-base leading-[1.5]">
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
}
