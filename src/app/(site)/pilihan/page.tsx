import type { Metadata } from "next";

import { ArchiveView } from "@/components/article/ArchiveView";
import { getFeaturedSlugs, listArticles } from "@/lib/content";

export const metadata: Metadata = {
  title: "Tulisan Pilihan",
  description: "Tulisan pilihan redaksi SUMENEP – Mata Madura.",
  alternates: { canonical: "/pilihan" },
};

export default async function PilihanPage({ searchParams }: { searchParams: Promise<{ halaman?: string }> }) {
  const page = Number((await searchParams).halaman ?? 1);
  const result = await listArticles({ slugs: await getFeaturedSlugs(), page });
  return <ArchiveView title="Tulisan Pilihan" description="Dipilih redaksi untuk dibaca lebih dulu." result={result} basePath="/pilihan" />;
}
