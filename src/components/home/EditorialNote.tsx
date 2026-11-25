import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { MediaImage } from "@/components/ui/MediaImage";
import type { EditorialNote as Note } from "@/content/types";
import type { ArticleView } from "@/lib/content";

/** Catatan Sumenep — the rubric that sets SUMENEP apart. A slim banner + optional rubric items. */
export function EditorialNote({ note, articles = [] }: { note: Note; articles?: ArticleView[] }) {
  return (
    <section aria-labelledby="catatan-sumenep" className="container-site mt-8 md:mt-14 xl:mt-16">
      <Link
        href={note.href}
        className="group flex items-center gap-3 bg-[var(--color-surface)] px-4 py-4 md:gap-5 md:px-6 md:py-5 xl:px-8 transition-colors hover:bg-[var(--color-bg)]"
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
        <div className="min-w-0 flex-1 text-left">
          <h2
            id="catatan-sumenep"
            className="font-display text-left text-[1.3125rem] leading-tight font-bold text-[var(--color-primary)] md:text-[1.875rem] xl:text-[2.125rem]"
          >
            {note.title}
          </h2>
          <span className="font-display mt-1 block text-left text-[0.9375rem] leading-snug text-ink italic md:text-lg xl:text-xl">
            {note.description}
          </span>
        </div>
        <ArrowRight
          aria-hidden
          className="size-6 shrink-0 text-brand transition-transform group-hover:translate-x-1 md:size-7"
          strokeWidth={2}
        />
      </Link>

      {articles.length > 0 && (
        <ul className="mt-6 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((a) => {
            const href = `/artikel/${a.slug}`;
            return (
              <li key={a.slug} className="border-b border-border pb-6 last:border-0">
                <Link href={href} className="block" aria-hidden tabIndex={-1}>
                  <MediaImage
                    media={a.hero}
                    ratio="16/10"
                    className="object-cover w-full h-full"
                  />
                </Link>
                <div className="mt-3 text-left">
                  <h3 className="font-display mt-1 text-left text-[clamp(1.125rem,4vw,1.5rem)] leading-[1.05] font-bold tracking-[-0.018em] text-[var(--color-text-primary)]">
                    <Link href={href} className="hover:text-brand-deep">
                      {a.title}
                    </Link>
                  </h3>
                  <p className="mt-2 text-left text-[var(--color-text-secondary)] font-sans text-base leading-[1.5]">
                    {a.standfirst}
                  </p>
                  <ArticleMeta
                    publishedAt={a.publishedAt}
                    readingMinutes={a.readingMinutes}
                    compact
                    className="mt-2"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
