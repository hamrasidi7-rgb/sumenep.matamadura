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
      <HeroArticle article={home.hero} />
      <FeaturedArticles articles={home.featured} />
      <EditorialNote note={home.editorialNote} articles={home.catatanArticles} />
      <RubricBands bands={home.rubricBands} />
      <LatestArticles articles={home.latest} rubrics={rubrics} />
    </>
  );
}
