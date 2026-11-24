import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleEditor } from "@/components/admin/articles/ArticleEditor";
import { articleForEditor, editorOptions } from "@/server/articles/queries";
import { revisionList } from "@/server/articles/service";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Sunting artikel" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const [data, options, revisions] = await Promise.all([articleForEditor(db, id), editorOptions(db), revisionList(db, id)]);
  if (!data) notFound();
  return (
    <main>
      <ArticleEditor
        initial={data.article}
        media={data.media}
        options={options}
        defaultAuthorId={null}
        revisions={revisions.map((r) => ({ id: r.id.toString(), version: r.version, reason: r.reason, createdAt: r.createdAt.toISOString() }))}
      />
    </main>
  );
}
