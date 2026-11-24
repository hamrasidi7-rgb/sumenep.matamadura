import { useId } from "react";

// Grafik garis SVG murni tanpa pustaka chart eksternal.
// Diadaptasi dari Busacare GrafikPengunjung (components/admin/grafik-pengunjung.tsx)
// menggunakan palet SUMENEP (--brand / --muted / --line) + tabel sr-only untuk pembaca layar.

export interface TrendPoint {
  date: string; // YYYY-MM-DD atau YYYYMMDD
  current: number;
  previous: number;
}

const NUM_FORMATTER = new Intl.NumberFormat("id-ID");
const AXIS_FORMATTER = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const SHORT_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatDateLabel(raw: string, long = false): string {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
  if (!match) return raw;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return (long ? LONG_DATE : SHORT_DATE).format(dt);
}

function safeNonNeg(val: number): number {
  return Number.isFinite(val) ? Math.max(0, val) : 0;
}

export function TrendChart({
  title,
  subtitle,
  points,
  currentLabel = "28 hari terakhir",
  previousLabel = "28 hari sebelumnya",
  emptyMessage = "Belum ada data untuk ditampilkan.",
}: {
  title: string;
  subtitle: string;
  points: TrendPoint[];
  currentLabel?: string;
  previousLabel?: string;
  emptyMessage?: string;
}) {
  const id = useId();
  const data = points.map((p) => ({
    date: p.date,
    current: safeNonNeg(p.current),
    previous: safeNonNeg(p.previous),
  }));

  if (data.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-paper p-5" aria-labelledby={`${id}-heading`}>
        <h2 id={`${id}-heading`} className="font-display text-lg font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{emptyMessage}</p>
      </section>
    );
  }

  const maxVal = Math.max(...data.flatMap((p) => [p.current, p.previous]));
  const step = Math.max(1, Math.ceil(maxVal / 4));
  const ceiling = step * 4;
  const top = 8;
  const bottom = 212;
  const xAt = (idx: number) => (data.length === 1 ? 360 : 8 + (idx * 704) / (data.length - 1));
  const yAt = (val: number) => bottom - (val / ceiling) * (bottom - top);
  const polylinePoints = (key: "current" | "previous") =>
    data.map((row, idx) => `${xAt(idx)},${yAt(row[key])}`).join(" ");

  const tickIndices = [
    ...new Set([
      0,
      Math.round((data.length - 1) / 4),
      Math.round((data.length - 1) / 2),
      Math.round(((data.length - 1) * 3) / 4),
      data.length - 1,
    ]),
  ];
  const midIdx = Math.round((data.length - 1) / 2);

  return (
    <section className="rounded-xl border border-line bg-paper p-5" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-1 text-xs text-muted">{subtitle}</p>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink" aria-hidden="true">
        <span className="inline-flex items-center gap-2">
          <span className="w-6 border-t-[3px] border-brand" />
          {currentLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-6 border-t-2 border-dashed border-muted" />
          {previousLabel}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <div
          className="flex h-44 w-10 shrink-0 flex-col justify-between text-right text-xs text-muted tabular-nums sm:h-52"
          aria-hidden="true"
        >
          {[4, 3, 2, 1, 0].map((idx) => (
            <span key={idx}>{AXIS_FORMATTER.format(idx * step)}</span>
          ))}
        </div>

        <svg
          className="h-44 w-0 min-w-0 flex-1 sm:h-52"
          viewBox="0 0 720 220"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={`${id}-svg-title ${id}-svg-desc`}
        >
          <title id={`${id}-svg-title`}>{title}</title>
          <desc id={`${id}-svg-desc`}>
            Grafik tren dari {formatDateLabel(data[0].date, true)} sampai {formatDateLabel(data[data.length - 1].date, true)}.
          </desc>
          {[0, 1, 2, 3, 4].map((idx) => (
            <line
              key={idx}
              x1="0"
              x2="720"
              y1={top + (idx * (bottom - top)) / 4}
              y2={top + (idx * (bottom - top)) / 4}
              className="stroke-line"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            points={polylinePoints("previous")}
            fill="none"
            className="stroke-muted"
            strokeWidth="2"
            strokeDasharray="6 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={polylinePoints("current")}
            fill="none"
            className="stroke-brand"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {data.length === 1 && (
            <>
              <circle cx={xAt(0)} cy={yAt(data[0].previous)} r="3" className="fill-muted" />
              <circle cx={xAt(0)} cy={yAt(data[0].current)} r="4" className="fill-brand" />
            </>
          )}
        </svg>
      </div>

      <div className="ml-12 mt-2 flex justify-between text-xs text-muted" aria-hidden="true">
        {tickIndices.map((idx) => (
          <span
            key={idx}
            className={idx === 0 || idx === midIdx || idx === data.length - 1 ? "" : "hidden sm:inline"}
          >
            {formatDateLabel(data[idx].date)}
          </span>
        ))}
      </div>

      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">{currentLabel}</th>
              <th scope="col">{previousLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={`${row.date}-${idx}`}>
                <th scope="row">{formatDateLabel(row.date, true)}</th>
                <td>{NUM_FORMATTER.format(row.current)}</td>
                <td>{NUM_FORMATTER.format(row.previous)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
