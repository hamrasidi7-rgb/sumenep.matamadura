// Penghitung kata adaptasi komponen Busacare PenghitungKata ke token UI SUMENEP.
export function countWords(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

export function WordCounter({
  text,
  wordCount,
  recommendedMin,
  recommendedContext = "untuk profil penulis",
  extra,
  id,
}: {
  text?: string;
  wordCount?: number;
  recommendedMin?: number;
  recommendedContext?: string;
  extra?: string;
  id?: string;
}) {
  const words = wordCount ?? countWords(text ?? "");
  const enough = recommendedMin === undefined || words >= recommendedMin;
  return (
    <p id={id} className={`mt-1 text-xs ${enough && recommendedMin ? "text-emerald-800" : "text-muted"}`} aria-live="polite">
      {words.toLocaleString("id-ID")} kata
      {extra ? ` · ${extra}` : null}
      {recommendedMin ? (
        enough ? (
          ` · memadai ${recommendedContext}.`
        ) : (
          ` · disarankan minimal ${recommendedMin} kata ${recommendedContext}.`
        )
      ) : null}
    </p>
  );
}
