import Link from "next/link";

import { sectionHref } from "@/content/sections";
import type { ArticleView } from "@/lib/content";

import { ArticleMetadata } from "./ArticleMetadata";
import { ShareArticle } from "./ShareArticle";

export function Breadcrumb({ article, className = "" }: { article: ArticleView; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`meta ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-1.5">
        <li>
          <Link href="/" className="link-underline inline-block py-1">
            Beranda
          </Link>
        </li>
        {article.section && (
          <>
            <li aria-hidden>/</li>
            <li>
              <Link href={sectionHref(article.section)} className="link-underline inline-block py-1">
                {article.section.name}
              </Link>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

/**
 * Header for Standard (left-aligned, news) and Feature (centred, editorial).
 * Spotlight places its title over the hero image (see ArticleHero).
 */
export function ArticleHeader({ article, variant, sharePath }: { article: ArticleView; variant: "standard" | "feature"; sharePath: string }) {
  const feature = variant === "feature";
  return (
    <header className="container-site">
      <div className={`mx-auto ${feature ? "max-w-[52rem] text-center" : "max-w-[47.5rem]"}`}>
        <Breadcrumb article={article} className={feature ? "flex justify-center" : ""} />
        {article.section && (
          <Link
            href={sectionHref(article.section)}
            className={`label-section link-underline inline-block md:text-base ${feature ? "mt-6 tracking-[0.02em]" : "mt-4"}`}
          >
            {article.section.name}
          </Link>
        )}
        <h1
          className={`font-display mt-2 font-bold text-balance text-ink ${
            feature
              ? "text-[clamp(1.875rem,8.4vw,2.25rem)] leading-[1.08] tracking-[-0.02em] md:text-[2.75rem] xl:text-[3.375rem]"
              : "text-[clamp(1.875rem,8.2vw,2.25rem)] leading-[1.08] tracking-[-0.018em] md:text-[2.75rem] xl:text-[3.25rem]"
          }`}
        >
          {article.title}
        </h1>
        <p
          className={`font-display mt-3 text-[1.1875rem] leading-[1.45] text-muted md:mt-4 md:text-[1.375rem] xl:text-[1.5rem] ${
            feature ? "mx-auto max-w-[44rem] italic" : ""
          }`}
        >
          {article.standfirst}
        </p>
        <div className={`mt-5 flex flex-col gap-3 border-y border-line py-3.5 md:flex-row md:items-center md:justify-between ${feature ? "md:justify-center md:gap-8" : ""}`}>
          <ArticleMetadata article={article} align={feature ? "center" : "left"} />
          <ShareArticle path={sharePath} title={article.title} compact className={feature ? "justify-center" : ""} />
        </div>
      </div>
    </header>
  );
}
