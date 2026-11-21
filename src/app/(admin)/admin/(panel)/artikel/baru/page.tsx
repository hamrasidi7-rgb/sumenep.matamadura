import type { Metadata } from "next";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { ArticleEditor } from "@/components/admin/articles/ArticleEditor";
import { Notice } from "@/components/admin/Notice";
import { editorOptions } from "@/server/articles/queries";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Tulis artikel" };

// A new article is stored on the first save (autosave once a title exists),
// so abandoned empty forms never leave empty rows behind.
export default async function NewArticlePage() {
  const session = await requireAdmin();
  const options = await editorOptions(getDb());
  const redaksi = options.authors.find((a) => a.slug === "redaksi") ?? options.authors[0];
  return (
    <>
      <AdminHeader adminName={session.admin.name} current="/admin/artikel" />
      {options.authors.length === 0 ? (
        <main className="mx-auto max-w-3xl px-4 py-10">
          <Notice tone="error">Belum ada profil penulis. Jalankan <code>npm run db:seed</code> (penulis &ldquo;Redaksi&rdquo;) atau tambahkan penulis di Fase 5.</Notice>
        </main>
      ) : (
        <ArticleEditor initial={null} media={{}} options={options} defaultAuthorId={redaksi?.id ?? null} revisions={[]} />
      )}
    </>
  );
}
