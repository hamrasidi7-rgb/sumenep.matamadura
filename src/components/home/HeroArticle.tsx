import Link from "next/link";

import { sectionHref } from "@/content/sections";
import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import { MediaImage } from "@/components/ui/MediaImage";
import type { ArticleView } from "@/lib/content";

/**
 * Featured Story (Berita Utama).
 * Layout:
 * 1. Featured image directly below header: full-width edge-to-edge on mobile,
 *    editorial container on desktop, 16:9 ratio, object-fit: cover.
 * 2. Details below image: Category, Headline (Newsreader serif),
 *    Lead (Inter), and Author Metadata.
 */
export function HeroArticle({ article }: { article: ArticleView }) {
  const href = `/artikel/${article.slug}`;
  return (
    <article aria-labelledby="berita-utama" className="w-full">
      {/* 1. Foto featured tepat di bawah header (Edge-to-edge di mobile, container di desktop) */}
      <div className="w-full md:container-site md:pt-6 xl:pt-8">
        <Link href={href} tabIndex={-1} aria-hidden className="block">
          <MediaImage
            media={article.hero}
            ratio="16/9"
            eager
            rounded={false}
            className="w-full h-full object-cover md:rounded-[var(--radius-media)]"
            sizes="(min-width: 1280px) 1120px, (min-width: 768px) 92vw, 100vw"
          />
        </Link>
      </div>

      {/* 2. Detail konten: Kategori, Headline, Lead, dan Metadata Penulis */}
      <div className="container-site pt-4 sm:pt-6 md:pt-7">
        <div className="max-w-4xl">
          {article.section && (
            <Link
              href={sectionHref(article.section)}
              className="text-[var(--color-primary)] font-sans text-xs sm:text-sm font-semibold tracking-[0.04em] uppercase link-underline"
            >
              {article.section.name}
            </Link>
          )}

          <h2
            id="berita-utama"
            className="font-display mt-1.5 sm:mt-2 text-[clamp(1.75rem,4.5vw,2.875rem)] leading-[1.08] font-bold tracking-[-0.018em] text-[var(--color-text-primary)]"
          >
            <Link href={href} className="hover:text-brand-deep">
              {article.title}
            </Link>
          </h2>

          <p className="font-sans mt-2.5 sm:mt-3 text-[1rem] sm:text-[1.0625rem] md:text-[1.1875rem] leading-[1.5] text-[var(--color-text-secondary)]">
            {article.standfirst}
          </p>

          <div className="mt-3.5 sm:mt-4 md:mt-5 flex items-center gap-3">
            <AuthorAvatar author={article.author} size={40} />
            <div className="min-w-0">
              <p className="font-sans text-[0.875rem] leading-snug text-[var(--color-text-primary)] md:text-[0.9375rem]">
                Oleh{" "}
                <Link href={`/penulis/${article.author.slug}`} className="link-underline font-semibold">
                  {article.author.name}
                </Link>
              </p>
              <ArticleMeta publishedAt={article.publishedAt} readingMinutes={article.readingMinutes} className="mt-0.5" />
            </div>
          </div>
        </div>

        {/* Divider tipis di bawah Featured Story */}
        <div className="mt-6 sm:mt-8 border-b border-border md:mt-10" />
      </div>
    </article>
  );
}
