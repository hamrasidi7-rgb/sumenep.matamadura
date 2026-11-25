import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { MediaImage } from "@/components/ui/MediaImage";
import type { ArticleView } from "@/lib/content";
import { formatDate } from "@/lib/format";

/**
 * One article in a list: label, title, summary, author and date, with the
 * image on the right (phones) or left (tablet/desktop). Used by Artikel
 * Terbaru and every archive page.
 */
export function ArticleRow({
  article: a,
  headingLevel = 3,
  showSection = true,
}: {
  article: ArticleView;
  headingLevel?: 2 | 3;
  showSection?: boolean;
}) {
  const href = `/artikel/${a.slug}`;
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="grid grid-cols-[1fr_7.5rem] items-start gap-3.5 sm:gap-4 md:grid-cols-[16rem_1fr] md:gap-7 xl:grid-cols-[17.5rem_1fr]">
      <Link href={href} tabIndex={-1} aria-hidden className="order-2 block md:order-1">
        <MediaImage
          media={a.hero}
          ratio="16/10"
          sizes="(min-width: 1280px) 280px, (min-width: 768px) 256px, 120px"
        />
      </Link>
      <div className="order-1 min-w-0 md:order-2">
        {showSection && a.section && (
          <Link href={sectionHref(a.section)} className="label-section link-underline text-[0.8125rem] md:text-[0.9375rem]">
            {a.section.name}
          </Link>
        )}
        <H className="font-display mt-0.5 text-[1.1875rem] leading-[1.2] font-bold tracking-[-0.005em] text-balance text-ink md:mt-1 md:text-[1.5rem] xl:text-[1.625rem]">
          <Link href={href} className="hover:text-brand-deep">
            {a.title}
          </Link>
        </H>
        <p className="mt-1.5 line-clamp-2 font-serif text-[0.9375rem] leading-[1.6] text-muted md:mt-2 md:line-clamp-3 md:text-[1.0625rem]">
          {a.standfirst}
        </p>
        {/* Phones: author and date on their own lines (names never split).
            Tablet and up: one line separated by a dot. */}
        <p className="meta mt-2 md:mt-3">
          <span className="block md:inline">
            Oleh{" "}
            <Link href={`/penulis/${a.author.slug}`} className="link-underline font-medium text-ink">
              {a.author.name}
            </Link>
          </span>
          <span aria-hidden className="mx-1.5 hidden text-[#c4c7cc] md:inline">
            ·
          </span>
          <time dateTime={a.publishedAt} className="block whitespace-nowrap md:inline">
            {formatDate(a.publishedAt)}
          </time>
        </p>
      </div>
    </article>
  );
}
