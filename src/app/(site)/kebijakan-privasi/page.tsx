import type { Metadata } from "next";

import { StaticPage } from "@/components/article/StaticPage";

export const metadata: Metadata = { title: "Kebijakan Privasi", alternates: { canonical: "/kebijakan-privasi" } };

export default function Page() {
  return <StaticPage title="Kebijakan Privasi" intro="Penjelasan tentang data yang dikumpulkan saat Anda membaca SUMENEP – Mata Madura dan cara kami menggunakannya." />;
}
