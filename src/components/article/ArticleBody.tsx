import { Fragment } from "react";

import type { ArticleBlock, ListItem } from "@/content/types";

import { ArticleGallery } from "./ArticleGallery";
import { ArticleImage } from "./ArticleImage";
import { ArticleInfographic } from "./ArticleInfographic";
import { ArticleMap } from "./ArticleMap";
import { ArticleTable } from "./ArticleTable";
import { ArticleTimeline } from "./ArticleTimeline";
import { ArticleVideo } from "./ArticleVideo";
import { CalloutBox, EditorialDivider, FactBox, LargeStatement } from "./EditorialCallouts";
import { PullQuote } from "./PullQuote";
import { RichInline } from "./RichInline";

function List({ ordered, items }: { ordered: boolean; items: ListItem[] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`mb-6 space-y-2 pl-6 marker:text-[#A61B2B] ${ordered ? "list-decimal" : "list-disc"}`}>
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
 * Renders the normalised editorial article body (Nieman Reports reference typography):
 * Lora Regular 17px/1.6 (mobile) · 19px/1.65 (tablet) · 20px/1.65 (desktop), #252525.
 * Headings H2/H3 use Lora Bold; captions and UI labels remain sans-serif.
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
  const hasExplicitDropCap = blocks.some((b) => b.type === "paragraph" && b.dropCap);

  return (
    <div
      data-article-body=""
      className="flow-root font-serif text-[1.0625rem] leading-[1.6] text-[#252525] md:text-[1.1875rem] md:leading-[1.65] xl:text-[1.25rem]"
    >
      {blocks.map((b, i) => {
        const slot = i === firstHeading && beforeFirstHeading ? beforeFirstHeading : null;
        const el = (() => {
          switch (b.type) {
            case "paragraph": {
              const showDropCap = Boolean(b.dropCap) || (dropCap && !hasExplicitDropCap && i === firstParagraph);
              return (
                <p
                  data-drop-cap={showDropCap ? "true" : undefined}
                  className={`mb-6 ${
                    showDropCap
                      ? "clear-left first-letter:float-left first-letter:mt-1 first-letter:mr-3 first-letter:font-serif first-letter:text-[3.75em] first-letter:leading-[0.82] first-letter:font-bold first-letter:text-[#A61B2B]"
                      : ""
                  }`}
                >
                  <RichInline content={b.content} />
                  {endMark && i === lastParagraph && <span aria-hidden className="ml-1.5 inline-block size-[0.55em] bg-[#A61B2B] align-baseline" />}
                </p>
              );
            }
            case "heading": {
              const H = b.level === 2 ? "h2" : b.level === 3 ? "h3" : "h4";
              const cls =
                b.level === 2
                  ? "mt-12 mb-4 text-[1.5625rem] leading-[1.22] md:text-[1.875rem]"
                  : b.level === 3
                    ? "mt-9 mb-3 text-[1.28125rem] leading-[1.26] md:text-[1.4375rem]"
                    : "mt-8 mb-2 text-[1.125rem] leading-snug";
              return (
                <H id={b.id} className={`clear-both scroll-mt-20 font-serif font-bold tracking-[-0.01em] text-[#252525] ${cls}`}>
                  <RichInline content={b.content} />
                </H>
              );
            }
            case "quote":
              return (
                <blockquote className="clear-both my-8 border-l-4 border-[#A61B2B]/75 pl-5 font-serif text-[1.05em] text-[#252525]/90 italic">
                  <p>
                    <RichInline content={b.content} />
                  </p>
                </blockquote>
              );
            case "list":
              return <List ordered={b.ordered} items={b.items} />;
            case "image": {
              if (b.size === "full") {
                return (
                  <ArticleImage
                    image={b.image}
                    ratio={b.ratio}
                    sizes="(min-width: 1280px) 1200px, 100vw"
                    className="clear-both relative left-1/2 my-10 w-[min(75rem,calc(100vw-2rem))] -translate-x-1/2 md:w-[min(75rem,calc(100vw-3rem))]"
                    captionClassName="mx-auto max-w-[45rem]"
                  />
                );
              }
              if (b.size === "wide") {
                return (
                  <ArticleImage
                    image={b.image}
                    ratio={b.ratio}
                    sizes="(min-width: 1024px) 960px, 100vw"
                    className="clear-both relative left-1/2 my-10 w-[min(60rem,calc(100vw-2.5rem))] -translate-x-1/2 md:w-[min(60rem,calc(100vw-4rem))]"
                    captionClassName="mx-auto max-w-[45rem]"
                  />
                );
              }
              if (b.align === "left") {
                return (
                  <ArticleImage
                    image={b.image}
                    ratio={b.ratio}
                    sizes="(min-width: 768px) 340px, 100vw"
                    className="my-6 w-full md:float-left md:clear-left md:mt-1.5 md:mr-7 md:mb-5 md:w-[46%]"
                  />
                );
              }
              if (b.align === "right") {
                return (
                  <ArticleImage
                    image={b.image}
                    ratio={b.ratio}
                    sizes="(min-width: 768px) 340px, 100vw"
                    className="my-6 w-full md:float-right md:clear-right md:mt-1.5 md:ml-7 md:mb-5 md:w-[46%]"
                  />
                );
              }
              return (
                <ArticleImage
                  image={b.image}
                  ratio={b.ratio}
                  sizes="(min-width: 768px) 720px, 100vw"
                  className="clear-both my-9"
                />
              );
            }
            case "imagePair":
              return (
                <div className="clear-both my-9 grid grid-cols-1 gap-5 md:grid-cols-2" data-block="image-pair">
                  {b.images.map((img, idx) => (
                    <ArticleImage
                      key={`${img.src}-${idx}`}
                      image={img}
                      ratio={b.ratio ?? "4/3"}
                      sizes="(min-width: 768px) 350px, 100vw"
                    />
                  ))}
                </div>
              );
            case "pullQuote":
              return <PullQuote text={b.text} attribution={b.attribution} variant={b.variant} />;
            case "largeStatement":
              return <LargeStatement headline={b.headline} description={b.description} source={b.source} tone={b.tone} />;
            case "factBox":
              return <FactBox title={b.title} items={b.items} source={b.source} tone={b.tone} />;
            case "callout":
              return <CalloutBox label={b.label} title={b.title} body={b.body} tone={b.tone} />;
            case "gallery":
              return <ArticleGallery title={b.title} images={b.images} group={`galeri-${i}`} />;
            case "infographic":
              return <ArticleInfographic title={b.title} image={b.image} source={b.source} dataDate={b.dataDate} note={b.note} />;
            case "timeline":
              return (
                <div className="clear-both">
                  <ArticleTimeline title={b.title} events={b.events} />
                </div>
              );
            case "table":
              return <ArticleTable caption={b.caption} header={b.header} rows={b.rows} source={b.source} />;
            case "map":
              return (
                <div className="clear-both">
                  <ArticleMap title={b.title} latitude={b.latitude} longitude={b.longitude} zoom={b.zoom} marker={b.marker} caption={b.caption} />
                </div>
              );
            case "video":
              return (
                <div className="clear-both">
                  <ArticleVideo provider={b.provider} videoId={b.videoId} title={b.title} caption={b.caption} />
                </div>
              );
            case "divider":
              return <EditorialDivider variant={b.variant} />;
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
