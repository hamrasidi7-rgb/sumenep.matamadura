import type { DocNode } from "@/lib/article-doc";

// "| Kolom 1 | Kolom 2 |" text pasted from a document or chat becomes a real
// table. Ported unchanged in behaviour from Busacare lib/artikel-teks.ts
// (apakahBarisTabelPipa, pecahSelTabelPipa, apakahBarisPemisahTabelPipa,
// bangunNodeTabelDariBarisPipa).

export function isPipeRow(line: string): boolean {
  const b = line.trim();
  if (!b.startsWith("|") || !b.endsWith("|") || b.length < 3) return false;
  return b.slice(1, -1).includes("|");
}

export function pipeCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((s) => s.trim());
}

export function isPipeSeparator(cells: string[]): boolean {
  return cells.length >= 2 && cells.every((s) => /^:?-{2,}:?$/.test(s));
}

/** First row becomes the header row; a "|---|---|" line is skipped; rows are padded to equal width. */
export function tableFromPipeRows(lines: string[]): DocNode | null {
  const all = lines.map(pipeCells).filter((cells) => cells.length >= 2);
  const rows = all.filter((cells, i) => !(i === 1 && isPipeSeparator(cells)));
  if (rows.length < 2) return null;
  const width = rows[0].length;
  if (width < 2) return null;
  return {
    type: "table",
    attrs: { caption: "", source: "" },
    content: rows.map((cells, r) => ({
      type: "tableRow",
      content: Array.from({ length: width }, (_, c) => {
        const text = (cells[c] ?? "").trim();
        return {
          type: r === 0 ? "tableHeader" : "tableCell",
          content: [text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" }],
        };
      }),
    })),
  };
}
