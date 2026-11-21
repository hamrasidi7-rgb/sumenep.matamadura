import type { Metadata } from "next";

import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { describeDevice, formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import { requireAdmin } from "@/server/auth/next";
import { listActiveSessions } from "@/server/auth/sessions";
import { getDb } from "@/server/db";

import { logoutEverywhereAction, revokeSessionAction } from "../../actions";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata: Metadata = { title: "Akun & Keamanan" };

const STATUS: Record<string, { tone: "success" | "error"; text: string }> = {
  "password-diganti": { tone: "success", text: "Password berhasil diganti. Semua sesi lama dicabut; perangkat ini memakai sesi baru." },
  "sesi-dicabut": { tone: "success", text: "Sesi tersebut sudah dicabut." },
  "sesi-tidak-valid": { tone: "error", text: "Sesi tidak ditemukan atau sudah berakhir." },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const status = typeof params.status === "string" ? STATUS[params.status] : undefined;
  const sessions = await listActiveSessions(getDb());

  return (
    <>
      <AdminHeader adminName={session.admin.name} current="/admin/akun" />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <h1 className="font-display text-[2rem] leading-tight font-semibold">Akun & Keamanan</h1>
        {status && (
          <div className="mt-5">
            <Notice tone={status.tone}>{status.text}</Notice>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <section className="admin-card" aria-labelledby="profil">
            <h2 id="profil" className="font-display text-xl font-semibold">
              Profil
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted">Nama</dt>
                <dd className="font-semibold">{session.admin.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Email login</dt>
                <dd className="font-semibold break-all">{session.admin.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Peran</dt>
                <dd className="font-semibold">Admin (satu-satunya akun CMS)</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Email dan nama diubah oleh operator lewat <code>npm run admin:recover</code>. Tidak ada akun lain dan tidak ada
              pendaftaran.
            </p>
          </section>

          <section className="admin-card" aria-labelledby="ganti-password">
            <h2 id="ganti-password" className="font-display text-xl font-semibold">
              Ganti password
            </h2>
            <p className="mt-1 text-sm text-muted">
              Minimal 15 karakter. Setelah diganti, semua sesi lain otomatis keluar.
            </p>
            <ChangePasswordForm />
          </section>
        </div>

        <section className="admin-card mt-6" aria-labelledby="sesi-aktif">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="sesi-aktif" className="font-display text-xl font-semibold">
              Sesi aktif ({sessions.length})
            </h2>
            <form action={logoutEverywhereAction}>
              <ConfirmButton
                question="Keluar dari semua perangkat, termasuk perangkat ini?"
                pendingLabel="Mencabut semua sesi…"
                className="admin-button"
              >
                Keluar dari semua perangkat
              </ConfirmButton>
            </form>
          </div>

          <ul className="mt-4 divide-y divide-line">
            {sessions.map((item) => {
              const current = item.id === session.id;
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold">
                      {describeDevice(item.userAgent)}
                      {current && (
                        <span className="ml-2 rounded bg-blush px-1.5 py-0.5 text-xs font-semibold text-brand-deep">Perangkat ini</span>
                      )}
                    </p>
                    <p className="text-muted">
                      IP {item.ip ?? "–"} · masuk {formatWib(item.createdAt)} · aktif {formatWib(item.lastSeenAt)}
                    </p>
                  </div>
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={item.id} />
                    <ConfirmButton
                      question={current ? "Keluar dari perangkat ini?" : "Cabut sesi di perangkat tersebut?"}
                      className="admin-button-quiet min-h-10 px-3"
                    >
                      {current ? "Keluar" : "Cabut"}
                    </ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
