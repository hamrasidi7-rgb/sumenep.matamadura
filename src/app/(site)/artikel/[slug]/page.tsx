import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleTemplate } from "@/components/article/templates";
import { getAllArticleSlugs, getArticle, getRelatedArticles } from "@/lib/content";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getAllArticleSlugs()).map((slug) => ({ slug }));
}

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
  const a = await getArticle((await params).slug);
  if (!a) notFound();
  const related = await getRelatedArticles(a, 3);
  return <ArticleTemplate article={a} related={related} />;
}
