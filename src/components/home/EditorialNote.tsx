import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { EditorialNote as Note } from "@/content/types";

/** Catatan Sumenep — the rubric that sets SUMENEP apart. A slim banner. */
export function EditorialNote({ note }: { note: Note }) {
  return (
    <section aria-labelledby="catatan-sumenep" className="container-site mt-8 md:mt-14 xl:mt-16">
      <Link
        href={note.href}
        className="group flex items-center gap-3 rounded-xl bg-blush px-3.5 py-3.5 transition-colors hover:bg-[#f4e5e0] md:gap-7 md:px-8 md:py-6 xl:px-10"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG */}
        <img
          src="/illustrations/mercusuar.svg"
          alt=""
          width={160}
          height={120}
          loading="lazy"
          className="h-auto w-[4.25rem] shrink-0 md:w-32 xl:w-36"
        />
        <span aria-hidden className="w-px self-stretch bg-brand/35" />
        <div className="min-w-0 flex-1">
          <h2
            id="catatan-sumenep"
            className="font-display text-[1.3125rem] leading-tight font-bold text-brand italic md:text-[1.875rem] xl:text-[2.125rem]"
          >
            {note.title}
          </h2>
          <span className="font-display mt-1 block text-[0.9375rem] leading-snug text-ink italic md:text-lg xl:text-xl">
            {note.description}
          </span>
        </div>
        <ArrowRight
          aria-hidden
          className="size-6 shrink-0 text-brand transition-transform group-hover:translate-x-1 md:size-7"
          strokeWidth={2}
        />
      </Link>
    </section>
  );
}
