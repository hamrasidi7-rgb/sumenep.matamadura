import type { ArticleView } from "@/lib/content";

import { ArticleImage } from "./ArticleImage";

export type ArticleHeroVariant = "column" | "wide" | "spotlight";

const CONTAINER_WIDTH: Record<ArticleHeroVariant, string> = {
  column: "max-w-[40rem]",
  wide: "max-w-[40rem]",
  spotlight: "max-w-[42rem]",
};

const IMAGE_SIZES: Record<ArticleHeroVariant, string> = {
  column: "(min-width: 768px) 640px, 100vw",
  wide: "(min-width: 768px) 640px, 100vw",
  spotlight: "(min-width: 768px) 672px, 100vw",
};

/**
 * Foto utama berita (featured image 16:10) sebagai elemen visual pertama
 * tepat di bawah header website, diikuti caption dan kredit foto di bawahnya.
 * Konsisten pada template Standard, Feature, dan Spotlight.
 */
export function ArticleHero({ article, variant }: { article: ArticleView; variant: ArticleHeroVariant }) {
  return (
    <div className="mx-auto w-full max-w-[43rem] px-[22px] pt-4 sm:px-6 md:pt-6 xl:pt-8">
      <div className={`mx-auto ${CONTAINER_WIDTH[variant]}`}>
        <ArticleImage
          image={article.hero}
          ratio="16/10"
          eager
          rounded={false}
          mediaClassName="rounded-[0.375rem]"
          sizes={IMAGE_SIZES[variant]}
          captionClassName="text-left"
        />
      </div>
    </div>
  );
}

/** Alias Spotlight yang memakai pola foto-pertama 16:10 yang sama. */
export function SpotlightHero({ article }: { article: ArticleView }) {
  return <ArticleHero article={article} variant="spotlight" />;
}
