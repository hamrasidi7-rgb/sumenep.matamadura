import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Section title with the red slanted mark and an optional "Lihat Semua" link. */
export function SectionHeading({
  id,
  title,
  href,
  linkLabel = "Lihat Semua",
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id={id} className="font-display flex items-center gap-3 text-[1.625rem] leading-none font-bold tracking-[-0.01em] md:text-[2rem]">
        <span aria-hidden className="inline-block h-[0.95em] w-[0.32em] -skew-x-[18deg] rounded-[1px] bg-brand" />
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="font-display group -mr-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[0.9375rem] font-semibold whitespace-nowrap text-brand md:text-base"
        >
          {linkLabel}
          <ArrowRight aria-hidden className="size-[1.15em] transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          <span className="sr-only"> {title}</span>
        </Link>
      )}
    </div>
  );
}
