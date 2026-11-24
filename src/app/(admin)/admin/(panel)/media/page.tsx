import type { Metadata } from "next";

import { PaginationNav } from "@/components/admin/PaginationNav";
import { MediaLibraryClient } from "@/components/admin/media/MediaLibraryClient";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { buildMediaHref, listMediaLibrary, parseMediaQuery } from "@/server/media/library";

export const metadata: Metadata = { title: "Media Library" };
export const dynamic = "force-dynamic";

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const query = parseMediaQuery(raw);
  const data = await listMediaLibrary(getDb(), query);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">
          Media Library
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Kelola pustaka foto redaksi, folder penyimpanan, keterangan alt/kredit, serta pemeriksaan pemakaian sebelum menghapus berkas.
        </p>
      </div>

      <div className="mt-6">
        <MediaLibraryClient
          data={data}
          pagination={
            <PaginationNav
              page={data.page}
              pages={data.pages}
              total={data.filteredTotal}
              perPage={data.perPage}
              noun="gambar"
              hrefForPage={(nextPage) => buildMediaHref({ ...data.query, page: nextPage })}
            />
          }
        />
      </div>
    </main>
  );
}
