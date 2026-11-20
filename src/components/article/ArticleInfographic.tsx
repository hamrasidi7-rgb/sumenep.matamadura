import type { MediaAsset } from "@/content/types";
import { formatDate } from "@/lib/format";

import { ArticleImage } from "./ArticleImage";

/** Infographic with explicit provenance: source and data date are always stated. */
export function ArticleInfographic({
  title,
  image,
  source,
  dataDate,
  note,
}: {
  title: string;
  image: MediaAsset;
  source?: string;
  dataDate?: string;
  note?: string;
}) {
  const dateLabel = dataDate ? (Number.isNaN(Date.parse(dataDate)) ? dataDate : formatDate(dataDate)) : null;
  return (
    <div className="my-10">
      <p className="font-sans text-[0.75rem] font-semibold tracking-[0.12em] text-brand uppercase">Infografik</p>
      <p className="font-display mt-1 mb-3 text-[1.25rem] leading-snug font-bold text-ink md:text-[1.4375rem]">{title}</p>
      <div className="mx-auto max-w-[32rem]">
        <ArticleImage image={image} sizes="(min-width: 768px) 512px, 100vw" caption={false} />
      </div>
      <p className="meta mt-3">
        Sumber: {source ?? "tidak dicantumkan"} · Tanggal data: {dateLabel ?? "tidak berlaku"}
        {note ? <span className="block">{note}</span> : null}
      </p>
    </div>
  );
}
