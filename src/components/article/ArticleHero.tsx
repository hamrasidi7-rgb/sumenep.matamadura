import Image from "next/image";
import Link from "next/link";

import { sectionHref } from "@/content/sections";
import type { ArticleView } from "@/lib/content";

import { ArticleImage } from "./ArticleImage";
import { ImageCaption, captionText } from "./ImageCaption";

/** Hero image for Standard (column) and Feature (wide) templates. */
export function ArticleHero({ article, variant }: { article: ArticleView; variant: "column" | "wide" }) {
  return (
    <div className="container-site mt-6 md:mt-8">
      <div className={`mx-auto ${variant === "wide" ? "max-w-[70rem]" : "max-w-[62rem]"}`}>
        <ArticleImage
          image={article.hero}
          ratio="16/9"
          eager
          sizes={variant === "wide" ? "(min-width: 1280px) 1120px, 100vw" : "(min-width: 1024px) 992px, 100vw"}
          captionClassName={variant === "wide" ? "mx-auto max-w-[45rem] text-center" : "mx-auto max-w-[47.5rem]"}
        />
      </div>
    </div>
  );
}

/**
 * Spotlight hero: full-bleed image with the headline set over a bottom scrim
 * (needed for legibility on any photo). Caption and credit sit below.
 */
export function SpotlightHero({ article }: { article: ArticleView }) {
  const h = article.hero;
  return (
    <header>
      <div className="relative isolate flex h-[78svh] max-h-[46rem] min-h-[32rem] items-end overflow-hidden bg-ink md:h-[82vh] md:max-h-[54rem] md:min-h-[36rem]">
        <button
          type="button"
          data-lightbox=""
          data-group="artikel"
          data-src={h.fullSrc ?? h.src}
          data-alt={h.alt}
          data-caption={captionText(h.caption, h.credit)}
          aria-label={`Perbesar gambar: ${h.alt}`}
          className="absolute inset-0 -z-10 cursor-zoom-in"
        >
          <Image
            src={h.src}
            alt={h.alt}
            fill
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            unoptimized={h.src.endsWith(".svg")}
            className="object-cover"
          />
        </button>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[78%] bg-gradient-to-t from-ink via-ink/75 to-transparent" />
        <div className="container-site pointer-events-none pb-9 md:pb-14">
          <div className="pointer-events-auto max-w-[56rem]">
            {article.section && (
              <Link
                href={sectionHref(article.section)}
                className="inline-flex min-h-8 items-center rounded-full bg-brand px-3 font-sans text-[0.75rem] font-semibold tracking-[0.1em] text-white uppercase"
              >
                {article.section.name}
              </Link>
            )}
            <h1 className="font-display mt-3 text-[clamp(1.875rem,8.6vw,2.25rem)] leading-[1.06] font-bold tracking-[-0.02em] text-balance text-white md:text-[2.75rem] xl:text-[3.5rem]">
              {article.title}
            </h1>
            <p className="font-display mt-3 max-w-[44rem] text-[1.1875rem] leading-[1.42] text-white/90 md:mt-4 md:text-[1.375rem] xl:text-[1.625rem]">
              {article.standfirst}
            </p>
          </div>
        </div>
      </div>
      <div className="container-site">
        <ImageCaption caption={h.caption} credit={h.credit} className="mx-auto max-w-[45rem]" />
      </div>
    </header>
  );
}
