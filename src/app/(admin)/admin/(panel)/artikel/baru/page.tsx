import type { Metadata } from "next";
import Link from "next/link";

import { ArticleEditor } from "@/components/admin/articles/ArticleEditor";
import { Notice } from "@/components/admin/Notice";
import { editorOptions } from "@/server/articles/queries";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Tulis artikel" };

// A new article is stored on the first save (autosave once a title exists),
// so abandoned empty forms never leave empty rows behind.
export default async function NewArticlePage() {
  await requireAdmin();
  const options = await editorOptions(getDb());
  const redaksi = options.authors.find((a) => a.slug === "redaksi") ?? options.authors[0];
  if (options.authors.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Notice tone="error">
          Belum ada profil penulis aktif. Jalankan <code>npm run db:seed</code> atau tambahkan penulis melalui{" "}
          <Link href="/admin/penulis" className="font-semibold underline">Kelola Penulis</Link>.
        </Notice>
      </main>
    );
  }
  return (
    <main>
      <ArticleEditor initial={null} media={{}} options={options} defaultAuthorId={redaksi?.id ?? null} revisions={[]} />
    </main>
  );
}
