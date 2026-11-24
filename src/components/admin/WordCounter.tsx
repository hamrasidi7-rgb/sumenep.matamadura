// Penghitung kata adaptasi komponen Busacare PenghitungKata ke token UI SUMENEP.
export function countWords(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

export function WordCounter({
  text,
  recommendedMin,
  id,
}: {
  text: string;
  recommendedMin?: number;
  id?: string;
}) {
  const words = countWords(text);
  const enough = recommendedMin === undefined || words >= recommendedMin;
  return (
    <p id={id} className={`mt-1 text-xs ${enough && recommendedMin ? "text-emerald-800" : "text-muted"}`} aria-live="polite">
      {words.toLocaleString("id-ID")} kata
      {recommendedMin ? (
        enough ? (
          " · memadai untuk profil penulis."
        ) : (
          ` · disarankan minimal ${recommendedMin} kata untuk konteks redaksi.`
        )
      ) : null}
    </p>
  );
}
