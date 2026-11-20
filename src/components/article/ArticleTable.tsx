/**
 * Data table. Narrow tables wrap; wide ones (≥4 columns) scroll inside their
 * own focusable region and never widen the page.
 */
export function ArticleTable({
  caption,
  header,
  rows,
  source,
}: {
  caption?: string;
  header: string[];
  rows: string[][];
  source?: string;
}) {
  const wide = header.length >= 4;
  return (
    <figure className="my-9">
      <div
        className="overflow-x-auto rounded-lg border border-line"
        role="region"
        aria-label={caption ?? "Tabel"}
        tabIndex={wide ? 0 : undefined}
      >
        <table
          className="w-full border-collapse font-sans text-[0.875rem] leading-snug md:text-[0.9375rem]"
          style={wide ? { minWidth: `${header.length * 9}rem` } : undefined}
        >
          {caption && (
            <caption className="font-display border-b border-line bg-warm px-4 py-3 text-left text-[1.0625rem] font-bold text-ink">
              {caption}
            </caption>
          )}
          <thead>
            <tr>
              {header.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-b border-line px-3.5 py-2.5 text-left text-[0.75rem] font-semibold tracking-[0.06em] text-muted uppercase md:px-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line first:border-t-0 even:bg-warm/60">
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-3.5 py-3 text-left align-top font-semibold text-ink md:px-4">
                      {c}
                    </th>
                  ) : (
                    <td key={j} className="px-3.5 py-3 align-top text-ink md:px-4">
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {source && <figcaption className="meta mt-2">Sumber: {source}</figcaption>}
    </figure>
  );
}
