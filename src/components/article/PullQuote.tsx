import type { PullQuoteVariant } from "@/lib/editorial-tokens";

export function PullQuote({
  text,
  attribution,
  variant = "editorial",
}: {
  text: string;
  attribution?: string;
  variant?: PullQuoteVariant;
}) {
  if (variant === "framed") {
    return (
      <figure className="clear-both my-10 rounded-lg border border-[#E6DFD3] bg-[#FAF6F0] px-6 py-7 md:my-12 md:px-8" data-block="pull-quote">
        <span aria-hidden className="block font-serif text-4xl leading-none font-bold text-[#A61B2B]">
          “
        </span>
        <blockquote className="mt-1">
          <p className="font-serif text-[1.375rem] leading-[1.35] font-normal text-[#252525] italic md:text-[1.6875rem]">{text}</p>
        </blockquote>
        {attribution && <figcaption className="mt-3.5 font-sans text-sm font-medium text-[#62666D]">— {attribution}</figcaption>}
      </figure>
    );
  }

  if (variant === "italic") {
    return (
      <figure className="clear-both my-10 border-l-4 border-[#A61B2B] py-1 pl-5 md:my-12 md:pl-6" data-block="pull-quote">
        <blockquote>
          <p className="font-serif text-[1.4375rem] leading-[1.35] font-normal text-[#252525] italic md:text-[1.75rem]">“{text}”</p>
        </blockquote>
        {attribution && <figcaption className="mt-3 font-sans text-sm font-medium text-[#62666D]">— {attribution}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="clear-both my-10 border-t-[3px] border-[#A61B2B] pt-5 md:my-12" data-block="pull-quote">
      <blockquote>
        <p className="font-serif text-[1.5rem] leading-[1.3] font-normal text-[#252525] md:text-[1.8125rem]">“{text}”</p>
      </blockquote>
      {attribution && <figcaption className="mt-3 font-sans text-sm font-medium text-[#62666D]">— {attribution}</figcaption>}
    </figure>
  );
}
