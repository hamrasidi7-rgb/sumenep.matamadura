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
 * Header editorial artikel (ditempatkan tepat di bawah foto utama & caption):
 * Kategori/Rubrik → Judul (Lora bold, rata kiri) → Lead (Lora, rata kiri) →
 * Identitas Penulis/Tanggal/Waktu Baca → Tombol Berbagi.
 * Konsisten pada template Standard, Feature, dan Spotlight.
 */
export function ArticleHeader({
  article,
  variant: _variant,
  sharePath,
}: {
  article: ArticleView;
  variant: "standard" | "feature" | "spotlight";
  sharePath: string;
}) {
  return (
    <header className="mx-auto mt-5 w-full max-w-[43rem] px-[22px] sm:px-6 md:mt-7">
      <div className="mx-auto max-w-[40rem] text-left">
        {article.section && (
          <Link
            href={sectionHref(article.section)}
            className="link-underline inline-block font-sans text-[0.75rem] leading-tight font-semibold tracking-[0.08em] text-brand uppercase"
          >
            {article.section.name}
          </Link>
        )}
        <h1 className="font-serif mt-2 text-left text-[1.625rem] leading-[1.2] font-semibold tracking-[-0.012em] text-[#171717] md:text-[1.9375rem] md:leading-[1.2]">
          {article.title}
        </h1>
        {article.standfirst && (
          <p className="font-serif mt-2.5 text-left text-[1.015625rem] leading-[1.45] font-normal text-[#333333] md:mt-3 md:text-[1.21875rem] md:leading-[1.45]">
            {article.standfirst}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2.5 border-y border-[#DEDAD4] py-3 md:mt-5 md:flex-row md:items-center md:justify-between md:gap-4">
          <ArticleMetadata article={article} align="left" />
          <ShareArticle path={sharePath} title={article.title} compact />
        </div>
      </div>
    </header>
  );
}
