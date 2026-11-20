import type { Metadata } from "next";

import { StaticPage } from "@/components/article/StaticPage";

export const metadata: Metadata = { title: "Tentang Kami", alternates: { canonical: "/tentang-kami" } };

export default function Page() {
  return <StaticPage title="Tentang Kami" intro="SUMENEP – Mata Madura adalah media editorial tentang Kabupaten Sumenep, bagian dari jaringan Mata Madura." />;
}
