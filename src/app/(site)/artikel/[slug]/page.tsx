import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleRow } from "@/components/article/ArticleRow";
import { ArticleMeta } from "@/components/ui/ArticleMeta";
import { AuthorAvatar } from "@/components/ui/AuthorAvatar";
import { MediaImage } from "@/components/ui/MediaImage";
import { sectionHref } from "@/content/sections";
import { getAllArticleSlugs, getArticle, listArticles } from "@/lib/content";
import { formatDateLong } from "@/lib/format";

// Tahap 3: a clean Standard layout so every homepage link resolves.
// Tahap 4 replaces this with the Standard / Feature / Spotlight templates
// (reading progress, table of contents, share, lightbox, rich blocks).

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getAllArticleSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  if (!a) return {};
  return {
    title: a.title,
    description: a.standfirst,
    alternates: { canonical: `/artikel/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.standfirst,
      publishedTime: a.publishedAt,
      authors: [a.author.name],
      images: a.hero.src.endsWith(".svg") ? undefined : [{ url: a.hero.src, width: a.hero.width, height: a.hero.height, alt: a.hero.alt }],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) notFound();

  const related = (await listArticles({ kind: "kanal", section: a.kanal, perPage: 4 })).items
    .filter((x) => x.slug !== a.slug)
    .slice(0, 3);
  const fallback = related.length ? related : (await listArticles({ perPage: 4 })).items.filter((x) => x.slug !== a.slug).slice(0, 3);

  return (
    <article className="pt-6 md:pt-10">
      <header className="container-site">
        <div className="mx-auto max-w-[47.5rem]">
          <nav aria-label="Breadcrumb" className="meta">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="link-underline inline-block py-1">
                  Beranda
                </Link>
              </li>
              {a.section && (
                <>
                  <li aria-hidden>/</li>
                  <li>
                    <Link href={sectionHref(a.section)} className="link-underline inline-block py-1">
                      {a.section.name}
                    </Link>
                  </li>
                </>
              )}
            </ol>
          </nav>
          {a.section && (
            <Link href={sectionHref(a.section)} className="label-section link-underline mt-5 inline-block md:text-base">
              {a.section.name}
            </Link>
          )}
          <h1 className="font-display mt-1.5 text-[clamp(1.875rem,8.2vw,2.25rem)] leading-[1.08] font-bold tracking-[-0.018em] text-balance md:text-[2.75rem] xl:text-[3.25rem]">
            {a.title}
          </h1>
          <p className="font-display mt-3 text-[1.1875rem] leading-[1.45] text-muted md:mt-4 md:text-[1.375rem] xl:text-[1.5rem]">{a.standfirst}</p>
          <div className="mt-5 flex items-center gap-3 border-y border-line py-3.5">
            <AuthorAvatar author={a.author} size={44} />
            <div className="min-w-0">
              <p className="font-sans text-[0.9375rem] text-ink">
                Oleh{" "}
                <Link href={`/penulis/${a.author.slug}`} className="link-underline font-semibold">
                  {a.author.name}
                </Link>
              </p>
              <p className="sr-only">Diterbitkan {formatDateLong(a.publishedAt)}</p>
              <ArticleMeta publishedAt={a.publishedAt} readingMinutes={a.readingMinutes} />
            </div>
          </div>
        </div>
      </header>

      <figure className="container-site mt-6 md:mt-8">
        <div className="mx-auto max-w-[62rem]">
          <MediaImage media={a.hero} ratio="16/9" eager sizes="(min-width: 1024px) 992px, 100vw" />
          {(a.hero.caption || a.hero.credit) && (
            <figcaption className="meta mx-auto mt-2.5 max-w-[47.5rem]">
              {a.hero.caption} {a.hero.credit && <span className="text-muted/80">({a.hero.credit})</span>}
            </figcaption>
          )}
        </div>
      </figure>

      <div className="container-site mt-8 md:mt-10">
        <div className="mx-auto max-w-[45rem] font-serif text-[1.0625rem] leading-[1.8] text-ink md:text-[1.1875rem] md:leading-[1.85]">
          {a.isDemo && (
            <p className="mb-7 rounded-lg border-l-4 border-brand bg-blush px-4 py-3 font-sans text-sm leading-relaxed">
              <strong>Artikel contoh.</strong> Halaman ini memperlihatkan tata letak dan bukan berita faktual.
            </p>
          )}
          {a.body.map((b, i) => {
            switch (b.type) {
              case "heading":
                return b.level === 2 ? (
                  <h2 key={i} className="font-display mt-10 mb-3 text-[1.625rem] leading-tight font-bold md:text-[1.875rem]">
                    {b.text}
                  </h2>
                ) : (
                  <h3 key={i} className="font-display mt-8 mb-2 text-[1.3125rem] leading-tight font-bold">
                    {b.text}
                  </h3>
                );
              case "quote":
                return (
                  <blockquote key={i} className="font-display my-8 border-l-4 border-brand pl-5 text-[1.375rem] leading-snug italic">
                    {b.text}
                    {b.cite && <cite className="meta mt-2 block not-italic">{b.cite}</cite>}
                  </blockquote>
                );
              case "image":
                return (
                  <figure key={i} className="my-8">
                    <MediaImage media={b.image} sizes="(min-width: 768px) 720px, 100vw" />
                    {b.image.caption && <figcaption className="meta mt-2">{b.image.caption}</figcaption>}
                  </figure>
                );
              default:
                return (
                  <p key={i} className="mb-6">
                    {b.text}
                  </p>
                );
            }
          })}
        </div>
      </div>

      {fallback.length > 0 && (
        <aside aria-labelledby="artikel-terkait" className="container-site mt-14 md:mt-20">
          <div className="mx-auto max-w-[52rem] border-t-2 border-ink pt-5">
            <h2 id="artikel-terkait" className="font-display text-[1.625rem] font-bold md:text-[2rem]">
              Artikel terkait
            </h2>
            <ul>
              {fallback.map((r) => (
                <li key={r.slug} className="border-b border-line py-5 last:border-b-0">
                  <ArticleRow article={r} />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </article>
  );
}
