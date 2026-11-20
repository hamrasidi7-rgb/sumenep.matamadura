/** Caption + photo credit. Credit gets a "Foto:" prefix unless it already says what it is. */
export function ImageCaption({ caption, credit, className = "" }: { caption?: string; credit?: string; className?: string }) {
  if (!caption && !credit) return null;
  const creditText = credit && (/^(foto|ilustrasi|grafis|diolah|dok|sumber)/i.test(credit) ? credit : `Foto: ${credit}`);
  return (
    <figcaption className={`meta mt-2.5 ${className}`}>
      {caption}
      {caption && creditText ? " " : null}
      {creditText && <span className="whitespace-nowrap text-[#6b6f76]">({creditText})</span>}
    </figcaption>
  );
}

export function captionText(caption?: string, credit?: string): string {
  return [caption, credit && `(${credit})`].filter(Boolean).join(" ");
}
