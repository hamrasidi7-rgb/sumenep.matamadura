import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArchiveView } from "@/components/article/ArchiveView";
import { getSection, getSections, listArticles } from "@/lib/content";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ halaman?: string }> };

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return (await getSections("rubrik")).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = await getSection("rubrik", (await params).slug);
  if (!section) return {};
  return {
    title: section.name,
    description: section.description,
    alternates: { canonical: `/rubrik/${section.slug}` },
  };
}

export default async function RubrikPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const section = await getSection("rubrik", slug);
  if (!section) notFound();
  const page = Number((await searchParams).halaman ?? 1);
  const result = await listArticles({ kind: "rubrik", section: slug, page });
  return (
    <ArchiveView
      eyebrow="Rubrik"
      title={section.name}
      description={section.description}
      result={result}
      basePath={`/rubrik/${slug}`}
      empty="Belum ada tulisan di rubrik ini."
      showSection={false}
    />
  );
}
