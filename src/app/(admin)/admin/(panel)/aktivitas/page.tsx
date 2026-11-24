import type { Metadata } from "next";
import Link from "next/link";

import { PaginationNav } from "@/components/admin/PaginationNav";
import {
  activityLabel,
  describeDevice,
  formatWib,
  loginReasonLabel,
} from "@/components/admin/format";
import {
  buildActivityHref,
  listActivityLogPage,
  parseActivityQuery,
  type ActivityActorFilter,
  type ActivityCategoryFilter,
} from "@/server/activity/queries";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Aktivitas & Keamanan" };
export const dynamic = "force-dynamic";

const CATEGORIES: readonly { value: ActivityCategoryFilter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "article", label: "Artikel" },
  { value: "media", label: "Media" },
  { value: "author", label: "Penulis" },
  { value: "section", label: "Kanal & Rubrik" },
  { value: "auth", label: "Keamanan & Auth" },
  { value: "site", label: "Pengaturan & Sistem" },
];

const ACTORS: readonly { value: ActivityActorFilter; label: string }[] = [
  { value: "semua", label: "Semua aktor" },
  { value: "ADMIN", label: "Admin" },
  { value: "CLI", label: "CLI" },
  { value: "SYSTEM", label: "Sistem" },
];

const ACTOR_BADGE: Record<string, string> = {
  ADMIN: "bg-blush text-brand-deep",
  CLI: "bg-sky-50 text-sky-900 border border-sky-200",
  SYSTEM: "bg-warm text-muted border border-line",
};

export default async function ActivityAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const query = parseActivityQuery(raw);
  const data = await listActivityLogPage(getDb(), query);
  const hasFilters = Boolean(
    data.query.q ||
      data.query.actor !== "semua" ||
      data.query.kategori !== "semua" ||
      data.query.dari ||
      data.query.sampai,
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">
            Aktivitas & Keamanan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Jejak audit append-only seluruh perubahan editorial, operasi CLI, dan riwayat percobaan login CMS.
          </p>
        </div>
        <Link href="/admin/akun" className="admin-button-quiet shrink-0">
          Kelola sesi & password &rarr;
        </Link>
      </div>

      {/* Ringkasan 4 KPI */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Aktivitas 7 hari</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {data.stats.activityLast7Days.toLocaleString("id-ID")}
          </p>
          <p className="mt-0.5 text-xs text-muted">Peristiwa tercatat di audit log</p>
        </div>
        <Link
          href="/admin/akun"
          className="rounded-xl border border-line bg-paper p-4 transition-colors hover:border-ink/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sesi admin aktif</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {data.stats.activeSessions.toLocaleString("id-ID")}
          </p>
          <p className="mt-0.5 text-xs text-brand">Kelola perangkat di Akun &rarr;</p>
        </Link>
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Login gagal (7 hari)</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {data.stats.failedLoginsLast7Days.toLocaleString("id-ID")}
          </p>
          <p className="mt-0.5 text-xs text-muted">Percobaan ditolak / terkunci</p>
        </div>
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hasil filter</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {data.stats.filteredTotal.toLocaleString("id-ID")}
          </p>
          <p className="mt-0.5 text-xs text-muted">Log sesuai kriteria saat ini</p>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="mt-6 rounded-xl border border-line bg-paper p-4" aria-label="Filter aktivitas">
        <form method="get" action="/admin/aktivitas" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_9.5rem_9.5rem_auto]">
          {data.query.kategori !== "semua" && (
            <input type="hidden" name="kategori" value={data.query.kategori} />
          )}
          <label className="block text-xs font-semibold text-muted">
            Cari ringkasan / aksi / IP
            <input
              type="search"
              name="q"
              defaultValue={data.query.q}
              placeholder="Mis. article.publish, 127.0.0.1, Garam..."
              className="admin-input mt-1 w-full text-sm font-normal"
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Aktor
            <select name="actor" defaultValue={data.query.actor} className="admin-input mt-1 w-full text-sm font-normal">
              {ACTORS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Dari (WIB)
            <input type="date" name="dari" defaultValue={data.query.dari} className="admin-input mt-1 w-full text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Sampai (WIB)
            <input type="date" name="sampai" defaultValue={data.query.sampai} className="admin-input mt-1 w-full text-sm font-normal" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="admin-button min-h-10">
              Terapkan
            </button>
            {hasFilters && (
              <Link href="/admin/aktivitas" className="admin-button-quiet min-h-10">
                Reset
              </Link>
            )}
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3" aria-label="Filter kategori aksi">
          {CATEGORIES.map((cat) => {
            const active = data.query.kategori === cat.value;
            return (
              <Link
                key={cat.value}
                href={buildActivityHref({ ...data.query, kategori: cat.value, page: 1 })}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "border border-line bg-paper text-muted hover:text-ink"
                }`}
              >
                {cat.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Log Aktivitas + Sidebar Keamanan Login */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl border border-line bg-paper p-5" aria-labelledby="daftar-log">
          <h2 id="daftar-log" className="font-display text-lg font-semibold">
            Log aktivitas redaksi &amp; sistem
          </h2>

          {data.logs.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Belum ada catatan aktivitas yang cocok dengan filter ini.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {data.logs.map((log) => (
                <li key={log.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          ACTOR_BADGE[log.actor] ?? "bg-warm text-ink"
                        }`}
                      >
                        {log.actor}
                      </span>
                      <span className="text-sm font-semibold text-ink">
                        {activityLabel(log.action)}
                      </span>
                      <code className="rounded bg-warm px-1.5 py-0.5 text-[11px] text-muted">
                        {log.action}
                      </code>
                    </div>
                    <time className="text-xs text-muted tabular-nums">
                      {formatWib(log.createdAt)}
                    </time>
                  </div>

                  {log.summary && (
                    <p className="mt-1 text-sm text-ink">{log.summary}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {log.adminName && <span>Oleh {log.adminName}</span>}
                    {log.ip && <span>IP {log.ip}</span>}
                    {log.userAgent && <span>{describeDevice(log.userAgent)}</span>}
                    {log.entityHref && (
                      <Link href={log.entityHref} className="font-semibold text-brand hover:underline">
                        Lihat entitas &rarr;
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <PaginationNav
            page={data.page}
            pages={data.pages}
            total={data.stats.filteredTotal}
            perPage={data.perPage}
            noun="catatan"
            hrefForPage={(nextPage) => buildActivityHref({ ...data.query, page: nextPage })}
          />
        </section>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-line bg-paper p-5" aria-labelledby="percobaan-login">
            <h2 id="percobaan-login" className="font-display text-lg font-semibold">
              Riwayat percobaan login
            </h2>
            <p className="mt-1 text-xs text-muted">
              15 percobaan masuk terakhir untuk memantau akses tidak sah atau penguncian.
            </p>

            {data.loginAttempts.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Belum ada catatan percobaan login.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {data.loginAttempts.map((attempt) => (
                  <li key={attempt.id} className="py-3 first:pt-0 last:pb-0 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          attempt.success
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-blush text-brand-deep"
                        }`}
                      >
                        {loginReasonLabel(attempt.reason)}
                      </span>
                      <span className="text-muted tabular-nums">{formatWib(attempt.createdAt)}</span>
                    </div>
                    <p className="mt-1 truncate font-semibold text-ink">{attempt.email || "—"}</p>
                    <p className="mt-0.5 text-muted">
                      IP {attempt.ip ?? "—"} &middot; {describeDevice(attempt.userAgent)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
