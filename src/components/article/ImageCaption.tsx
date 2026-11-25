/** Caption + photo credit. Credit gets a "Foto:" prefix unless it already says what it is. */
export function ImageCaption({ caption, credit, className = "" }: { caption?: string; credit?: string; className?: string }) {
  if (!caption && !credit) return null;
  const creditText = credit && (/^(foto|ilustrasi|grafis|diolah|dok|sumber)/i.test(credit) ? credit : `Foto: ${credit}`);
  return (
    <figcaption
      className={`mt-1.5 font-sans text-[0.6875rem] leading-[1.4] font-normal text-[#666666] md:text-[0.75rem] ${className}`}
    >
      {caption}
      {caption && creditText ? " " : null}
      {creditText && <span className="text-[0.6875rem] font-normal text-[#737373]">({creditText})</span>}
    </figcaption>
  );
}

export function captionText(caption?: string, credit?: string): string {
  return [caption, credit && `(${credit})`].filter(Boolean).join(" ");
}
