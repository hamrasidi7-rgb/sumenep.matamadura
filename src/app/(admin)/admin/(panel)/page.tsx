import { CalendarClock, FilePlus2, Newspaper, PenLine, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StateBadge } from "@/components/admin/articles/StateBadge";
import { activityLabel, formatBytes, formatWib } from "@/components/admin/format";
import { requireAdmin } from "@/server/auth/next";
import { getDashboardOverview } from "@/server/dashboard/queries";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Dashboard" };

const num = new Intl.NumberFormat("id-ID");

const QUICK_LINKS = [
  {
    href: "/admin/artikel/baru",
    label: "Tulis artikel baru",
    description: "Buka ruang tulis kosong",
    icon: FilePlus2,
  },
  {
    href: "/admin/artikel",
    label: "Semua artikel",
    description: "Cari dan saring berita",
    icon: Newspaper,
  },
  {
    href: "/admin/artikel?status=draf",
    label: "Lanjutkan draf",
    description: "Tulisan yang belum diterbitkan",
    icon: PenLine,
  },
  {
    href: "/admin/akun",
    label: "Akun & Keamanan",
    description: "Password dan sesi perangkat",
    icon: ShieldCheck,
  },
] as const;

export default async function DashboardPage() {
  const session = await requireAdmin();
  const overview = await getDashboardOverview(getDb());
  const { articles, sections, authors, media, security, recent, scheduled, activity } = overview;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold md:text-[2rem]">
            Selamat datang, {session.admin.name}
          </h1>
          <p className="mt-1 text-sm text-muted break-words">
            Masuk sebagai {session.admin.email}. Sesi berakhir otomatis setelah 8 jam tanpa aktivitas.
          </p>
        </div>
        <Link href="/admin/artikel/baru" className="admin-button shrink-0">
          <FilePlus2 className="size-4" aria-hidden="true" />
          Tulis artikel
        </Link>
      </div>

      {/* Ringkasan statistik redaksi (4 kartu KPI nyata, adaptasi pola kartu metrik Busacare) */}
      <section className="mt-8" aria-label="Ringkasan statistik redaksi">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="admin-card flex flex-col justify-between" aria-labelledby="kpi-terbit">
            <div>
              <h2 id="kpi-terbit" className="text-sm font-semibold text-muted">
                Artikel terbit
              </h2>
              <p className="font-display mt-2 text-3xl leading-none font-semibold tabular-nums">
                {num.format(articles.terbit)}
              </p>
              <p className="mt-2 text-xs text-muted">
                {num.format(articles.semua)} aktif di luar sampah · {num.format(articles.arsip)} diarsipkan
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
              <Link href="/admin/artikel?status=terbit" className="text-brand underline-offset-4 hover:underline">
                Terbit →
              </Link>
              <Link href="/admin/artikel?status=arsip" className="text-muted underline-offset-4 hover:text-ink hover:underline">
                Arsip ({num.format(articles.arsip)})
              </Link>
            </div>
          </article>

          <article className="admin-card flex flex-col justify-between" aria-labelledby="kpi-antrean">
            <div>
              <h2 id="kpi-antrean" className="text-sm font-semibold text-muted">
                Draf & terjadwal
              </h2>
              <p className="font-display mt-2 text-3xl leading-none font-semibold tabular-nums">
                {num.format(articles.draf)}
                <span className="ml-1.5 font-sans text-sm font-normal text-muted">
                  draf · {num.format(articles.terjadwal)} terjadwal
                </span>
              </p>
              <p className="mt-2 text-xs text-muted">
                {num.format(articles.sampah)} artikel di tempat sampah
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
              <Link href="/admin/artikel?status=draf" className="text-brand underline-offset-4 hover:underline">
                Draf ({num.format(articles.draf)})
              </Link>
              <Link href="/admin/artikel?status=terjadwal" className="text-brand underline-offset-4 hover:underline">
                Terjadwal ({num.format(articles.terjadwal)})
              </Link>
              <Link href="/admin/artikel?status=sampah" className="text-muted underline-offset-4 hover:text-ink hover:underline">
                Sampah ({num.format(articles.sampah)})
              </Link>
            </div>
          </article>

          <article className="admin-card flex flex-col justify-between" aria-labelledby="kpi-media">
            <div>
              <h2 id="kpi-media" className="text-sm font-semibold text-muted">
                Pustaka media
              </h2>
              <p className="font-display mt-2 text-3xl leading-none font-semibold tabular-nums">
                {num.format(media.count)}
                <span className="ml-1.5 font-sans text-sm font-normal text-muted">berkas</span>
              </p>
              <p className="mt-2 text-xs text-muted tabular-nums">
                Ukuran tersimpan: {formatBytes(media.totalBytes)}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">
              Unggahan gambar WebP yang tercatat di database.
            </p>
          </article>

          <article className="admin-card flex flex-col justify-between" aria-labelledby="kpi-struktur">
            <div>
              <h2 id="kpi-struktur" className="text-sm font-semibold text-muted">
                Struktur redaksi
              </h2>
              <p className="font-display mt-2 text-3xl leading-none font-semibold tabular-nums">
                {num.format(sections.kanalActive)}
                <span className="mx-1.5 font-sans text-sm font-normal text-muted">kanal ·</span>
                {num.format(sections.rubrikActive)}
                <span className="ml-1.5 font-sans text-sm font-normal text-muted">rubrik</span>
              </p>
              <p className="mt-2 text-xs text-muted">
                {num.format(authors.active)} penulis aktif
                {authors.total > authors.active ? ` dari ${num.format(authors.total)} terdaftar` : ""}
              </p>
            </div>
            <div className="mt-3 text-sm font-semibold">
              <Link href="/admin/artikel" className="text-brand underline-offset-4 hover:underline">
                Semua artikel →
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* Tautan cepat (adaptasi pola Quick Links Busacare app/admin/(dashboard)/page.tsx) */}
      <section className="mt-6" aria-labelledby="tautan-cepat">
        <h2 id="tautan-cepat" className="font-display text-lg font-semibold">
          Tautan cepat
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-14 items-start gap-3 rounded-lg border border-line bg-paper p-4 shadow-sm transition-colors hover:border-brand"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-blush text-brand-deep">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{item.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Informasi sesi & keamanan (dipertahankan penuh dari dashboard SUMENEP) */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="admin-card" aria-labelledby="card-sesi">
          <h2 id="card-sesi" className="text-sm font-semibold text-muted">
            Sesi ini
          </h2>
          <p className="mt-2 text-sm">Login: {formatWib(session.createdAt)}</p>
          <p className="mt-1 text-sm">Berakhir bila tidak aktif: {formatWib(session.expiresAt)}</p>
        </section>

        <section className="admin-card" aria-labelledby="card-keamanan">
          <h2 id="card-keamanan" className="text-sm font-semibold text-muted">
            Keamanan
          </h2>
          <p className="mt-2 text-sm">Login gagal 24 jam terakhir: {num.format(security.failedLogins24h)}</p>
          <Link href="/admin/akun" className="mt-1 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline">
            Akun & Keamanan →
          </Link>
        </section>
      </div>

      {/* Antrean terjadwal (bila ada) & artikel terakhir disunting */}
      {(scheduled.length > 0 || recent.length > 0) && (
        <div className={`mt-6 grid items-start gap-6 ${scheduled.length > 0 && recent.length > 0 ? "lg:grid-cols-2" : ""}`}>
          {scheduled.length > 0 && (
            <section className="admin-card" aria-labelledby="terjadwal">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="terjadwal" className="font-display flex items-center gap-2 text-xl font-semibold">
                  <CalendarClock className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
                  Jadwal tayang terdekat
                </h2>
                <Link href="/admin/artikel?status=terjadwal" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">
                  Semua ({num.format(articles.terjadwal)}) →
                </Link>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {scheduled.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm">
                    <Link href={`/admin/artikel/${a.id}`} className="font-semibold break-words hover:text-brand">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{[a.kanal, a.rubrik].filter(Boolean).join(" · ") || "Tanpa kanal/rubrik"}</span>
                      <span>·</span>
                      <span className="tabular-nums">Tayang {formatWib(a.publishedAt)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recent.length > 0 && (
            <section className="admin-card" aria-labelledby="terakhir">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="terakhir" className="font-display text-xl font-semibold">
                  Terakhir disunting
                </h2>
                <Link href="/admin/artikel" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">
                  Semua artikel →
                </Link>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {recent.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <Link href={`/admin/artikel/${a.id}`} className="font-semibold break-words hover:text-brand">
                        {a.title}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <StateBadge state={a.state} />
                        <span>{[a.kanal, a.rubrik].filter(Boolean).join(" · ") || "Tanpa kanal/rubrik"}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted tabular-nums sm:mt-0.5">{formatWib(a.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Aktivitas terbaru (dipertahankan penuh dari dashboard SUMENEP) */}
      <section className="admin-card mt-6" aria-labelledby="aktivitas">
        <h2 id="aktivitas" className="font-display text-xl font-semibold">
          Aktivitas terbaru
        </h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Belum ada catatan aktivitas.</p>
        ) : (
          <ol className="mt-4 divide-y divide-line">
            {activity.map((entry) => (
              <li key={entry.id.toString()} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:gap-4">
                <span className="shrink-0 text-muted tabular-nums sm:w-48">{formatWib(entry.createdAt)}</span>
                <span className="min-w-0 break-words">
                  <span className="font-semibold">{activityLabel(entry.action)}</span>
                  {entry.summary ? <span className="text-muted"> — {entry.summary}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">Catatan aktivitas tidak dapat diubah atau dihapus.</p>
      </section>
    </main>
  );
}
