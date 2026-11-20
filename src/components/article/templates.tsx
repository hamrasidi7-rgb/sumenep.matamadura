import type { ArticleView } from "@/lib/content";
import { extractToc } from "@/lib/article-utils";

import { ArticleBody } from "./ArticleBody";
import { AuthorBio, ArticleTags, DemoNotice } from "./ArticleExtras";
import { ArticleGallery } from "./ArticleGallery";
import { ArticleHeader } from "./ArticleHeader";
import { ArticleHero, SpotlightHero } from "./ArticleHero";
import { ArticleLightbox } from "./ArticleLightbox";
import { ArticleMetadata } from "./ArticleMetadata";
import { ArticleTableOfContents } from "./ArticleTableOfContents";
import { ReadingProgress } from "./ReadingProgress";
import { RelatedArticles } from "./RelatedArticles";
import { ShareArticle } from "./ShareArticle";

interface Props {
  article: ArticleView;
  related: ArticleView[];
}

const pathOf = (a: ArticleView) => `/artikel/${a.slug}`;

function Footer({ article }: { article: ArticleView }) {
  return (
    <>
      {article.gallery && article.gallery.length > 0 && <ArticleGallery title="Galeri foto" images={article.gallery} group="galeri-artikel" />}
      <ArticleTags tags={article.tags} />
      <div className="mt-6 border-t border-line pt-5">
        <ShareArticle path={pathOf(article)} title={article.title} />
      </div>
    </>
  );
}

/** A. Standard News — daily reporting. */
export function StandardTemplate({ article, related }: Props) {
  return (
    <article className="pt-6 md:pt-10" data-template="standard">
      <ReadingProgress />
      <ArticleHeader article={article} variant="standard" sharePath={pathOf(article)} />
      <ArticleHero article={article} variant="column" />
      <div className="container-site mt-8 md:mt-10">
        <div id="isi-artikel" className="mx-auto max-w-[45rem]">
          {article.isDemo && <DemoNotice />}
          <ArticleBody blocks={article.body} />
          <Footer article={article} />
        </div>
      </div>
      <RelatedArticles articles={related} />
      <ArticleLightbox />
    </article>
  );
}

/** B. Editorial / Feature — reportage, profiles, opinion. Drop cap, end mark, author bio. */
export function FeatureTemplate({ article, related }: Props) {
  return (
    <article className="pt-6 md:pt-12" data-template="feature">
      <ReadingProgress />
      <ArticleHeader article={article} variant="feature" sharePath={pathOf(article)} />
      <ArticleHero article={article} variant="wide" />
      <div className="container-site mt-9 md:mt-12">
        <div id="isi-artikel" className="mx-auto max-w-[45rem]">
          {article.isDemo && <DemoNotice />}
          <ArticleBody blocks={article.body} dropCap endMark />
          <AuthorBio author={article.author} />
          <Footer article={article} />
        </div>
      </div>
      <RelatedArticles articles={related} />
      <ArticleLightbox />
    </article>
  );
}

/** C. Spotlight / Longform — full-bleed hero, progress, clickable table of contents. */
export function SpotlightTemplate({ article, related }: Props) {
  const toc = extractToc(article.body);
  return (
    <article data-template="spotlight">
      <ReadingProgress />
      <SpotlightHero article={article} />
      <div className="container-site mt-6 md:mt-8">
        <div className="mx-auto flex max-w-[45rem] flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-center md:justify-between">
          <ArticleMetadata article={article} />
          <ShareArticle path={pathOf(article)} title={article.title} compact />
        </div>
      </div>
      <div className="mx-auto mt-8 w-full max-w-[75rem] px-5 md:mt-10 md:px-8 xl:max-w-[86rem] xl:px-10">
        <div className="mx-auto max-w-[45rem] xl:grid xl:max-w-none xl:grid-cols-[minmax(0,1fr)_minmax(0,45rem)_minmax(0,1fr)] xl:gap-x-12">
          <div className="hidden xl:block">
            <div className="ml-auto h-full max-w-[15rem]">
              <ArticleTableOfContents entries={toc} variant="sidebar" />
            </div>
          </div>
          <div id="isi-artikel" className="min-w-0">
            {article.isDemo && <DemoNotice />}
            <ArticleBody
              blocks={article.body}
              beforeFirstHeading={
                <div className="xl:hidden">
                  <ArticleTableOfContents entries={toc} variant="inline" />
                </div>
              }
            />
            <AuthorBio author={article.author} />
            <Footer article={article} />
          </div>
          <div aria-hidden className="hidden xl:block" />
        </div>
      </div>
      <RelatedArticles articles={related} />
      <ArticleLightbox />
    </article>
  );
}

export function ArticleTemplate(props: Props) {
  switch (props.article.template) {
    case "feature":
      return <FeatureTemplate {...props} />;
    case "spotlight":
      return <SpotlightTemplate {...props} />;
    default:
      return <StandardTemplate {...props} />;
  }
}
