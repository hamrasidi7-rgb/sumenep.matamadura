import type { Metadata } from "next";

import { EditorialNote } from "@/components/home/EditorialNote";
import { FeaturedArticles } from "@/components/home/FeaturedArticles";
import { HeroArticle } from "@/components/home/HeroArticle";
import { LatestArticles } from "@/components/home/LatestArticles";
import { RubricBands } from "@/components/home/RubricBands";
import { getHomepage, getSections } from "@/lib/content";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [home, rubrics] = await Promise.all([getHomepage(), getSections("rubrik")]);
  return (
    <>
      <h1 className="sr-only">
        {SITE.name}: {SITE.tagline}
      </h1>
      {home.hero ? (
        <HeroArticle article={home.hero} />
      ) : (
        <section className="container-site py-12 md:py-16" aria-label="Beranda SUMENEP">
          <div className="max-w-2xl border-b border-border pb-8">
            <p className="font-display text-2xl font-bold text-[var(--color-text-primary)] md:text-3xl">
              Redaksi sedang menyiapkan laporan terbaru.
            </p>
            <p className="mt-2 font-sans text-base text-[var(--color-text-secondary)]">
              Berita, Catatan Sumenep, dan laporan mendalam yang diterbitkan melalui CMS akan langsung tampil di halaman ini.
            </p>
          </div>
        </section>
      )}
      <FeaturedArticles articles={home.featured} />
      <EditorialNote note={home.editorialNote} articles={home.catatanArticles} />
      <RubricBands bands={home.rubricBands} />
      <LatestArticles articles={home.latest} rubrics={rubrics} />
    </>
  );
}
