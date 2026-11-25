import type { Metadata } from "next";

import { AuthorManager } from "@/components/admin/authors/AuthorManager";
import { MediaProvider } from "@/components/admin/editor/MediaContext";
import { listAuthorsForAdmin } from "@/server/authors/service";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Penulis" };
export const dynamic = "force-dynamic";

export default async function AuthorsPage() {
  await requireAdmin();
  const { authors, avatarMedia } = await listAuthorsForAdmin(getDb());

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">Penulis</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Kelola profil byline redaksi dan kontributor untuk artikel SUMENEP (bukan akun login CMS).
        </p>
      </div>

      <div className="mt-6">
        <MediaProvider initial={avatarMedia}>
          <AuthorManager authors={authors} />
        </MediaProvider>
      </div>
    </main>
  );
}
