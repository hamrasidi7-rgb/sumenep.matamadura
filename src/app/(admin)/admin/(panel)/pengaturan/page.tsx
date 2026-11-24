import type { Metadata } from "next";

import { MediaProvider } from "@/components/admin/editor/MediaContext";
import { SettingsManager } from "@/components/admin/settings/SettingsManager";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { getCmsSettingsData } from "@/server/settings/service";

export const metadata: Metadata = { title: "Pengaturan Situs" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const data = await getCmsSettingsData(getDb());

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">
          Pengaturan CMS
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Kelola identitas portal, gambar berbagi bawaan, tautan media sosial, serta kurasi berita utama dan pita rubrik beranda.
        </p>
      </div>

      <div className="mt-6">
        <MediaProvider initial={data.mediaMap}>
          <SettingsManager data={data} />
        </MediaProvider>
      </div>
    </main>
  );
}
