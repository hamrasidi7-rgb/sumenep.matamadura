export function PullQuote({ text, attribution }: { text: string; attribution?: string }) {
  return (
    <figure className="my-10 border-t-[3px] border-brand pt-5 md:my-12">
      <blockquote>
        <p className="font-display text-[1.5rem] leading-[1.28] font-semibold text-ink italic md:text-[1.875rem]">“{text}”</p>
      </blockquote>
      {attribution && <figcaption className="meta mt-3 font-medium">— {attribution}</figcaption>}
    </figure>
  );
}
