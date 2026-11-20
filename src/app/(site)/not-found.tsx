import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-site pt-12 md:pt-20">
      <div className="mx-auto max-w-xl text-center">
        <p className="label-section">404</p>
        <h1 className="font-display mt-2 text-4xl leading-tight font-bold md:text-5xl">Halaman tidak ditemukan</h1>
        <p className="mt-4 font-serif text-lg text-muted">Tautan mungkin sudah berubah, atau tulisan ini belum terbit.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="tap rounded-full bg-ink px-5 font-sans text-sm font-medium text-white hover:bg-brand">
            Ke beranda
          </Link>
          <Link href="/cari" className="tap rounded-full border border-ink px-5 font-sans text-sm font-medium text-ink">
            Cari tulisan
          </Link>
        </div>
      </div>
    </div>
  );
}
