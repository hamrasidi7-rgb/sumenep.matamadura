import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import { MediaImage } from "@/components/ui/MediaImage";
import type { ArticleView } from "@/lib/content";

/**
 * Berita utama. Mobile/tablet: label → headline → standfirst → byline → image
 * in one column. ≥1024px: headline column left, image right.
 */
export function HeroArticle({ article }: { article: ArticleView }) {
  const href = `/artikel/${article.slug}`;
  return (
    <article className="container-site pt-6 md:pt-10 xl:pt-12" aria-labelledby="berita-utama">
      <div className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-10 xl:gap-14">
        <div className="lg:col-span-5">
          {article.section && (
            <Link href={sectionHref(article.section)} className="label-section link-underline md:text-base">
              {article.section.name}
            </Link>
          )}
          <h2
            id="berita-utama"
            className="font-display mt-1.5 text-[clamp(2rem,8.6vw,2.375rem)] leading-[1.07] font-bold tracking-[-0.018em] text-balance text-ink md:mt-2 md:text-[2.75rem] lg:text-[2.625rem] xl:text-[3.375rem] xl:leading-[1.04]"
          >
            <Link href={href} className="hover:text-brand-deep">
              {article.title}
            </Link>
          </h2>
          <p className="font-display mt-3 text-[1.1875rem] leading-[1.42] text-muted md:mt-4 md:max-w-[38rem] md:text-[1.3125rem] xl:text-[1.4375rem]">
            {article.standfirst}
          </p>

          <div className="mt-4 flex items-center gap-3 md:mt-5">
            <AuthorAvatar author={article.author} size={40} />
            <div className="min-w-0">
              <p className="font-sans text-[0.875rem] leading-snug text-ink md:text-[0.9375rem]">
                Oleh{" "}
                <Link href={`/penulis/${article.author.slug}`} className="link-underline font-semibold">
                  {article.author.name}
                </Link>
              </p>
              <ArticleMeta publishedAt={article.publishedAt} readingMinutes={article.readingMinutes} className="mt-0.5" />
            </div>
          </div>
        </div>

        <div className="mt-5 md:mt-7 lg:col-span-7 lg:mt-0">
          <Link href={href} tabIndex={-1} aria-hidden className="block">
            <MediaImage
              media={article.hero}
              ratio="16/9"
              eager
              sizes="(min-width: 1280px) 680px, (min-width: 1024px) 56vw, (min-width: 768px) 92vw, 100vw"
            />
          </Link>
        </div>
      </div>
    </article>
  );
}
