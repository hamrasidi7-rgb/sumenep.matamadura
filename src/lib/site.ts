export const SITE = {
  name: "SUMENEP – Mata Madura",
  shortName: "SUMENEP",
  tagline: "Catatan, Berita, dan Perspektif tentang Sumenep",
  description:
    "SUMENEP – Mata Madura: media editorial tentang pemerintahan, pembangunan, pendidikan, kesehatan, ekonomi, dan kepulauan Kabupaten Sumenep.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200").replace(/\/$/, ""),
  locale: "id_ID",
  parentSite: { name: "Mata Madura", url: "https://matamaduranews.com" },
} as const;

/** Only "production" may be indexed. Every other environment is staging. */
export const IS_PRODUCTION_SITE = process.env.NEXT_PUBLIC_SITE_ENV === "production";

export const FOOTER_LINKS = [
  { href: "/tentang-kami", label: "Tentang Kami" },
  { href: "/kontak-redaksi", label: "Kontak Redaksi" },
  { href: "/pedoman-media-siber", label: "Pedoman Media Siber" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
] as const;
