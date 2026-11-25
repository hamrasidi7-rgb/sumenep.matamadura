import type { Metadata } from "next";
import Link from "next/link";

import { HeroManager } from "@/components/admin/hero/HeroManager";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { getHeroManagerData, parseHeroFilters } from "@/server/homepage/hero";

export const metadata: Metadata = { title: "Hero Utama" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function HeroPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const filters = parseHeroFilters(await searchParams);
  const data = await getHeroManagerData(getDb(), filters);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">
            Hero Utama
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pilih satu konten unggulan dari Berita, Catatan Sumenep, Feature, Opini, atau rubrik lain untuk tampil di posisi paling atas beranda.
          </p>
        </div>
        <Link href="/admin/pengaturan" className="admin-button-quiet shrink-0 text-sm">
          Kurasi Beranda Lain
        </Link>
      </div>

      <div className="mt-6">
        <HeroManager data={data} />
      </div>
    </main>
  );
}
