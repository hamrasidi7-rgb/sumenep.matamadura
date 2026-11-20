import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/Logo";
import { Notice } from "@/components/admin/Notice";
import { NOTICES } from "@/server/auth/messages";
import { getAdminSession } from "@/server/auth/next";
import { safeNextPath } from "@/server/auth/redirect";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk" };

// Public entry of the CMS. Only a session that is valid IN THE DATABASE sends
// the visitor on to the dashboard — a stale cookie just shows the form, so this
// page can never bounce back and forth with /admin (no redirect loop).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  if (await getAdminSession()) redirect(next);

  const notice = typeof params.pesan === "string" ? NOTICES[params.pesan] : undefined;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto block w-fit" aria-label="SUMENEP – Mata Madura, ke situs publik">
          <Logo eager alt="" className="h-auto w-44" />
        </Link>

        <section className="admin-card mt-8" aria-labelledby="login-title">
          <h1 id="login-title" className="font-display text-[1.75rem] leading-tight font-semibold">
            Masuk ke CMS
          </h1>
          <p className="mt-1.5 text-sm text-muted">Khusus Admin redaksi SUMENEP – Mata Madura.</p>

          {notice && (
            <div className="mt-5">
              <Notice tone="info">{notice}</Notice>
            </div>
          )}

          <LoginForm next={next} />
        </section>

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/" className="underline-offset-4 hover:text-ink hover:underline">
            ← Kembali ke situs
          </Link>
        </p>
      </div>
    </main>
  );
}
