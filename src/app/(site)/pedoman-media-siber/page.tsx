import type { Metadata } from "next";

import { StaticPage } from "@/components/article/StaticPage";

export const metadata: Metadata = { title: "Pedoman Media Siber", alternates: { canonical: "/pedoman-media-siber" } };

export default function Page() {
  return <StaticPage title="Pedoman Media Siber" intro="SUMENEP – Mata Madura berpedoman pada Pedoman Pemberitaan Media Siber yang ditetapkan Dewan Pers." />;
}
