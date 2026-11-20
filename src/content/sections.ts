import type { Section } from "./types";

// Lima kanal utama + lima rubrik editorial. Urutan = urutan di navigasi.
// Pada Tahap 5 daftar ini dipindah ke koleksi CMS "sections" dengan isi awal
// yang sama, sehingga redaksi dapat mengubah nama dan deskripsi tanpa kode.
export const SECTIONS: Section[] = [
  {
    slug: "politik-pemerintahan",
    kind: "kanal",
    name: "Politik & Pemerintahan",
    description: "Kebijakan, anggaran, dan jalannya pemerintahan daerah dari dekat.",
  },
  {
    slug: "pendidikan",
    kind: "kanal",
    name: "Pendidikan",
    description: "Sekolah, guru, dan murid dari daratan hingga pulau-pulau.",
  },
  {
    slug: "kesehatan",
    kind: "kanal",
    name: "Kesehatan",
    description: "Layanan kesehatan dan cerita warga yang mengaksesnya.",
  },
  {
    slug: "ekonomi",
    kind: "kanal",
    name: "Ekonomi",
    description: "Laut, garam, pasar, dan usaha yang menghidupi Sumenep.",
  },
  {
    slug: "profil-sumenep",
    kind: "kanal",
    name: "Profil Sumenep",
    description: "Sejarah, wilayah, dan wajah Kabupaten Sumenep.",
  },
  {
    slug: "catatan-sumenep",
    kind: "rubrik",
    name: "Catatan Sumenep",
    description: "Gagasan, pengamatan, dan cerita tentang Sumenep lebih dekat dan lebih utuh.",
  },
  {
    slug: "jalan-jalan-sumenep",
    kind: "rubrik",
    name: "Jalan-Jalan Sumenep",
    description: "Menyusuri kota, desa, dan pulau dengan langkah yang pelan.",
  },
  {
    slug: "membaca-sumenep",
    kind: "rubrik",
    name: "Membaca Sumenep",
    description: "Membaca data, dokumen, dan arah pembangunan daerah.",
  },
  {
    slug: "orang-sumenep",
    kind: "rubrik",
    name: "Orang Sumenep",
    description: "Profil orang-orang yang menghidupkan Sumenep.",
  },
  {
    slug: "suara-kepulauan",
    kind: "rubrik",
    name: "Suara Kepulauan",
    description: "Kabar dan suara warga dari pulau-pulau di Sumenep.",
  },
];

export const sectionHref = (s: Pick<Section, "kind" | "slug">) => `/${s.kind}/${s.slug}`;
