"use client";

import { AlertTriangle, Ban, CheckCircle2, ChevronDown, HelpCircle, MinusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  analyzeBody,
  runSeoChecks,
  summarize,
  type ArticleSeoInput,
  type SeoField,
  type SeoFinding,
  type SeoStatus,
} from "@/lib/seo-engine";

// Panel SEO di editor artikel — adaptasi lengkap Busacare components/admin/editor/seo-panel.tsx:
// ringkasan satu baris (bukan skor), ringkasan jumlah temuan per kategori pada header,
// keadaan awal yang bersih saat artikel masih kosong, dan tombol lompat ke kolom terkait.

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

export function SeoPanel({
  input,
  onField,
}: {
  input: ArticleSeoInput;
  onField?: (field: SeoField) => void;
}) {
  const debounced = useDebounced(input, 500);
  const findings = useMemo(() => runSeoChecks(debounced), [debounced]);
  const total = useMemo(() => summarize(findings), [findings]);
  const isEmptyDraft = useMemo(
    () => !debounced.title.trim() && analyzeBody(debounced.body).wordCount === 0,
    [debounced],
  );
  const groups = (Object.keys(CATEGORY) as SeoFinding["category"][]).map(
    (c) => [c, findings.filter((f) => f.category === c)] as const,
  );

  return (
    <div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-warm px-3 py-2 text-sm">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> {total.pass} sesuai
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden /> {total.warning} perlu diperiksa
        </span>
        <span className="flex items-center gap-1">
          <MinusCircle className="size-4 text-brand" aria-hidden /> {total.missing} belum diisi
        </span>
      </p>

      {isEmptyDraft ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Tulis judul dan isi artikel dulu — pemeriksaan SEO berjalan otomatis dan hasilnya muncul di sini per kategori.
        </p>
      ) : (
        <div className="mt-2 divide-y divide-line">
          {groups.map(([category, items]) => {
            if (!items.length) return null;
            const passCount = items.filter((i) => i.status === "PASS").length;
            const warningCount = items.filter((i) => i.status === "WARNING").length;
            const missingCount = items.filter((i) => i.status === "MISSING").length;
            const hasAttention = warningCount > 0 || missingCount > 0;

            return (
              <details key={category} className="group py-2" open={hasAttention}>
                <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 text-sm font-semibold">
                  <span className="min-w-0 flex-1 truncate text-ink">{CATEGORY[category]}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted tabular-nums">
                    {passCount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <CheckCircle2 className="size-3.5 text-emerald-700" aria-hidden />
                        {passCount}
                      </span>
                    )}
                    {warningCount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
                        {warningCount}
                      </span>
                    )}
                    {missingCount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <MinusCircle className="size-3.5 text-brand" aria-hidden />
                        {missingCount}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted transition-transform duration-150 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <ul className="mt-2 space-y-2">
                  {items.map((f) => {
                    const { Icon, className } = ICON[f.status];
                    return (
                      <li key={f.id} className="flex items-start gap-2 text-sm">
                        <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
                        <div className="min-w-0">
                          <p>{f.message}</p>
                          {f.suggestion && <p className="text-xs text-muted">{f.suggestion}</p>}
                          {f.field && onField && f.status !== "PASS" && f.status !== "NOT_APPLICABLE" && (
                            <button
                              type="button"
                              onClick={() => onField(f.field!)}
                              className="text-xs font-semibold text-brand hover:underline"
                            >
                              → ke kolom terkait
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <details className="mt-3 border-t border-line pt-2.5">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted hover:text-ink">
          <span className="inline-flex items-center gap-1">
            <HelpCircle className="size-3.5" aria-hidden />
            Tentang pemeriksaan SEO
          </span>
        </summary>
        <p className="mt-1.5 text-xs italic text-muted">
          Pemeriksaan bantu, bukan skor peringkat. Tidak menjamin indeksasi atau peringkat di mesin pencari.
        </p>
      </details>
    </div>
  );
}
