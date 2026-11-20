import { ListOrdered } from "lucide-react";

import type { TocEntry } from "@/lib/article-utils";

import { TocActiveTracker } from "./TocActiveTracker";

/**
 * Clickable table of contents built from the article's H2/H3 headings.
 * "sidebar": sticky column on wide screens with the current section marked.
 * "inline": collapsible block inside the text on phones and tablets.
 */
export function ArticleTableOfContents({ entries, variant }: { entries: TocEntry[]; variant: "sidebar" | "inline" }) {
  if (entries.length < 2) return null;

  const list = (
    <ol className={variant === "sidebar" ? "mt-3 space-y-0.5 border-l border-line" : "mt-3 space-y-1"}>
      {entries.map((e) => (
        <li key={e.id}>
          <a
            href={`#${e.id}`}
            data-toc-link={e.id}
            className={
              variant === "sidebar"
                ? `-ml-px block border-l-2 border-transparent py-1.5 font-sans text-[0.8125rem] leading-snug text-muted transition-colors hover:text-ink data-[active=true]:border-brand data-[active=true]:font-semibold data-[active=true]:text-ink ${
                    e.level === 3 ? "pl-6" : "pl-3.5"
                  }`
                : `flex min-h-11 items-center font-sans text-[0.9375rem] leading-snug text-ink hover:text-brand ${e.level === 3 ? "pl-4 text-muted" : "font-medium"}`
            }
          >
            {e.text}
          </a>
        </li>
      ))}
    </ol>
  );

  if (variant === "sidebar") {
    return (
      <nav aria-label="Daftar isi" className="sticky top-8">
        <p className="font-sans text-[0.6875rem] font-semibold tracking-[0.14em] text-brand uppercase">Daftar isi</p>
        {list}
        <TocActiveTracker ids={entries.map((e) => e.id)} />
      </nav>
    );
  }

  return (
    <nav aria-label="Daftar isi" className="not-prose my-8 rounded-xl border border-line bg-warm">
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-sans text-[0.9375rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <ListOrdered aria-hidden className="size-4 text-brand" />
            Daftar isi · {entries.filter((e) => e.level === 2).length} bagian
          </span>
          <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="border-t border-line px-4 pb-3">{list}</div>
      </details>
    </nav>
  );
}
