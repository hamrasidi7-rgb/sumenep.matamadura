import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArchiveView } from "@/components/article/ArchiveView";
import { getAuthor, getAuthors, listArticles } from "@/lib/content";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ halaman?: string }> };

export async function generateStaticParams() {
  return (await getAuthors()).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = await getAuthor((await params).slug);
  if (!author) return {};
  return { title: author.name, description: author.bio, alternates: { canonical: `/penulis/${author.slug}` } };
}

export default async function PenulisPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const author = await getAuthor(slug);
  if (!author) notFound();
  const page = Number((await searchParams).halaman ?? 1);
  return (
    <ArchiveView
      eyebrow="Penulis"
      title={author.name}
      description={author.bio ?? author.role}
      result={await listArticles({ author: slug, page })}
      basePath={`/penulis/${slug}`}
    />
  );
}
