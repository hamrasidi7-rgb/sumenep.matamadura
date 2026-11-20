import type { Article, Author, HomepageConfig } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// KONTEN CONTOH DESAIN — BUKAN BERITA FAKTUAL.
// Dipakai sampai CMS (Tahap 5) aktif. Teks sengaja tidak memuat angka, kutipan
// narasumber, atau klaim faktual. Gambar adalah ilustrasi demo dari mockup.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHORS: Author[] = [
  {
    slug: "redaksi",
    name: "Redaksi SUMENEP",
    role: "Tim Redaksi",
    bio: "Tim redaksi SUMENEP – Mata Madura.",
  },
];

const DEMO_CREDIT = "Ilustrasi demo";

const demoBody = (opening: string, heading: string, closing: string): Article["body"] => [
  { type: "paragraph", text: opening },
  {
    type: "paragraph",
    text: "Tulisan ini adalah contoh tata letak untuk keperluan desain. Isinya akan diganti dengan naskah redaksi yang terverifikasi setelah sistem pengelolaan konten aktif.",
  },
  { type: "heading", level: 2, text: heading },
  {
    type: "paragraph",
    text: "Paragraf berikut menunjukkan bagaimana teks panjang tampil: ukuran huruf, jarak antarbaris, dan lebar kolom diatur agar nyaman dibaca, baik di layar ponsel maupun di layar lebar.",
  },
  { type: "paragraph", text: closing },
];

export const ARTICLES: Article[] = [
  {
    slug: "sumenep-cerita-yang-tumbuh-di-ujung-kepulauan",
    title: "Sumenep, Cerita yang Tumbuh di Ujung Kepulauan",
    standfirst:
      "Membaca kehidupan masyarakat, pembangunan, dan masa depan Sumenep dari daratan hingga pulau-pulau.",
    rubrik: "catatan-sumenep",
    kanal: "profil-sumenep",
    author: "redaksi",
    publishedAt: "2026-11-20T07:00:00+07:00",
    readingMinutes: 8,
    template: "feature",
    hero: {
      src: "/demo/senja-perahu.webp",
      width: 1280,
      height: 720,
      alt: "Tiga perahu nelayan di laut tenang saat matahari terbenam, dengan siluet pulau di kejauhan",
      caption: "Perahu nelayan menjelang senja.",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Ada banyak cara membaca sebuah kabupaten. Sebagian memulainya dari angka, sebagian dari peta, dan sebagian lagi dari cerita orang-orang yang tinggal di dalamnya.",
      "Dari daratan ke pulau-pulau",
      "Rubrik Catatan Sumenep disiapkan untuk tulisan yang ingin melihat lebih dekat dan lebih utuh.",
    ),
    tags: ["kepulauan", "catatan"],
    isDemo: true,
  },
  {
    slug: "membaca-arah-pembangunan-sumenep",
    title: "Membaca Arah Pembangunan Sumenep: Antara Capaian dan Pekerjaan Rumah",
    standfirst:
      "Sebuah cara membaca dokumen pembangunan daerah: apa yang sudah berjalan, dan apa yang masih menunggu.",
    kanal: "politik-pemerintahan",
    author: "redaksi",
    publishedAt: "2026-11-19T09:30:00+07:00",
    readingMinutes: 7,
    template: "standard",
    hero: {
      src: "/demo/gerbang-keraton.webp",
      width: 774,
      height: 345,
      alt: "Gerbang bangunan bergaya keraton berwarna kuning di antara pepohonan",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Pembangunan daerah biasanya dibaca lewat dokumen perencanaan dan laporan kinerja. Tulisan seperti ini akan menautkan setiap angka ke sumber resminya.",
      "Capaian dan pekerjaan rumah",
      "Setiap data dalam artikel resmi nantinya disertai sumber dan tanggal data.",
    ),
    tags: ["pembangunan"],
    isDemo: true,
  },
  {
    slug: "pendidikan-kepulauan-dan-persoalan-pemerataan-guru",
    title: "Pendidikan Kepulauan dan Persoalan Pemerataan Guru",
    standfirst: "Jarak, ombak, dan jadwal kapal ikut menentukan siapa yang mengajar di depan kelas.",
    kanal: "pendidikan",
    author: "redaksi",
    publishedAt: "2026-11-18T08:00:00+07:00",
    readingMinutes: 6,
    template: "standard",
    hero: {
      src: "/demo/ruang-kelas.webp",
      width: 777,
      height: 339,
      alt: "Murid berseragam menulis di meja dalam ruang kelas",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Di wilayah kepulauan, persoalan pendidikan sering kali bermula dari hal yang sederhana: bagaimana guru dan murid sampai ke sekolah.",
      "Kelas di seberang laut",
      "Liputan lengkap tentang pemerataan guru akan memuat data resmi dan suara para pendidik.",
    ),
    tags: ["pendidikan", "kepulauan"],
    isDemo: true,
  },
  {
    slug: "nelayan-laut-dan-ekonomi-pulau",
    title: "Nelayan, Laut, dan Ekonomi Pulau",
    standfirst: "Laut bukan sekadar bentang air; ia adalah dapur, pasar, dan jalan pulang.",
    kanal: "ekonomi",
    author: "redaksi",
    publishedAt: "2026-11-17T06:30:00+07:00",
    readingMinutes: 6,
    template: "feature",
    hero: {
      src: "/demo/nelayan.webp",
      width: 780,
      height: 330,
      alt: "Seorang nelayan bertopi caping tersenyum dengan perahu-perahu di belakangnya",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Bagi banyak keluarga di pulau, ekonomi berjalan mengikuti musim angin dan arus.",
      "Musim dan pasar",
      "Tulisan tentang ekonomi pulau akan dilengkapi data produksi dan harga dari sumber resmi.",
    ),
    tags: ["ekonomi", "nelayan"],
    isDemo: true,
  },
  {
    slug: "jalan-panjang-layanan-kesehatan-di-pulau-kecil",
    title: "Jalan Panjang Layanan Kesehatan di Pulau-Pulau Kecil",
    standfirst:
      "Ketika rujukan berarti menyeberang laut, waktu dan cuaca menjadi bagian dari pelayanan kesehatan.",
    kanal: "kesehatan",
    author: "redaksi",
    publishedAt: "2026-11-16T10:00:00+07:00",
    readingMinutes: 5,
    template: "standard",
    hero: {
      src: "/demo/ilustrasi-perahu-pulau.svg",
      width: 600,
      height: 400,
      alt: "Ilustrasi perahu layar menuju pulau kecil dengan bangunan bertanda palang",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Layanan kesehatan di pulau kecil tidak hanya soal fasilitas, tetapi juga soal perjalanan menuju fasilitas itu.",
      "Menyeberang untuk berobat",
      "Artikel resmi akan menyertakan data layanan dari instansi terkait beserta tanggalnya.",
    ),
    tags: ["kesehatan", "kepulauan"],
    isDemo: true,
  },
  {
    slug: "menunggu-kapal-menunggu-kepastian",
    title: "Menunggu Kapal, Menunggu Kepastian: Kabar dari Gugus Pulau",
    standfirst: "Suara warga kepulauan tentang jarak, jadwal, dan harapan yang ikut berlayar.",
    rubrik: "suara-kepulauan",
    kanal: "ekonomi",
    author: "redaksi",
    publishedAt: "2026-11-15T16:00:00+07:00",
    readingMinutes: 7,
    template: "feature",
    hero: {
      src: "/demo/ilustrasi-gugus-pulau.svg",
      width: 600,
      height: 400,
      alt: "Ilustrasi peta gugus pulau yang dihubungkan jalur kapal putus-putus",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Di gugus pulau, jadwal kapal adalah kalender yang paling sering dibaca.",
      "Jarak yang membentuk keseharian",
      "Rubrik Suara Kepulauan memberi ruang bagi kabar dari pulau-pulau.",
    ),
    tags: ["kepulauan", "transportasi"],
    isDemo: true,
  },
  {
    slug: "membaca-sumenep-lewat-dokumen-perencanaan",
    title: "Membaca Sumenep Lewat Dokumen Perencanaannya",
    standfirst:
      "Dokumen perencanaan daerah menyimpan banyak cerita, asalkan kita mau membacanya dengan teliti.",
    rubrik: "membaca-sumenep",
    kanal: "politik-pemerintahan",
    author: "redaksi",
    publishedAt: "2026-11-14T08:00:00+07:00",
    readingMinutes: 9,
    template: "spotlight",
    hero: {
      src: "/demo/ilustrasi-membaca.svg",
      width: 600,
      height: 400,
      alt: "Ilustrasi buku terbuka dengan matahari terbit di cakrawala",
      credit: DEMO_CREDIT,
    },
    body: demoBody(
      "Rubrik Membaca Sumenep mengajak pembaca menelusuri data dan dokumen resmi daerah.",
      "Cara membaca dokumen",
      "Setiap tabel dan grafik di rubrik ini akan mencantumkan sumber dan tanggal data.",
    ),
    tags: ["data", "perencanaan"],
    isDemo: true,
  },
];

export const HOMEPAGE: HomepageConfig = {
  hero: "sumenep-cerita-yang-tumbuh-di-ujung-kepulauan",
  featured: [
    "membaca-arah-pembangunan-sumenep",
    "pendidikan-kepulauan-dan-persoalan-pemerataan-guru",
    "nelayan-laut-dan-ekonomi-pulau",
  ],
  latestCount: 3,
  editorialNote: {
    title: "Catatan Sumenep",
    description: "Gagasan, pengamatan, dan cerita tentang Sumenep lebih dekat dan lebih utuh.",
    href: "/rubrik/catatan-sumenep",
  },
};
