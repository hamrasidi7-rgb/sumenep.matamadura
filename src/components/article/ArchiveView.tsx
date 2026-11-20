import Link from "next/link";

import { ArticleRow } from "@/components/article/ArticleRow";
import { Pagination } from "@/components/article/Pagination";
import type { ArticleView, Paginated } from "@/lib/content";

/** Shared layout for kanal, rubrik, penulis, terbaru, pilihan and search results. */
export function ArchiveView({
  eyebrow,
  title,
  description,
  result,
  basePath,
  query,
  empty = "Belum ada tulisan di sini.",
  showSection = true,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  result: Paginated<ArticleView>;
  basePath: string;
  query?: Record<string, string>;
  empty?: string;
  showSection?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="container-site pt-8 md:pt-12">
      <header className="max-w-3xl">
        <nav aria-label="Breadcrumb" className="meta">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="link-underline inline-block py-1">
                Beranda
              </Link>
            </li>
            {eyebrow && (
              <>
                <li aria-hidden>/</li>
                <li>{eyebrow}</li>
              </>
            )}
          </ol>
        </nav>
        <h1 className="font-display mt-3 text-[2.125rem] leading-[1.08] font-bold tracking-[-0.015em] text-ink md:text-5xl">{title}</h1>
        {description && <p className="font-display mt-3 text-[1.1875rem] leading-snug text-muted md:text-[1.375rem]">{description}</p>}
        {children}
      </header>

      <div className="mt-6 border-t-2 border-ink md:mt-10 xl:max-w-[52rem]">
        {result.items.length === 0 ? (
          <p className="py-10 font-serif text-lg text-muted">{empty}</p>
        ) : (
          <ul>
            {result.items.map((a) => (
              <li key={a.slug} className="border-b border-line py-5 md:py-7">
                <ArticleRow article={a} headingLevel={2} showSection={showSection} />
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath={basePath} page={result.page} totalPages={result.totalPages} query={query} />
      </div>
    </div>
  );
}
