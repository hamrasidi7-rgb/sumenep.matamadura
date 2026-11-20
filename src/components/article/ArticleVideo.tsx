"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import { videoEmbedUrl } from "@/lib/article-utils";

/**
 * Click-to-load video (YouTube via youtube-nocookie, or Vimeo with dnt=1).
 * Nothing from the video host loads until the reader presses play.
 */
export function ArticleVideo({
  provider,
  videoId,
  title,
  caption,
}: {
  provider: "youtube" | "vimeo";
  videoId: string;
  title: string;
  caption?: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="my-10">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-ink">
        {playing ? (
          <iframe
            src={videoEmbedUrl(provider, videoId)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex items-center justify-center"
            aria-label={`Putar video: ${title}`}
          >
            {provider === "youtube" && (
              // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, loaded lazily
              <img
                src={`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover opacity-75"
              />
            )}
            <span className="relative flex size-16 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform group-hover:scale-105">
              <Play aria-hidden className="ml-1 size-7" fill="currentColor" />
            </span>
          </button>
        )}
      </div>
      <figcaption className="meta mt-2">
        {title}
        {caption ? ` — ${caption}` : ""}
        {!playing && (
          <span className="block">Video dimuat dari {provider === "youtube" ? "YouTube" : "Vimeo"} setelah tombol putar ditekan.</span>
        )}
      </figcaption>
    </figure>
  );
}
