import type { TimelineEvent } from "@/content/types";

export function ArticleTimeline({ title, events }: { title?: string; events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <figure className="my-10 rounded-xl bg-warm px-5 py-6 md:px-7">
      {title && (
        <figcaption className="font-display mb-5 text-[1.1875rem] font-bold text-ink md:text-[1.3125rem]">{title}</figcaption>
      )}
      <ol className="relative ml-1.5 border-l-2 border-brand/25">
        {events.map((e, i) => (
          <li key={i} className="relative pb-6 pl-6 last:pb-0">
            <span aria-hidden className="absolute top-[0.35rem] -left-[0.45rem] size-3 rounded-full bg-brand ring-4 ring-warm" />
            <p className="font-sans text-[0.75rem] font-semibold tracking-[0.08em] text-brand uppercase">{e.date}</p>
            <p className="font-display mt-0.5 text-[1.125rem] leading-snug font-bold text-ink">{e.title}</p>
            {e.description && (
              <p className="mt-1 font-serif text-[0.9375rem] leading-relaxed text-muted md:text-base">{e.description}</p>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}
