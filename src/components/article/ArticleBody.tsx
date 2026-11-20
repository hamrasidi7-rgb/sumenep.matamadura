import { Fragment } from "react";

import type { ArticleBlock, ListItem } from "@/content/types";

import { ArticleGallery } from "./ArticleGallery";
import { ArticleImage } from "./ArticleImage";
import { ArticleInfographic } from "./ArticleInfographic";
import { ArticleMap } from "./ArticleMap";
import { ArticleTable } from "./ArticleTable";
import { ArticleTimeline } from "./ArticleTimeline";
import { ArticleVideo } from "./ArticleVideo";
import { PullQuote } from "./PullQuote";
import { RichInline } from "./RichInline";

function List({ ordered, items }: { ordered: boolean; items: ListItem[] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`mb-6 space-y-2 pl-6 marker:text-brand ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((it, i) => (
        <li key={i} className="pl-1">
          <RichInline content={it.content} />
          {it.children && it.children.length > 0 && (
            <div className="mt-2">
              <List ordered={ordered} items={it.children} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  );
}

/**
 * Renders the normalised article body. Typography follows the brief:
 * 17 px/1.8 (mobile) · 19 px/1.85 (tablet) · 20 px/1.85 (desktop), column ≤ 720 px.
 * "wide" images break out of the text column up to 992 px.
 */
export function ArticleBody({
  blocks,
  dropCap = false,
  endMark = false,
  beforeFirstHeading,
}: {
  blocks: ArticleBlock[];
  dropCap?: boolean;
  endMark?: boolean;
  beforeFirstHeading?: React.ReactNode;
}) {
  const firstParagraph = blocks.findIndex((b) => b.type === "paragraph");
  const lastParagraph = blocks.findLastIndex((b) => b.type === "paragraph");
  const firstHeading = blocks.findIndex((b) => b.type === "heading");

  return (
    <div data-article-body="" className="font-serif text-[1.0625rem] leading-[1.8] text-ink md:text-[1.1875rem] md:leading-[1.85] xl:text-[1.25rem]">
      {blocks.map((b, i) => {
        const slot = i === firstHeading && beforeFirstHeading ? beforeFirstHeading : null;
        const el = (() => {
          switch (b.type) {
            case "paragraph":
              return (
                <p
                  className={`mb-6 ${
                    dropCap && i === firstParagraph
                      ? "first-letter:font-display first-letter:float-left first-letter:mt-1 first-letter:mr-2.5 first-letter:text-[3.9em] first-letter:leading-[0.82] first-letter:font-bold first-letter:text-brand"
                      : ""
                  }`}
                >
                  <RichInline content={b.content} />
                  {endMark && i === lastParagraph && <span aria-hidden className="ml-1.5 inline-block size-[0.55em] bg-brand align-baseline" />}
                </p>
              );
            case "heading": {
              const H = b.level === 2 ? "h2" : b.level === 3 ? "h3" : "h4";
              const cls =
                b.level === 2
                  ? "mt-12 mb-4 text-[1.625rem] leading-[1.2] md:text-[1.875rem]"
                  : b.level === 3
                    ? "mt-9 mb-3 text-[1.3125rem] leading-[1.25] md:text-[1.4375rem]"
                    : "mt-8 mb-2 text-[1.125rem] leading-snug";
              return (
                <H id={b.id} className={`font-display scroll-mt-20 font-bold tracking-[-0.01em] text-ink ${cls}`}>
                  <RichInline content={b.content} />
                </H>
              );
            }
            case "quote":
              return (
                <blockquote className="my-8 border-l-4 border-brand/70 pl-5 text-[1.05em] text-ink/90 italic">
                  <p>
                    <RichInline content={b.content} />
                  </p>
                </blockquote>
              );
            case "list":
              return <List ordered={b.ordered} items={b.items} />;
            case "image":
              return b.size === "wide" ? (
                <ArticleImage
                  image={b.image}
                  sizes="(min-width: 1024px) 992px, 100vw"
                  className="relative left-1/2 my-10 w-[min(62rem,calc(100vw-2.5rem))] -translate-x-1/2 md:w-[min(62rem,calc(100vw-4rem))]"
                  captionClassName="mx-auto max-w-[45rem]"
                />
              ) : (
                <ArticleImage image={b.image} sizes="(min-width: 768px) 720px, 100vw" className="my-9" />
              );
            case "pullQuote":
              return <PullQuote text={b.text} attribution={b.attribution} />;
            case "gallery":
              return <ArticleGallery title={b.title} images={b.images} group={`galeri-${i}`} />;
            case "infographic":
              return <ArticleInfographic title={b.title} image={b.image} source={b.source} dataDate={b.dataDate} note={b.note} />;
            case "timeline":
              return <ArticleTimeline title={b.title} events={b.events} />;
            case "table":
              return <ArticleTable caption={b.caption} header={b.header} rows={b.rows} source={b.source} />;
            case "map":
              return <ArticleMap title={b.title} latitude={b.latitude} longitude={b.longitude} zoom={b.zoom} marker={b.marker} caption={b.caption} />;
            case "video":
              return <ArticleVideo provider={b.provider} videoId={b.videoId} title={b.title} caption={b.caption} />;
            case "divider":
              return (
                <hr className="mx-auto my-10 w-24 border-0 border-t-2 border-brand/40" />
              );
            default:
              return null;
          }
        })();
        return (
          <Fragment key={i}>
            {slot}
            {el}
          </Fragment>
        );
      })}
    </div>
  );
}
