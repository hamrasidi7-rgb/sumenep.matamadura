import type { Metadata } from "next";

import { SectionManager } from "@/components/admin/sections/SectionManager";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";
import { listSectionsForAdmin } from "@/server/sections/service";

export const metadata: Metadata = { title: "Kanal & Rubrik" };
export const dynamic = "force-dynamic";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const jenis = typeof params.jenis === "string" && params.jenis.toLowerCase() === "rubrik" ? "RUBRIK" : "KANAL";
  const { kanal, rubrik } = await listSectionsForAdmin(getDb());

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">Kanal &amp; Rubrik</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Kelola struktur taksonomi berita portal SUMENEP. Jenis seksi (Kanal/Rubrik) bersifat tetap setelah dibuat.
        </p>
      </div>

      <div className="mt-6">
        <SectionManager kanal={kanal} rubrik={rubrik} initialKind={jenis} />
      </div>
    </main>
  );
}
