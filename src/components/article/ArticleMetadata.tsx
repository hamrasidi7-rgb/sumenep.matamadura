import { Clock } from "lucide-react";
import Link from "next/link";

import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import type { ArticleView } from "@/lib/content";
import { formatDateLong, readingLabel } from "@/lib/format";

/** Author, full publication date/time and reading time. */
export function ArticleMetadata({
  article,
  align = "left",
  tone = "default",
}: {
  article: ArticleView;
  align?: "left" | "center";
  tone?: "default" | "inverse";
}) {
  const muted = tone === "inverse" ? "text-white/80" : "text-muted";
  const strong = tone === "inverse" ? "text-white" : "text-ink";
  const updated =
    article.updatedAt && Date.parse(article.updatedAt) - Date.parse(article.publishedAt) > 60 * 60 * 1000 ? article.updatedAt : null;
  return (
    <div className={`flex items-center gap-3 ${align === "center" ? "justify-center text-left" : ""}`}>
      <AuthorAvatar author={article.author} size={44} />
      <div className="min-w-0">
        <p className={`font-sans text-[0.9375rem] leading-snug ${strong}`}>
          Oleh{" "}
          <Link href={`/penulis/${article.author.slug}`} rel="author" className="link-underline font-semibold">
            {article.author.name}
          </Link>
        </p>
        <p className={`mt-0.5 font-sans text-[0.8125rem] leading-snug md:text-sm ${muted}`}>
          <time dateTime={article.publishedAt}>{formatDateLong(article.publishedAt)}</time>
          <span aria-hidden className="mx-1.5 hidden opacity-60 md:inline">
            ·
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap md:inline-flex">
            <Clock aria-hidden className="size-[1.05em]" strokeWidth={1.75} />
            {readingLabel(article.readingMinutes)}
          </span>
          {updated && (
            <span className="block">
              Diperbarui <time dateTime={updated}>{formatDateLong(updated)}</time>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
