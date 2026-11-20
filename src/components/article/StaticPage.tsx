import Link from "next/link";

/** Static editorial pages. Their text is managed from the CMS from Tahap 5. */
export function StaticPage({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="container-site pt-8 md:pt-12">
      <article className="mx-auto max-w-[45rem]">
        <nav aria-label="Breadcrumb" className="meta">
          <Link href="/" className="link-underline inline-block py-1">
            Beranda
          </Link>
        </nav>
        <h1 className="font-display mt-3 text-[2.125rem] leading-[1.08] font-bold tracking-[-0.015em] md:text-5xl">{title}</h1>
        <p className="mt-5 font-serif text-[1.125rem] leading-[1.8] text-ink md:text-[1.1875rem]">{intro}</p>
        <p className="mt-6 rounded-lg bg-warm px-4 py-3 font-sans text-sm text-muted">
          Naskah resmi halaman ini belum diterbitkan. Teks akan dikelola redaksi melalui CMS.
        </p>
      </article>
    </div>
  );
}
