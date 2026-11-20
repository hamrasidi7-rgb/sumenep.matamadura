import { CalendarDays, Clock } from "lucide-react";

import { formatDate, readingLabel } from "@/lib/format";

/**
 * Date + reading time, compact and never dominant. `compact` (lists) drops the
 * dot separator so a wrap at 360 px yields two clean lines, not a dangling dot.
 */
export function ArticleMeta({
  publishedAt,
  readingMinutes,
  className = "",
  compact = false,
}: {
  publishedAt: string;
  readingMinutes: number;
  className?: string;
  compact?: boolean;
}) {
  const icon = "size-[1.1em] shrink-0";
  return (
    <p
      className={`flex flex-wrap items-center gap-y-1 font-sans leading-snug text-muted ${
        compact ? "gap-x-3.5 text-[0.78125rem] md:text-[0.8125rem]" : "gap-x-2.5 text-[0.8125rem] md:text-sm"
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <CalendarDays aria-hidden className={icon} strokeWidth={1.75} />
        <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
      </span>
      {!compact && (
        <span aria-hidden className="text-[#c4c7cc] select-none">
          ·
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Clock aria-hidden className={icon} strokeWidth={1.75} />
        {readingLabel(readingMinutes)}
      </span>
    </p>
  );
}
