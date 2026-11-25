import { isProductionIndexing } from "@/lib/seo-routing";

const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200").replace(/\/$/, "");

export const SITE = {
  name: "SUMENEP – Mata Madura",
  shortName: "SUMENEP",
  tagline: "Catatan, Berita, dan Perspektif tentang Sumenep",
  description:
    "SUMENEP – Mata Madura: media editorial tentang pemerintahan, pembangunan, pendidikan, kesehatan, ekonomi, dan kepulauan Kabupaten Sumenep.",
  url: RAW_SITE_URL,
  locale: "id_ID",
  parentSite: { name: "Mata Madura", url: "https://matamaduranews.com" },
} as const;

/** Only true when NEXT_PUBLIC_SITE_ENV="production" AND SITE.url is a public HTTPS domain. */
export const IS_PRODUCTION_SITE = isProductionIndexing(process.env.NEXT_PUBLIC_SITE_ENV, SITE.url);

export const FOOTER_LINKS = [
  { href: "/tentang-kami", label: "Tentang Kami" },
  { href: "/kontak-redaksi", label: "Kontak Redaksi" },
  { href: "/pedoman-media-siber", label: "Pedoman Media Siber" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
] as const;
