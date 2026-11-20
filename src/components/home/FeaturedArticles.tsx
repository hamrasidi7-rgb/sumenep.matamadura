import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { MediaImage } from "@/components/ui/MediaImage";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ArticleView } from "@/lib/content";

/**
 * Tulisan Pilihan — a vertical list (thumbnail 34% · text 66%) on phones and
 * tablets; three list columns on desktop. Titles clamp at three lines.
 */
export function FeaturedArticles({ articles }: { articles: ArticleView[] }) {
  if (articles.length === 0) return null;
  return (
    <section aria-labelledby="tulisan-pilihan" className="container-site mt-8 md:mt-14 xl:mt-16">
      <SectionHeading id="tulisan-pilihan" title="Tulisan Pilihan" href="/pilihan" />

      <ul className="mt-3 md:mt-5 xl:grid xl:grid-cols-3 xl:gap-x-8 xl:border-t xl:border-line xl:pt-6">
        {articles.map((a) => {
          const href = `/artikel/${a.slug}`;
          return (
            <li
              key={a.slug}
              className="group grid grid-cols-[34%_1fr] items-start gap-x-3.5 md:grid-cols-[30%_1fr] md:gap-x-6 xl:grid-cols-[42%_1fr] xl:gap-x-4"
            >
              <Link href={href} tabIndex={-1} aria-hidden className="block py-3 xl:py-0">
                <MediaImage
                  media={a.hero}
                  ratio="3/2"
                  sizes="(min-width: 1280px) 150px, (min-width: 768px) 30vw, 34vw"
                />
              </Link>
              <div className="h-full border-b border-line py-3 group-last:border-b-0 xl:border-b-0 xl:py-0">
                {a.section && (
                  <Link
                    href={sectionHref(a.section)}
                    className="font-display link-underline text-[0.8125rem] leading-tight font-bold text-brand md:text-[0.9375rem]"
                  >
                    {a.section.name}
                  </Link>
                )}
                <h3 className="font-display mt-0.5 line-clamp-3 text-[clamp(1.0625rem,4.6vw,1.1875rem)] leading-[1.22] font-bold tracking-[-0.005em] text-ink md:mt-1 md:text-[1.25rem] xl:text-[1.125rem]">
                  <Link href={href} className="hover:text-brand-deep">
                    {a.title}
                  </Link>
                </h3>
                <ArticleMeta
                  publishedAt={a.publishedAt}
                  readingMinutes={a.readingMinutes}
                  compact
                  className="mt-1.5 md:mt-2"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
