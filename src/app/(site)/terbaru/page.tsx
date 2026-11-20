import type { Metadata } from "next";

import { ArchiveView } from "@/components/article/ArchiveView";
import { listArticles } from "@/lib/content";

export const metadata: Metadata = {
  title: "Artikel Terbaru",
  description: "Tulisan terbaru dari SUMENEP – Mata Madura.",
  alternates: { canonical: "/terbaru" },
};

export default async function TerbaruPage({ searchParams }: { searchParams: Promise<{ halaman?: string }> }) {
  const page = Number((await searchParams).halaman ?? 1);
  return <ArchiveView title="Artikel Terbaru" description="Semua tulisan, dari yang paling baru." result={await listArticles({ page })} basePath="/terbaru" />;
}
