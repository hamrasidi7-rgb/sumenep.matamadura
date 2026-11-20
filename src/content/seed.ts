import type { Article, ArticleBlock, Author, HomepageConfig, Inline, MediaAsset } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// KONTEN CONTOH DESAIN — BUKAN BERITA FAKTUAL.
// Sumber awal untuk seed CMS (scripts/seed) dan cadangan saat CMS kosong.
// Teks sengaja tidak memuat angka statistik, kutipan narasumber, atau klaim
// faktual tentang peristiwa. Gambar = ilustrasi demo dari mockup.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHORS: Author[] = [
  {
    slug: "redaksi",
    name: "Redaksi SUMENEP",
    role: "Tim Redaksi",
    bio: "Tim redaksi SUMENEP – Mata Madura menulis catatan, berita, dan perspektif tentang Sumenep dari daratan hingga kepulauan.",
  },
];

const CREDIT = "Ilustrasi demo";

// ── Media ────────────────────────────────────────────────────────────────────
const M = {
  senja: { src: "/demo/senja-perahu.webp", width: 1280, height: 720, alt: "Tiga perahu nelayan di laut tenang saat matahari terbenam, dengan siluet pulau di kejauhan", caption: "Perahu nelayan menjelang senja.", credit: CREDIT },
  keraton: { src: "/demo/gerbang-keraton.webp", width: 774, height: 345, alt: "Gerbang bangunan bergaya keraton berwarna kuning di antara pepohonan", caption: "Gerbang bergaya keraton.", credit: CREDIT },
  kelas: { src: "/demo/ruang-kelas.webp", width: 777, height: 339, alt: "Murid berseragam menulis di meja dalam ruang kelas", caption: "Suasana belajar di ruang kelas.", credit: CREDIT },
  nelayan: { src: "/demo/nelayan.webp", width: 780, height: 330, alt: "Seorang nelayan bertopi caping tersenyum dengan perahu-perahu di belakangnya", caption: "Nelayan di tepi pantai.", credit: CREDIT },
  perahuPulau: { src: "/demo/ilustrasi-perahu-pulau.svg", width: 600, height: 400, alt: "Ilustrasi perahu layar menuju pulau kecil dengan bangunan bertanda palang", caption: "Ilustrasi perjalanan menuju pulau.", credit: CREDIT },
  gugusPulau: { src: "/demo/ilustrasi-gugus-pulau.svg", width: 600, height: 400, alt: "Ilustrasi peta gugus pulau yang dihubungkan jalur kapal putus-putus", credit: CREDIT },
  membaca: { src: "/demo/ilustrasi-membaca.svg", width: 600, height: 400, alt: "Ilustrasi buku terbuka dengan matahari terbit di cakrawala", credit: CREDIT },
  infografik: { src: "/demo/infografik-dokumen-perencanaan.svg", width: 800, height: 960, alt: "Alur dokumen perencanaan daerah: RPJPD 20 tahun, RPJMD 5 tahun, RKPD 1 tahun, dan APBD 1 tahun", credit: "Diolah redaksi" },
} satisfies Record<string, MediaAsset>;

// ── Block helpers ────────────────────────────────────────────────────────────
type Part = string | Inline;
const inl = (parts: Part[]): Inline[] => parts.map((x) => (typeof x === "string" ? { text: x } : x));
const p = (...parts: Part[]): ArticleBlock => ({ type: "paragraph", content: inl(parts) });
const h2 = (text: string): ArticleBlock => ({ type: "heading", level: 2, content: [{ text }], id: "" });
const h3 = (text: string): ArticleBlock => ({ type: "heading", level: 3, content: [{ text }], id: "" });
const b = (text: string): Inline => ({ text, bold: true });
const i = (text: string): Inline => ({ text, italic: true });

const demoNote = p(
  "Tulisan ini adalah ",
  b("contoh tata letak"),
  ". Isinya akan diganti dengan naskah redaksi yang terverifikasi melalui CMS.",
);

// ── Spotlight / longform ────────────────────────────────────────────────────
const spotlightBody: ArticleBlock[] = [
  p("Ada banyak cara membaca sebuah kabupaten. Sebagian memulainya dari angka, sebagian dari peta, dan sebagian lagi dari cerita orang-orang yang tinggal di dalamnya. Tulisan panjang seperti ini mencoba menggabungkan ketiganya, pelan-pelan, tanpa terburu-buru menyimpulkan."),
  demoNote,
  h2("Daratan yang menjadi pintu"),
  p("Setiap perjalanan ke pulau dimulai dari daratan. Di pelabuhan, orang menunggu kapal sambil membawa barang, kabar, dan rencana. Dari sana pula kebijakan berangkat, menyeberang, lalu tiba di tempat yang jauh dari pusat pemerintahan."),
  p("Memahami daratan berarti memahami ", i("simpul"), ": jalan, pasar, kantor layanan, dan sekolah yang menjadi tujuan warga dari banyak penjuru."),
  { type: "pullQuote", text: "Membaca sebuah daerah berarti membaca jarak — jarak antara rencana dan kenyataan, antara pusat dan pinggiran.", attribution: "Catatan redaksi" },
  h2("Pulau-pulau yang menunggu dibaca"),
  h3("Jarak sebagai keseharian"),
  p("Bagi warga kepulauan, jarak bukan konsep abstrak. Ia hadir dalam jadwal kapal, cuaca, dan ongkos perjalanan. Liputan panjang memberi ruang untuk menuliskan hal-hal itu dengan cermat."),
  h3("Suara yang jarang terdengar"),
  p("Rubrik Suara Kepulauan disiapkan untuk menampung kabar dari pulau-pulau, ditulis dengan prinsip yang sama: verifikasi, kehati-hatian, dan penghormatan pada narasumber."),
  { type: "image", image: M.perahuPulau, size: "wide" },
  h2("Membaca lewat dokumen"),
  p("Pembangunan daerah diatur dalam beberapa dokumen perencanaan yang saling berkaitan. Tabel dan infografik berikut merangkum hubungan antardokumen itu sebagai pengantar membaca."),
  {
    type: "table",
    caption: "Dokumen perencanaan dan penganggaran daerah",
    header: ["Dokumen", "Jangka waktu", "Isi pokok"],
    rows: [
      ["RPJPD", "20 tahun", "Visi dan arah pembangunan jangka panjang"],
      ["RPJMD", "5 tahun", "Penjabaran visi, misi, dan program kepala daerah"],
      ["Renstra Perangkat Daerah", "5 tahun", "Rencana strategis setiap perangkat daerah"],
      ["RKPD", "1 tahun", "Rencana kerja dan prioritas tahunan"],
      ["APBD", "1 tahun", "Rencana keuangan tahunan daerah"],
    ],
    source: "Diolah redaksi",
  },
  { type: "infographic", title: "Alur dokumen perencanaan daerah", image: M.infografik, source: "Diolah redaksi", note: "Infografik ini menggambarkan urutan dokumen, bukan data statistik." },
  h2("Peta sebagai titik berangkat"),
  p("Peta membantu pembaca melihat bentang wilayah: daratan di ujung timur Pulau Madura dan pulau-pulau yang tersebar di sekitarnya."),
  { type: "map", title: "Wilayah Kabupaten Sumenep", latitude: -7.05, longitude: 114.55, zoom: 8, marker: false, caption: "Peta dasar © kontributor OpenStreetMap." },
  h2("Cara kami bekerja"),
  p("Setiap tulisan panjang melewati beberapa tahap sebelum terbit. Linimasa berikut menggambarkan alur kerja redaksi untuk liputan seperti ini."),
  {
    type: "timeline",
    title: "Alur kerja liputan panjang",
    events: [
      { date: "Tahap 1", title: "Membaca dokumen", description: "Mengumpulkan dan membaca dokumen resmi yang relevan." },
      { date: "Tahap 2", title: "Turun ke lapangan", description: "Bertemu warga dan narasumber di daratan maupun kepulauan." },
      { date: "Tahap 3", title: "Verifikasi", description: "Mencocokkan temuan dengan sumber resmi dan narasumber lain." },
      { date: "Tahap 4", title: "Terbit", description: "Naskah disunting, diperiksa, lalu diterbitkan." },
    ],
  },
  h2("Galeri"),
  { type: "gallery", title: "Potret Sumenep (ilustrasi demo)", images: [M.senja, M.keraton, M.kelas, M.nelayan] },
  h2("Penutup"),
  p("Sumenep adalah cerita yang terus tumbuh. Tugas media adalah mencatatnya dengan jujur: memberi ruang bagi data, menghormati suara warga, dan mengakui apa yang belum diketahui."),
  p("Rubrik Catatan Sumenep akan terus menjadi tempat bagi gagasan dan pengamatan semacam ini — lebih dekat, dan lebih utuh."),
];

// ── Feature ─────────────────────────────────────────────────────────────────
const featureBody: ArticleBlock[] = [
  p("Bagi banyak keluarga di pulau, ekonomi berjalan mengikuti musim angin dan arus. Pagi dimulai sebelum matahari terbit, ketika perahu-perahu disiapkan dan jaring diperiksa satu per satu."),
  demoNote,
  h2("Musim dan pasar"),
  p("Laut memberi, tetapi juga menuntut kesabaran. Hasil tangkapan menentukan apa yang bisa dibawa ke pasar, dan pasar menentukan apa yang bisa dibawa pulang."),
  { type: "pullQuote", text: "Laut bukan sekadar bentang air; ia adalah dapur, pasar, dan jalan pulang.", attribution: "Catatan redaksi" },
  { type: "image", image: M.perahuPulau, size: "wide" },
  h2("Menjaga dapur tetap mengepul"),
  p("Tulisan feature memberi ruang untuk detail kecil: cara orang menambal jaring, menyimpan es, atau menghitung ongkos bahan bakar. Detail seperti itulah yang membuat pembaca memahami sebuah persoalan dari dekat."),
  p("Liputan resmi tentang ekonomi pulau akan dilengkapi data produksi dan harga dari sumber yang dapat diperiksa, beserta tanggal datanya."),
  h2("Penutup"),
  p("Di ujung hari, perahu kembali ke pantai. Ada yang membawa banyak, ada yang membawa sedikit — dan esok, semuanya dimulai lagi."),
];

// ── Standard ────────────────────────────────────────────────────────────────
const standardBody = (lead: string, heading: string, closing: string): ArticleBlock[] => [
  p(lead),
  demoNote,
  h2(heading),
  p("Paragraf berikut menunjukkan bagaimana teks berita tampil: ukuran huruf, jarak antarbaris, dan lebar kolom diatur agar nyaman dibaca, baik di layar ponsel maupun di layar lebar."),
  {
    type: "list",
    ordered: false,
    items: [
      { content: [{ text: "Setiap angka disertai " }, { text: "sumber resmi", bold: true }, { text: "." }] },
      { content: [{ text: "Setiap data mencantumkan tanggal datanya." }] },
      { content: [{ text: "Koreksi dicatat secara terbuka di akhir artikel." }] },
    ],
  },
  { type: "quote", content: [{ text: "Kutipan blok dipakai untuk menampilkan pernyataan atau petikan dokumen secara utuh." }] },
  p(closing),
];

export const ARTICLES: Article[] = [
  {
    slug: "sumenep-cerita-yang-tumbuh-di-ujung-kepulauan",
    title: "Sumenep, Cerita yang Tumbuh di Ujung Kepulauan",
    standfirst: "Membaca kehidupan masyarakat, pembangunan, dan masa depan Sumenep dari daratan hingga pulau-pulau.",
    rubrik: "catatan-sumenep",
    kanal: "profil-sumenep",
    author: "redaksi",
    publishedAt: "2026-11-20T07:00:00+07:00",
    readingMinutes: 8,
    template: "spotlight",
    hero: M.senja,
    body: spotlightBody,
    tags: ["kepulauan", "catatan", "perencanaan"],
    isDemo: true,
  },
  {
    slug: "membaca-arah-pembangunan-sumenep",
    title: "Membaca Arah Pembangunan Sumenep: Antara Capaian dan Pekerjaan Rumah",
    standfirst: "Sebuah cara membaca dokumen pembangunan daerah: apa yang sudah berjalan, dan apa yang masih menunggu.",
    kanal: "politik-pemerintahan",
    author: "redaksi",
    publishedAt: "2026-11-19T09:30:00+07:00",
    readingMinutes: 4,
    template: "standard",
    hero: M.keraton,
    body: standardBody(
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
    readingMinutes: 4,
    template: "standard",
    hero: M.kelas,
    body: standardBody(
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
    readingMinutes: 5,
    template: "feature",
    hero: M.nelayan,
    body: featureBody,
    tags: ["ekonomi", "nelayan"],
    isDemo: true,
  },
  {
    slug: "jalan-panjang-layanan-kesehatan-di-pulau-kecil",
    title: "Jalan Panjang Layanan Kesehatan di Pulau-Pulau Kecil",
    standfirst: "Ketika rujukan berarti menyeberang laut, waktu dan cuaca menjadi bagian dari pelayanan kesehatan.",
    kanal: "kesehatan",
    author: "redaksi",
    publishedAt: "2026-11-16T10:00:00+07:00",
    readingMinutes: 4,
    template: "standard",
    hero: M.perahuPulau,
    body: standardBody(
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
    readingMinutes: 4,
    template: "feature",
    hero: M.gugusPulau,
    body: [
      p("Di gugus pulau, jadwal kapal adalah kalender yang paling sering dibaca."),
      demoNote,
      h2("Jarak yang membentuk keseharian"),
      p("Rubrik Suara Kepulauan memberi ruang bagi kabar dari pulau-pulau, ditulis dengan verifikasi yang sama ketatnya dengan liputan lain."),
      { type: "pullQuote", text: "Di pulau, menunggu adalah bagian dari perjalanan.", attribution: "Catatan redaksi" },
      p("Liputan resmi akan menyertakan suara warga dengan izin dan identitas yang jelas."),
    ],
    tags: ["kepulauan", "transportasi"],
    isDemo: true,
  },
  {
    slug: "membaca-sumenep-lewat-dokumen-perencanaan",
    title: "Membaca Sumenep Lewat Dokumen Perencanaannya",
    standfirst: "Dokumen perencanaan daerah menyimpan banyak cerita, asalkan kita mau membacanya dengan teliti.",
    rubrik: "membaca-sumenep",
    kanal: "politik-pemerintahan",
    author: "redaksi",
    publishedAt: "2026-11-14T08:00:00+07:00",
    readingMinutes: 4,
    template: "standard",
    hero: M.membaca,
    body: standardBody(
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
