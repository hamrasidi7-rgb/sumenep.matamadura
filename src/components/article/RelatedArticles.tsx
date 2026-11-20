import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { MediaImage } from "@/components/ui/MediaImage";
import type { ArticleView } from "@/lib/content";
import { formatDate } from "@/lib/format";

/** "Artikel terkait": three items; thumbnail rows on phones, image-top columns from tablet up. */
export function RelatedArticles({ articles }: { articles: ArticleView[] }) {
  if (articles.length === 0) return null;
  return (
    <aside aria-labelledby="artikel-terkait" className="container-site mt-14 md:mt-20">
      <div className="mx-auto max-w-[62rem] border-t-2 border-ink pt-5">
        <h2 id="artikel-terkait" className="font-display text-[1.625rem] leading-none font-bold md:text-[2rem]">
          Artikel terkait
        </h2>
        <ul className="mt-5 grid gap-5 md:mt-7 md:grid-cols-3 md:gap-7">
          {articles.map((a) => {
            const href = `/artikel/${a.slug}`;
            return (
              <li key={a.slug} className="grid grid-cols-[34%_1fr] items-start gap-3.5 md:block">
                <Link href={href} tabIndex={-1} aria-hidden className="block">
                  <MediaImage media={a.hero} ratio="3/2" sizes="(min-width: 768px) 300px, 34vw" />
                </Link>
                <div className="min-w-0 md:mt-3">
                  {a.section && (
                    <Link href={sectionHref(a.section)} className="label-section link-underline text-[0.8125rem]">
                      {a.section.name}
                    </Link>
                  )}
                  <h3 className="font-display mt-0.5 line-clamp-3 text-[1.0625rem] leading-[1.22] font-bold text-ink md:text-[1.1875rem]">
                    <Link href={href} className="hover:text-brand-deep">
                      {a.title}
                    </Link>
                  </h3>
                  <p className="meta mt-1.5">
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
