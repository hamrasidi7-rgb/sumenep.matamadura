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
  variant,
  sharePath,
}: {
  article: ArticleView;
  variant: "standard" | "feature" | "spotlight";
  sharePath: string;
}) {
  const editorial = variant === "feature" || variant === "spotlight";
  return (
    <header className="container-site mt-6 md:mt-8">
      <div className="mx-auto max-w-[45rem] text-left">
        {article.section && (
          <Link
            href={sectionHref(article.section)}
            className="label-section link-underline inline-block text-xs tracking-[0.05em] uppercase md:text-sm"
          >
            {article.section.name}
          </Link>
        )}
        <h1
          className={`font-serif mt-2.5 text-left font-bold text-[#252525] ${
            editorial
              ? "text-[clamp(1.9375rem,7.8vw,2.375rem)] leading-[1.12] tracking-[-0.015em] md:text-[2.75rem] xl:text-[3.375rem]"
              : "text-[clamp(1.875rem,7.5vw,2.25rem)] leading-[1.14] tracking-[-0.015em] md:text-[2.625rem] xl:text-[3.125rem]"
          }`}
        >
          {article.title}
        </h1>
        {article.standfirst && (
          <p className="font-serif mt-3 text-left text-[1.125rem] leading-[1.5] font-normal text-[#4a4a4a] md:mt-4 md:text-[1.375rem] xl:text-[1.5rem] md:leading-[1.45]">
            {article.standfirst}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3.5 border-y border-line py-4 md:mt-6 md:flex-row md:items-center md:justify-between md:gap-6">
          <ArticleMetadata article={article} align="left" />
          <ShareArticle path={sharePath} title={article.title} compact />
        </div>
      </div>
    </header>
  );
}
