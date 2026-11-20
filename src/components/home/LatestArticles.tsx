import Link from "next/link";

import { sectionHref } from "@/content/sections";
import type { Section } from "@/content/types";
import { ArticleRow } from "@/components/article/ArticleRow";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ArticleView } from "@/lib/content";

/**
 * Artikel Terbaru — a short, quiet list. Desktop adds a typographic index of
 * the five editorial rubrics beside it (no cards, no widgets).
 */
export function LatestArticles({ articles, rubrics }: { articles: ArticleView[]; rubrics: Section[] }) {
  if (articles.length === 0) return null;
  return (
    <section aria-labelledby="artikel-terbaru" className="container-site mt-12 md:mt-16 xl:mt-20">
      <div className="xl:grid xl:grid-cols-12 xl:gap-14">
        <div className="xl:col-span-8">
          <SectionHeading id="artikel-terbaru" title="Artikel Terbaru" href="/terbaru" />
          <ul className="mt-1 md:mt-3">
            {articles.map((a) => (
              <li key={a.slug} className="border-b border-line py-5 last:border-b-0 md:py-7">
                <ArticleRow article={a} />
              </li>
            ))}
          </ul>
        </div>

        <aside aria-labelledby="indeks-rubrik" className="hidden xl:col-span-4 xl:block">
          <div className="sticky top-8 border-t-2 border-ink pt-5">
            <h2 id="indeks-rubrik" className="font-display text-[1.625rem] leading-none font-bold">
              Rubrik
            </h2>
            <ul className="mt-2">
              {rubrics.map((r) => (
                <li key={r.slug} className="border-b border-line last:border-b-0">
                  <Link href={sectionHref(r)} className="group block py-4">
                    <span className="font-display text-[1.25rem] leading-tight font-bold text-ink group-hover:text-brand">
                      {r.name}
                    </span>
                    <span className="mt-1 block font-serif text-[0.9375rem] leading-snug text-muted">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
