import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { ELLIPSIS, pageNumbers, pageRange } from "@/lib/admin-pagination";

// Komponen navigasi halaman berbasis <Link href> tanpa JS.
// Diadaptasi dari Busacare NavigasiHalaman ke token desain admin SUMENEP.
export function PaginationNav({
  page,
  pages,
  total,
  perPage,
  hrefForPage,
  noun = "artikel",
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  hrefForPage: (page: number) => string;
  noun?: string;
}) {
  const { from, to } = pageRange(page, perPage, total);
  const tokens = pageNumbers(page, pages);
  const hasPrev = page > 1;
  const hasNext = page < pages;

  const box = "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm font-semibold tabular-nums transition-colors";
  const disabledBox = `${box} cursor-not-allowed border border-line bg-paper text-muted opacity-50`;
  const linkBox = `${box} border border-line bg-paper text-ink hover:border-ink/40 hover:bg-warm`;

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted tabular-nums" aria-live="polite">
        {total === 0 ? (
          <>Tidak ada {noun}</>
        ) : (
          <>
            Menampilkan{" "}
            <span className="font-semibold text-ink">
              {from}&ndash;{to}
            </span>{" "}
            dari <span className="font-semibold text-ink">{total.toLocaleString("id-ID")}</span> {noun}
            {pages > 1 && (
              <>
                {" "}
                &middot; halaman {page} dari {pages}
              </>
            )}
          </>
        )}
      </p>

      {pages > 1 && (
        <nav aria-label="Navigasi halaman" className="flex flex-wrap items-center gap-1.5">
          {hasPrev ? (
            <Link href={hrefForPage(page - 1)} rel="prev" className={linkBox} aria-label="Halaman sebelumnya">
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="ml-0.5 hidden sm:inline">Sebelumnya</span>
            </Link>
          ) : (
            <span className={disabledBox} aria-disabled="true">
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="ml-0.5 hidden sm:inline">Sebelumnya</span>
            </span>
          )}

          {tokens.map((token, idx) =>
            token === ELLIPSIS ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-sm text-muted" aria-hidden="true">
                {ELLIPSIS}
              </span>
            ) : token === page ? (
              <span key={token} aria-current="page" className={`${box} bg-brand text-white`}>
                {token}
              </span>
            ) : (
              <Link key={token} href={hrefForPage(token)} className={linkBox} aria-label={`Halaman ${token}`}>
                {token}
              </Link>
            ),
          )}

          {hasNext ? (
            <Link href={hrefForPage(page + 1)} rel="next" className={linkBox} aria-label="Halaman berikutnya">
              <span className="mr-0.5 hidden sm:inline">Berikutnya</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={disabledBox} aria-disabled="true">
              <span className="mr-0.5 hidden sm:inline">Berikutnya</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
