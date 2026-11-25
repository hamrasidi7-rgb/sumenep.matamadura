import Image from "next/image";

import type { MediaAsset } from "@/content/types";

/**
 * Responsive image in a fixed-ratio frame (no layout shift). Raster images are
 * optimised by next/image (AVIF/WebP + srcset); SVG illustrations are served
 * as-is.
 */
export function MediaImage({
  media,
  ratio = "16/10",
  sizes = '100vw',
  eager = false,
  rounded = true,
  className = "",
}: {
  media: MediaAsset;
  ratio?: string;
  sizes?: string;
  eager?: boolean;
  rounded?: boolean;
  className?: string;
}) {
  const isUnoptimized = media.src.endsWith(".svg") || media.src.startsWith("/media/");
  return (
    <div
      className={`relative overflow-hidden bg-warm ${rounded ? "rounded-[var(--radius-media)]" : ""} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={media.src}
        alt={media.alt}
        fill
        sizes={sizes}
        unoptimized={isUnoptimized}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        className="object-cover"
      />
    </div>
  );
}
