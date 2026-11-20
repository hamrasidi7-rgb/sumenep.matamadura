import type { Metadata } from "next";

import { StaticPage } from "@/components/article/StaticPage";

export const metadata: Metadata = { title: "Kontak Redaksi", alternates: { canonical: "/kontak-redaksi" } };

export default function Page() {
  return <StaticPage title="Kontak Redaksi" intro="Informasi alamat dan kontak resmi redaksi SUMENEP – Mata Madura." />;
}
