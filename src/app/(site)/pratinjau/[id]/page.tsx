import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleTemplate } from "@/components/article/templates";
import { STATE_LABEL, articleState } from "@/server/articles/status";
import { articleViewForPreview } from "@/server/articles/view";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

// Admin preview: the saved article in the real SUMENEP template, inside the
// public site layout — whatever its state (draft, scheduled, archived, trash).
// Never public: requireAdmin() here (proxy.ts also filters /pratinjau), and
// never indexed (meta robots + X-Robots-Tag from proxy.ts).
// Adapted from Busacare app/admin/(dashboard)/berita/pratinjau/[id]/page.tsx.

export const metadata: Metadata = { title: "Pratinjau", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const found = await articleViewForPreview(getDb(), id);
  if (!found) notFound();
  const state = articleState(found.article);

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950" role="status">
        <div className="container-site flex flex-wrap items-center justify-between gap-2">
          <p>
            <strong className="mr-2 rounded bg-amber-600 px-1.5 py-0.5 text-xs text-white">PRATINJAU</strong>
            Status: {STATE_LABEL[state]}. Menampilkan versi yang terakhir disimpan. Halaman ini hanya untuk Admin dan tidak diindeks.
          </p>
          <a href={`/admin/artikel/${id}`} className="font-semibold underline">Kembali ke editor</a>
        </div>
      </div>
      <ArticleTemplate article={found.view} related={[]} />
    </>
  );
}
