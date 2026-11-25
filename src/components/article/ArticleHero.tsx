import type { ArticleView } from "@/lib/content";

import { ArticleImage } from "./ArticleImage";

export type ArticleHeroVariant = "column" | "wide" | "spotlight";

const CONTAINER_WIDTH: Record<ArticleHeroVariant, string> = {
  column: "max-w-[62rem]",
  wide: "max-w-[70rem]",
  spotlight: "max-w-[74rem]",
};

const IMAGE_SIZES: Record<ArticleHeroVariant, string> = {
  column: "(min-width: 1024px) 992px, 100vw",
  wide: "(min-width: 1280px) 1120px, 100vw",
  spotlight: "(min-width: 1280px) 1184px, 100vw",
};

/**
 * Foto utama berita (featured image 16:10) sebagai elemen visual pertama
 * tepat di bawah header website, diikuti caption dan kredit foto di bawahnya.
 * Konsisten pada template Standard, Feature, dan Spotlight.
 */
export function ArticleHero({ article, variant }: { article: ArticleView; variant: ArticleHeroVariant }) {
  return (
    <div className="w-full md:container-site md:pt-6 xl:pt-8">
      <div className={`mx-auto ${CONTAINER_WIDTH[variant]}`}>
        <ArticleImage
          image={article.hero}
          ratio="16/10"
          eager
          rounded={false}
          mediaClassName="md:rounded-[var(--radius-media)]"
          sizes={IMAGE_SIZES[variant]}
          captionClassName="px-5 text-left md:px-0"
        />
      </div>
    </div>
  );
}

/** Alias Spotlight yang memakai pola foto-pertama 16:10 yang sama. */
export function SpotlightHero({ article }: { article: ArticleView }) {
  return <ArticleHero article={article} variant="spotlight" />;
}
