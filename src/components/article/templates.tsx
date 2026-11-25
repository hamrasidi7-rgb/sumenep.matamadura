import type { ArticleView } from "@/lib/content";
import { extractToc } from "@/lib/article-utils";

import { ArticleBody } from "./ArticleBody";
import { AuthorBio, ArticleTags, DemoNotice } from "./ArticleExtras";
import { ArticleGallery } from "./ArticleGallery";
import { ArticleHeader } from "./ArticleHeader";
import { ArticleHero } from "./ArticleHero";
import { ArticleLightbox } from "./ArticleLightbox";
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

/** A. Standard News — photo-first editorial flow. */
export function StandardTemplate({ article, related }: Props) {
  return (
    <article data-template="standard">
      <ReadingProgress />
      <ArticleHero article={article} variant="column" />
      <ArticleHeader article={article} variant="standard" sharePath={pathOf(article)} />
      <div className="container-site mt-8 md:mt-10">
        <div id="isi-artikel" className="mx-auto max-w-[45rem]">
          {article.isDemo && <DemoNotice />}
          <ArticleBody blocks={article.body} />
          <AuthorBio author={article.author} />
          <Footer article={article} />
        </div>
      </div>
      <RelatedArticles articles={related} />
      <ArticleLightbox />
    </article>
  );
}

/** B. Editorial / Feature — wide dominant photo-first flow, drop cap & end mark. */
export function FeatureTemplate({ article, related }: Props) {
  return (
    <article data-template="feature">
      <ReadingProgress />
      <ArticleHero article={article} variant="wide" />
      <ArticleHeader article={article} variant="feature" sharePath={pathOf(article)} />
      <div className="container-site mt-8 md:mt-10">
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

/** C. Spotlight / Longform — dominant 16:10 photo-first flow + table of contents. */
export function SpotlightTemplate({ article, related }: Props) {
  const toc = extractToc(article.body);
  return (
    <article data-template="spotlight">
      <ReadingProgress />
      <ArticleHero article={article} variant="spotlight" />
      <ArticleHeader article={article} variant="spotlight" sharePath={pathOf(article)} />
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
