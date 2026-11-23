import { STATE_LABEL, type ArticleState } from "@/server/articles/status";

// Colour always paired with the word (never colour alone) — Busacare rule.
const STYLE: Record<ArticleState, string> = {
  draf: "bg-warm text-ink",
  terjadwal: "bg-amber-100 text-amber-900",
  terbit: "bg-emerald-100 text-emerald-900",
  arsip: "bg-slate-200 text-slate-800",
  sampah: "bg-blush text-brand-deep",
};

export function StateBadge({ state }: { state: ArticleState | null }) {
  if (!state) return <span className="admin-badge bg-warm text-muted">Baru</span>;
  return <span className={`admin-badge ${STYLE[state]}`}>{STATE_LABEL[state]}</span>;
}
