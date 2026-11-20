import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import type { Author } from "@/content/types";

/** Shown above the body of every demo article. */
export function DemoNotice() {
  return (
    <p className="mb-8 rounded-lg border-l-4 border-brand bg-blush px-4 py-3 font-sans text-sm leading-relaxed text-ink">
      <strong>Artikel contoh.</strong> Halaman ini memperlihatkan tata letak dan bukan berita faktual.
    </p>
  );
}

export function AuthorBio({ author }: { author: Author }) {
  return (
    <section aria-label="Tentang penulis" className="mt-12 flex gap-4 border-y border-line py-6">
      <AuthorAvatar author={author} size={56} />
      <div className="min-w-0">
        <p className="font-sans text-[0.6875rem] font-semibold tracking-[0.14em] text-muted uppercase">Penulis</p>
        <p className="font-display mt-0.5 text-[1.25rem] leading-tight font-bold text-ink">{author.name}</p>
        <p className="font-sans text-sm text-muted">{author.role}</p>
        {author.bio && <p className="mt-2 font-serif text-[0.9375rem] leading-relaxed text-ink">{author.bio}</p>}
        <Link href={`/penulis/${author.slug}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-sans text-sm font-semibold text-brand">
          Tulisan lain dari {author.name} <ArrowRight aria-hidden className="size-4" />
        </Link>
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
