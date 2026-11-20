import type { MediaAsset } from "@/content/types";
import { MediaImage } from "@/components/ui/MediaImage";

import { ImageCaption, captionText } from "./ImageCaption";

/**
 * Figure with caption + credit. The image is a button that opens the lightbox
 * (ArticleLightbox listens for [data-lightbox]), so it is keyboard accessible.
 */
export function ArticleImage({
  image,
  sizes,
  ratio,
  eager = false,
  rounded = true,
  group = "artikel",
  caption = true,
  className = "",
  captionClassName = "",
}: {
  image: MediaAsset;
  sizes: string;
  ratio?: string;
  eager?: boolean;
  rounded?: boolean;
  group?: string;
  caption?: boolean;
  className?: string;
  captionClassName?: string;
}) {
  return (
    <figure className={className}>
      <button
        type="button"
        data-lightbox=""
        data-group={group}
        data-src={image.fullSrc ?? image.src}
        data-alt={image.alt}
        data-caption={captionText(image.caption, image.credit)}
        className="block w-full cursor-zoom-in"
        aria-label={`Perbesar gambar: ${image.alt}`}
      >
        <MediaImage media={image} ratio={ratio ?? `${image.width}/${image.height}`} sizes={sizes} eager={eager} rounded={rounded} />
      </button>
      {caption && <ImageCaption caption={image.caption} credit={image.credit} className={captionClassName} />}
    </figure>
  );
}
