"use client";

import { AlertTriangle, Ban, CheckCircle2, MinusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { runSeoChecks, summarize, type ArticleSeoInput, type SeoField, type SeoFinding, type SeoStatus } from "@/lib/seo-engine";

// SEO findings next to the editor. Ported from Busacare components/admin/
// editor/seo-panel.tsx: one summary line (never a score), findings grouped
// by category, a "go to field" link, debounced so typing stays smooth.

const ICON: Record<SeoStatus, { Icon: typeof CheckCircle2; className: string }> = {
  PASS: { Icon: CheckCircle2, className: "text-emerald-700" },
  WARNING: { Icon: AlertTriangle, className: "text-amber-600" },
  MISSING: { Icon: MinusCircle, className: "text-brand" },
  NOT_APPLICABLE: { Icon: Ban, className: "text-muted" },
};

const CATEGORY: Record<SeoFinding["category"], string> = {
  "title-lead": "Judul & lead",
  structure: "Struktur",
  links: "Tautan",
  images: "Gambar",
  metadata: "Metadata",
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SeoPanel({ input, onField }: { input: ArticleSeoInput; onField?: (field: SeoField) => void }) {
  const debounced = useDebounced(input, 500);
  const findings = useMemo(() => runSeoChecks(debounced), [debounced]);
  const total = summarize(findings);
  const groups = (Object.keys(CATEGORY) as SeoFinding["category"][]).map((c) => [c, findings.filter((f) => f.category === c)] as const);

  return (
    <div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-warm px-3 py-2 text-sm">
        <span className="flex items-center gap-1"><CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> {total.pass} sesuai</span>
        <span className="flex items-center gap-1"><AlertTriangle className="size-4 text-amber-600" aria-hidden /> {total.warning} perlu diperiksa</span>
        <span className="flex items-center gap-1"><MinusCircle className="size-4 text-brand" aria-hidden /> {total.missing} belum diisi</span>
      </p>
      <div className="mt-2 divide-y divide-line">
        {groups.map(([category, items]) =>
          items.length ? (
            <details key={category} className="py-2" open={items.some((i) => i.status === "MISSING" || i.status === "WARNING")}>
              <summary className="cursor-pointer text-sm font-semibold">{CATEGORY[category]}</summary>
              <ul className="mt-2 space-y-2">
                {items.map((f) => {
                  const { Icon, className } = ICON[f.status];
                  return (
                    <li key={f.id} className="flex items-start gap-2 text-sm">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
                      <div>
                        <p>{f.message}</p>
                        {f.suggestion && <p className="text-xs text-muted">{f.suggestion}</p>}
                        {f.field && onField && f.status !== "PASS" && f.status !== "NOT_APPLICABLE" && (
                          <button type="button" onClick={() => onField(f.field!)} className="text-xs font-semibold text-brand hover:underline">
                            → ke kolom terkait
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null,
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Pemeriksaan bantu, bukan skor. Tidak menjamin peringkat di mesin pencari.</p>
    </div>
  );
}
