import Link from "next/link";

import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import type { ArticleView } from "@/lib/content";
import { formatDateLong, readingLabel } from "@/lib/format";

/** Byline (penulis, tanggal publikasi, dan waktu baca) dalam satu blok rapi dengan teks kecil abu sedang. */
export function ArticleMetadata({
  article,
  align = "left",
  tone = "default",
}: {
  article: ArticleView;
  align?: "left" | "center";
  tone?: "default" | "inverse";
}) {
  const muted = tone === "inverse" ? "text-white/75" : "text-[#666666]";
  const strong = tone === "inverse" ? "text-white" : "text-[#222222]";
  return (
    <div className={`flex items-center gap-2.5 ${align === "center" ? "justify-center text-left" : ""}`}>
      <AuthorAvatar author={article.author} size={34} />
      <div className="min-w-0 font-sans text-[0.75rem] leading-[1.4] font-normal md:text-[0.8125rem]">
        <p className={muted}>
          Oleh{" "}
          <Link href={`/penulis/${article.author.slug}`} rel="author" className={`link-underline font-semibold ${strong}`}>
            {article.author.name}
          </Link>
        </p>
        <p className={`mt-0.5 ${muted}`}>
          <time dateTime={article.publishedAt}>{formatDateLong(article.publishedAt)}</time>
          <span aria-hidden className="mx-1.5 opacity-70">
            ·
          </span>
          <span className="whitespace-nowrap">{readingLabel(article.readingMinutes)}</span>
        </p>
      </div>
    </div>
  );
}
