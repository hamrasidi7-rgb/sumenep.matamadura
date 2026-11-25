import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { MediaImage } from "@/components/ui/MediaImage";
import type { ArticleView } from "@/lib/content";
import { formatDate } from "@/lib/format";

/** "Artikel terkait": three items; thumbnail rows on phones, image-top columns from tablet up. */
export function RelatedArticles({ articles }: { articles: ArticleView[] }) {
  if (articles.length === 0) return null;
  return (
    <aside aria-labelledby="artikel-terkait" className="mx-auto mt-12 w-full max-w-[62rem] px-[22px] sm:px-6 md:mt-16 md:px-8">
      <div className="mx-auto max-w-[40rem] border-t border-[#DEDAD4] pt-5 md:max-w-[56rem]">
        <h2 id="artikel-terkait" className="font-serif text-[1.25rem] leading-[1.25] font-semibold text-[#171717] md:text-[1.4375rem]">
          Artikel terkait
        </h2>
        <ul className="mt-4 grid gap-5 md:mt-6 md:grid-cols-3 md:gap-6">
          {articles.map((a) => {
            const href = `/artikel/${a.slug}`;
            return (
              <li key={a.slug} className="grid grid-cols-[34%_1fr] items-start gap-3.5 md:block">
                <Link href={href} tabIndex={-1} aria-hidden className="block">
                  <MediaImage media={a.hero} ratio="16/10" sizes="(min-width: 768px) 300px, 34vw" />
                </Link>
                <div className="min-w-0 md:mt-2.5">
                  {a.section && (
                    <Link
                      href={sectionHref(a.section)}
                      className="link-underline inline-block font-sans text-[0.6875rem] leading-tight font-semibold tracking-[0.08em] text-brand uppercase"
                    >
                      {a.section.name}
                    </Link>
                  )}
                  <h3 className="font-serif mt-1 line-clamp-3 text-[1rem] leading-[1.25] font-semibold text-[#171717] md:text-[1.09375rem]">
                    <Link href={href} className="hover:text-brand-deep">
                      {a.title}
                    </Link>
                  </h3>
                  <p className="mt-1 font-sans text-[0.75rem] leading-[1.4] font-normal text-[#666666]">
                    <time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
