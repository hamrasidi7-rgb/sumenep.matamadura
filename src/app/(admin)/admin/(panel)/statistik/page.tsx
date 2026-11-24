import type { Metadata } from "next";
import Link from "next/link";

import { TrendChart } from "@/components/admin/analytics/TrendChart";
import { formatWib } from "@/components/admin/format";
import { formatPeriodDelta, getEditorialAnalytics, type CountBreakdownRow } from "@/server/analytics/editorial";
import { getSearchConsoleSummaryCached, type SearchConsoleBreakdown } from "@/server/analytics/search-console";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Statistik Redaksi" };
export const dynamic = "force-dynamic";

const NUM = new Intl.NumberFormat("id-ID");

function safeSumenepPublicHref(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname === "sumenep.matamaduranews.com" || u.hostname.endsWith(".matamaduranews.com")
      ? u.href
      : null;
  } catch {
    return null;
  }
}

function BreakdownCard({
  title,
  subtitle,
  rows,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: CountBreakdownRow[];
  emptyText: string;
}) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="min-w-0 rounded-xl border border-line bg-paper p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => {
            const widthPct = row.count === 0 ? 0 : Math.max(4, Math.round((row.count / maxCount) * 100));
            return (
              <li key={row.id} className="space-y-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={row.href} className="min-w-0 truncate font-semibold text-ink hover:text-brand hover:underline">
                    {row.label}
                  </Link>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                    {NUM.format(row.count)} artikel
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-warm">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${widthPct}%` }} />
                </div>
                {row.sublabel && <p className="text-xs text-muted">{row.sublabel}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SearchConsoleList({
  title,
  breakdown,
  kind,
}: {
  title: string;
  breakdown: SearchConsoleBreakdown;
  kind: "query" | "page";
}) {
  const emptyNotice: Record<SearchConsoleBreakdown["status"], string> = {
    unconfigured: "Search Console belum dikonfigurasi pada variabel lingkungan.",
    denied: "Akses Search Console ditolak; periksa izin akun layanan Google.",
    failed: "Gagal mengambil data dari Google Search Console.",
    empty: `Belum ada data ${kind === "query" ? "kueri" : "halaman"} dalam 28 hari final.`,
    available: "",
  };

  return (
    <section className="min-w-0 rounded-xl border border-line bg-paper p-5">
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">Google Search Console · 28 hari data final · berdasarkan klik</p>
      {breakdown.status !== "available" ? (
        <p className="mt-3 text-sm text-muted">{emptyNotice[breakdown.status]}</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {breakdown.rows.map((row, idx) => {
            const href = kind === "page" ? safeSumenepPublicHref(row.text) : null;
            return (
              <li key={`${row.text}-${idx}`} className="py-2.5 text-sm first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-xs text-muted tabular-nums">{idx + 1}.</span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 break-all text-ink hover:text-brand hover:underline"
                    >
                      {row.text}
                    </a>
                  ) : (
                    <span className="min-w-0 break-words text-ink">{row.text}</span>
                  )}
                </div>
                <p className="mt-0.5 pl-4 text-xs text-muted tabular-nums">
                  {NUM.format(row.clicks)} klik &middot; {NUM.format(row.impressions)} tayangan
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default async function EditorialAnalyticsPage() {
  await requireAdmin();
  const [editorial, gsc] = await Promise.all([
    getEditorialAnalytics(getDb()),
    getSearchConsoleSummaryCached(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">
            Statistik Redaksi
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Ringkasan produksi konten SUMENEP dari MariaDB (28 hari terakhir vs 28 hari sebelumnya), distribusi kanal/penulis, dan integrasi opsional Search Console.
          </p>
        </div>
        <Link href="/admin/artikel" className="admin-button-quiet shrink-0">
          Buka daftar artikel &rarr;
        </Link>
      </div>

      {/* 4 KPI Produksi Internal */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Terbit 28 hari</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {NUM.format(editorial.totals.publishedLast28Days)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatPeriodDelta(editorial.totals.publishedLast28Days, editorial.totals.publishedPrev28Days)}
          </p>
        </div>
        <Link
          href="/admin/artikel?status=terbit"
          className="rounded-xl border border-line bg-paper p-4 transition-colors hover:border-ink/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total artikel tayang</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {NUM.format(editorial.totals.publishedTotal)}
          </p>
          <p className="mt-1 text-xs text-brand">Lihat artikel terbit &rarr;</p>
        </Link>
        <Link
          href="/admin/artikel?status=terjadwal"
          className="rounded-xl border border-line bg-paper p-4 transition-colors hover:border-ink/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Antrean terjadwal</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {NUM.format(editorial.totals.scheduled)}
          </p>
          <p className="mt-1 text-xs text-muted">Menunggu jadwal tayang (WIB)</p>
        </Link>
        <Link
          href="/admin/artikel?status=draf"
          className="rounded-xl border border-line bg-paper p-4 transition-colors hover:border-ink/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Draf &amp; Arsip</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {NUM.format(editorial.totals.drafts)}{" "}
            <span className="font-sans text-sm font-normal text-muted">
              draf &middot; {NUM.format(editorial.totals.archived)} arsip
            </span>
          </p>
          <p className="mt-1 text-xs text-brand">Buka draf redaksi &rarr;</p>
        </Link>
      </div>

      {/* Grafik Produksi Harian 28 Hari */}
      <div className="mt-6">
        <TrendChart
          title="Produksi artikel terbit per hari"
          subtitle="Perbandingan jumlah artikel yang terbit pada 28 hari terakhir (WIB) dibanding 28 hari sebelumnya."
          points={editorial.dailySeries}
        />
      </div>

      {/* Distribusi Kanal, Rubrik & Penulis */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <BreakdownCard
          title="Artikel terbit per Kanal"
          subtitle="Klik nama kanal untuk membuka daftar artikelnya"
          rows={editorial.kanalBreakdown}
          emptyText="Belum ada kanal terdaftar."
        />
        <BreakdownCard
          title="Artikel terbit per Rubrik"
          subtitle="Kategori tematik editorial"
          rows={editorial.rubrikBreakdown}
          emptyText="Belum ada rubrik terdaftar."
        />
        <BreakdownCard
          title="Kontribusi Penulis"
          subtitle="Jumlah artikel terbit berdasarkan byline"
          rows={editorial.authorBreakdown}
          emptyText="Belum ada profil penulis."
        />
      </div>

      {/* Komposisi Template + Kesiapan SEO + Jadwal Tayang */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Komposisi template</h2>
          <p className="mt-0.5 text-xs text-muted">Format penyajian artikel terbit</p>
          <dl className="mt-4 space-y-2.5 text-sm">
            {editorial.templateBreakdown.map((t) => (
              <div key={t.template} className="flex items-center justify-between border-b border-line pb-2 last:border-b-0 last:pb-0">
                <dt className="font-medium text-ink">{t.label}</dt>
                <dd className="font-semibold tabular-nums text-muted">{NUM.format(t.count)} artikel</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Kesiapan metadata SEO</h2>
          <p className="mt-0.5 text-xs text-muted">Pemantauan artikel terbit di database</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="rounded-lg bg-warm/60 p-3">
              <dt className="text-xs font-semibold text-muted">Meta description kosong</dt>
              <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                {NUM.format(editorial.seoReadiness.missingSeoDescription)} artikel
              </dd>
            </div>
            <div className="rounded-lg bg-warm/60 p-3">
              <dt className="text-xs font-semibold text-muted">Tanpa gambar OG khusus (memakai hero)</dt>
              <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                {NUM.format(editorial.seoReadiness.missingCustomOgMedia)} artikel
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Jadwal tayang terdekat</h2>
          <p className="mt-0.5 text-xs text-muted">Antrean artikel terjadwal (maks. 5)</p>
          {editorial.upcomingScheduled.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Belum ada artikel terjadwal saat ini.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-sm">
              {editorial.upcomingScheduled.map((item) => (
                <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/admin/artikel/${item.id}`} className="font-semibold text-ink hover:text-brand hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {item.kanalName} &middot; {formatWib(item.publishedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Integrasi Opsional Google Search Console */}
      <section className="mt-8 space-y-4 border-t border-line pt-6" aria-labelledby="gsc-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="gsc-heading" className="font-display text-xl font-semibold text-ink">
              Google Search Console (Opsional)
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Data pencarian organik 28 hari terakhir (rentang final {gsc.ranges.current.start} s.d. {gsc.ranges.current.end}).
            </p>
          </div>
          {gsc.siteUrl && (
            <span className="rounded-md bg-warm px-2.5 py-1 font-mono text-xs text-muted">
              {gsc.siteUrl}
            </span>
          )}
        </div>

        {gsc.status === "unconfigured" ? (
          <div className="rounded-xl border border-dashed border-line bg-paper p-5 text-sm text-muted">
            Google Search Console belum dikonfigurasi (<code className="text-xs">GSC_SITE_URL</code>,{" "}
            <code className="text-xs">GSC_CLIENT_EMAIL</code>, <code className="text-xs">GSC_PRIVATE_KEY</code>). Semua metrik produksi redaksi internal di atas tetap aktif secara penuh.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-paper p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Klik organik (28 hari)</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {gsc.status === "available" ? NUM.format(gsc.current.clicks) : "—"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {gsc.status === "available"
                    ? formatPeriodDelta(gsc.current.clicks, gsc.previous.clicks)
                    : "Belum ada data"}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-paper p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tayangan Google (28 hari)</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {gsc.status === "available" ? NUM.format(gsc.current.impressions) : "—"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {gsc.status === "available"
                    ? formatPeriodDelta(gsc.current.impressions, gsc.previous.impressions)
                    : "Belum ada data"}
                </p>
              </div>
            </div>

            {gsc.daily.length > 0 && (
              <TrendChart
                title="Klik pencarian harian (Search Console)"
                subtitle="Klik organik 28 hari terakhir di Google Search."
                points={gsc.daily.map((d) => ({ date: d.date, current: d.clicks, previous: 0 }))}
                currentLabel="Klik harian (28 hari)"
                previousLabel="Garis dasar"
              />
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <SearchConsoleList title="Kueri pencarian teratas" breakdown={gsc.queries} kind="query" />
              <SearchConsoleList title="Halaman teratas di Google" breakdown={gsc.pages} kind="page" />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
