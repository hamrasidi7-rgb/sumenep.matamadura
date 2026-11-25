import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ArticleTemplate } from "@/components/article/templates";
import { buildArticleMetadata } from "@/lib/article-social";
import { getArticle, getArticleRedirect, getRelatedArticles } from "@/lib/content";
import { SITE } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

// Rendered per request (docs/06-cache-seo.md): the HTML is never kept by the
// CDN, so a change made in the CMS is never served stale for long. The data
// itself comes from the Next.js data cache (tag "articles").
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  if (!a) return {};
  return buildArticleMetadata(a, SITE);
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
