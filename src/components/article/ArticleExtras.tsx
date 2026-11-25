import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import { resolvePublicAuthor } from "@/lib/author";
import type { Author } from "@/content/types";

/** Shown above the body of every demo article. */
export function DemoNotice() {
  return (
    <p className="mb-8 rounded-lg border-l-4 border-brand bg-blush px-4 py-3 font-sans text-sm leading-relaxed text-ink">
      <strong>Artikel contoh.</strong> Halaman ini memperlihatkan tata letak dan bukan berita faktual.
    </p>
  );
}

export function AuthorBio({ author }: { author?: Partial<Author> | null }) {
  const resolved = resolvePublicAuthor(author);
  return (
    <section
      aria-label="Tentang penulis"
      data-testid="author-box"
      className="mt-12 rounded-sm border border-[#E6DFD3] border-t-2 border-t-[#A61B2B] bg-[#FAF6F0] p-5 sm:p-6 md:p-7"
    >
      <p className="font-sans text-[0.6875rem] font-semibold tracking-[0.14em] text-[#A61B2B] uppercase">
        Tentang Penulis
      </p>
      <div className="mt-3.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <Link
          href={`/penulis/${resolved.slug}`}
          tabIndex={-1}
          aria-hidden
          className="shrink-0 self-start rounded-full ring-1 ring-[#E6DFD3]"
        >
          <AuthorAvatar author={resolved} size={72} />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[1.25rem] leading-snug font-bold break-words text-[#252525] sm:text-[1.375rem]">
            <Link href={`/penulis/${resolved.slug}`} className="transition-colors hover:text-[#A61B2B] hover:underline underline-offset-4">
              {resolved.name}
            </Link>
          </h2>
          <p className="mt-0.5 font-sans text-sm font-medium text-[#5b5f66]">{resolved.role}</p>
          {resolved.bio && (
            <p className="mt-3 font-serif text-[1rem] leading-[1.6] text-[#252525] sm:text-[1.0625rem]">
              {resolved.bio}
            </p>
          )}
          <div className="mt-4 border-t border-[#E6DFD3] pt-3">
            <Link
              href={`/penulis/${resolved.slug}`}
              className="inline-flex min-h-11 items-center gap-1.5 font-sans text-sm font-semibold text-[#A61B2B] transition-colors hover:text-brand-deep hover:underline underline-offset-4"
            >
              Semua tulisan {resolved.name} <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Topics link to search (internal linking without thin tag pages). */
export function ArticleTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-10 flex flex-wrap items-center gap-2">
      <span className="mr-1 font-sans text-[0.8125rem] font-semibold text-muted">Topik:</span>
      {tags.map((t) => (
        <Link
          key={t}
          href={`/cari?q=${encodeURIComponent(t)}`}
          className="inline-flex min-h-9 items-center rounded-full bg-warm px-3.5 font-sans text-[0.8125rem] text-ink hover:bg-blush"
        >
          {t}
        </Link>
      ))}
    </div>
  );
}
