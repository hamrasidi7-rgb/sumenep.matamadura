import type { MediaAsset } from "@/content/types";

import { ArticleImage } from "./ArticleImage";

/** Photo gallery: first image large, the rest in a grid; every image opens the lightbox. */
export function ArticleGallery({ title, images, group = "galeri" }: { title?: string; images: MediaAsset[]; group?: string }) {
  if (images.length === 0) return null;
  return (
    <figure className="my-10">
      {title && <p className="font-display mb-3 text-[1.1875rem] font-bold text-ink md:text-[1.3125rem]">{title}</p>}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 max-md:[&>*:last-child:nth-child(even)]:col-span-2">
        {images.map((img, i) => (
          <ArticleImage
            key={`${img.src}-${i}`}
            image={img}
            group={group}
            ratio={i === 0 ? "16/9" : "4/3"}
            sizes={i === 0 ? "(min-width: 768px) 720px, 100vw" : "(min-width: 768px) 240px, 50vw"}
            className={i === 0 ? "col-span-2 md:col-span-3" : ""}
            captionClassName="line-clamp-2 text-[0.75rem] md:text-[0.8125rem]"
          />
        ))}
      </div>
      <figcaption className="meta mt-3">{images.length} foto · ketuk gambar untuk memperbesar.</figcaption>
    </figure>
  );
}
