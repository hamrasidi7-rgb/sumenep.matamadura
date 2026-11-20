import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/** Prev / next pagination using ?halaman=N (page 1 has no parameter). */
export function Pagination({ basePath, page, totalPages, query }: { basePath: string; page: number; totalPages: number; query?: Record<string, string> }) {
  if (totalPages <= 1) return null;
  const href = (n: number) => {
    const p = new URLSearchParams(query);
    if (n > 1) p.set("halaman", String(n));
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const btn = "tap gap-1.5 rounded-full border border-line px-4 font-sans text-sm font-medium text-ink hover:border-ink";
  return (
    <nav aria-label="Halaman" className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={btn}>
          <ChevronLeft aria-hidden className="size-4" /> Sebelumnya
        </Link>
      ) : (
        <span />
      )}
      <span className="meta">
        Halaman {page} dari {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" className={btn}>
          Berikutnya <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
