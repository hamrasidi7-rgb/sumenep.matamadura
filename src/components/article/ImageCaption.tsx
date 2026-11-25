/** Caption + photo credit. Credit gets a "Foto:" prefix unless it already says what it is. */
export function ImageCaption({ caption, credit, className = "" }: { caption?: string; credit?: string; className?: string }) {
  if (!caption && !credit) return null;
  const creditText = credit && (/^(foto|ilustrasi|grafis|diolah|dok|sumber)/i.test(credit) ? credit : `Foto: ${credit}`);
  return (
    <figcaption
      className={`mt-2.5 font-sans text-[0.8125rem] leading-[1.45] font-normal text-[#3a3836] md:text-sm ${className}`}
    >
      {caption}
      {caption && creditText ? " " : null}
      {creditText && <span className="text-[0.75rem] font-normal whitespace-nowrap text-[#5c5957] md:text-[0.8125rem]">({creditText})</span>}
    </figcaption>
  );
}

export function captionText(caption?: string, credit?: string): string {
  return [caption, credit && `(${credit})`].filter(Boolean).join(" ");
}
