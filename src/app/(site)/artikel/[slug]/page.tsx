import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ArticleTemplate } from "@/components/article/templates";
import { getArticle, getArticleRedirect, getRelatedArticles } from "@/lib/content";

type Props = { params: Promise<{ slug: string }> };

// Rendered per request (docs/06-cache-seo.md): the HTML is never kept by the
// CDN, so a change made in the CMS is never served stale for long. The data
// itself comes from the Next.js data cache (tag "articles").
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  if (!a) return {};
  const title = a.seo?.title || a.title;
  const description = a.seo?.description || a.standfirst;
  const og = a.seo?.ogImage ?? (a.hero.src.endsWith(".svg") ? undefined : a.hero);
  return {
    title,
    description,
    alternates: { canonical: a.seo?.canonicalUrl || `/artikel/${a.slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      publishedTime: a.publishedAt,
      authors: [a.author.name],
      images: og ? [{ url: og.src, width: og.width, height: og.height, alt: og.alt }] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) {
    // A renamed CMS article keeps its old address: 301 to the current slug.
    const current = await getArticleRedirect(slug);
    if (current) permanentRedirect(`/artikel/${current}`);
    notFound();
  }
  const related = await getRelatedArticles(a, 3);
  return <ArticleTemplate article={a} related={related} />;
}
