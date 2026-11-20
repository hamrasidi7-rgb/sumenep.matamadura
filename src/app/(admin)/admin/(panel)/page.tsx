import type { Metadata } from "next";
import Link from "next/link";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { activityLabel, formatWib } from "@/components/admin/format";
import { requireAdmin } from "@/server/auth/next";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireAdmin();
  const db = getDb();
  const since = new Date(Date.now() - 24 * 3600_000);
  const [kanal, rubrik, articles, failedLogins, activity] = await Promise.all([
    db.section.count({ where: { kind: "KANAL" } }),
    db.section.count({ where: { kind: "RUBRIK" } }),
    db.article.count({ where: { deletedAt: null } }),
    db.loginAttempt.count({ where: { success: false, createdAt: { gt: since } } }),
    db.activityLog.findMany({
      orderBy: { id: "desc" },
      take: 8,
      select: { id: true, action: true, summary: true, createdAt: true },
    }),
  ]);

  return (
    <>
      <AdminHeader adminName={session.admin.name} current="/admin" />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
        <h1 className="font-display text-[2rem] leading-tight font-semibold">Selamat datang, {session.admin.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Masuk sebagai {session.admin.email}. Sesi berakhir otomatis setelah 8 jam tanpa aktivitas.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <section className="admin-card" aria-labelledby="card-sesi">
            <h2 id="card-sesi" className="text-sm font-semibold text-muted">
              Sesi ini
            </h2>
            <p className="mt-2 text-sm">Login: {formatWib(session.createdAt)}</p>
            <p className="mt-1 text-sm">Berakhir bila tidak aktif: {formatWib(session.expiresAt)}</p>
          </section>

          <section className="admin-card" aria-labelledby="card-konten">
            <h2 id="card-konten" className="text-sm font-semibold text-muted">
              Konten
            </h2>
            <p className="mt-2 text-sm">
              {kanal} kanal · {rubrik} rubrik · {articles} artikel
            </p>
            <p className="mt-1 text-sm text-muted">Pengelolaan artikel tersedia di Fase 4.</p>
          </section>

          <section className="admin-card" aria-labelledby="card-keamanan">
            <h2 id="card-keamanan" className="text-sm font-semibold text-muted">
              Keamanan
            </h2>
            <p className="mt-2 text-sm">Login gagal 24 jam terakhir: {failedLogins}</p>
            <Link href="/admin/akun" className="mt-1 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline">
              Akun & Keamanan →
            </Link>
          </section>
        </div>

        <section className="admin-card mt-6" aria-labelledby="aktivitas">
          <h2 id="aktivitas" className="font-display text-xl font-semibold">
            Aktivitas terbaru
          </h2>
          <ol className="mt-4 divide-y divide-line">
            {activity.map((entry) => (
              <li key={entry.id.toString()} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:gap-4">
                <span className="shrink-0 text-muted tabular-nums sm:w-48">{formatWib(entry.createdAt)}</span>
                <span>
                  <span className="font-semibold">{activityLabel(entry.action)}</span>
                  {entry.summary ? <span className="text-muted"> — {entry.summary}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Catatan aktivitas tidak dapat diubah atau dihapus.</p>
        </section>
      </main>
    </>
  );
}
