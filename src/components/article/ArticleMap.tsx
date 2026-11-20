import { ExternalLink } from "lucide-react";

import { osmEmbedUrl, osmLink } from "@/lib/article-utils";

/** OpenStreetMap embed (no API key, no ad tracking), lazy-loaded. */
export function ArticleMap({
  title,
  latitude,
  longitude,
  zoom,
  marker = true,
  caption,
}: {
  title?: string;
  latitude: number;
  longitude: number;
  zoom: number;
  marker?: boolean;
  caption?: string;
}) {
  return (
    <figure className="my-10">
      {title && <p className="font-display mb-3 text-[1.1875rem] font-bold text-ink md:text-[1.3125rem]">{title}</p>}
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-warm md:aspect-[16/10]">
        <iframe
          src={osmEmbedUrl(latitude, longitude, zoom, marker)}
          title={`Peta${title ? `: ${title}` : ""}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="absolute inset-0 size-full border-0"
        />
      </div>
      <figcaption className="meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {caption && <span>{caption}</span>}
        <a
          href={osmLink(latitude, longitude, zoom)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-underline inline-flex min-h-6 items-center gap-1 font-medium text-ink"
        >
          Buka peta lebih besar <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </figcaption>
    </figure>
  );
}
