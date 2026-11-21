import { LogOut } from "lucide-react";
import Link from "next/link";

import { logoutAction } from "@/app/(admin)/admin/actions";
import { Logo } from "@/components/brand/Logo";

import { SubmitButton } from "./SubmitButton";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/artikel", label: "Artikel" },
  { href: "/admin/akun", label: "Akun & Keamanan" },
] as const;

export function AdminHeader({ adminName, current }: { adminName: string; current: (typeof NAV)[number]["href"] }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <Link href="/admin" className="flex items-center gap-3" aria-label="Dashboard CMS">
          <Logo variant="sumenep-matamadura-horizontal" eager alt="" className="h-auto w-40 md:w-48" />
          <span className="rounded bg-ink px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider text-white uppercase">CMS</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{adminName}</span>
          <form action={logoutAction}>
            <SubmitButton pendingLabel="Keluar…" className="admin-button-quiet min-h-10 px-3">
              <LogOut aria-hidden className="size-4" strokeWidth={2} />
              Keluar
            </SubmitButton>
          </form>
        </div>

        <nav aria-label="Menu CMS" className="w-full">
          <ul className="-mb-3 flex gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.href === current ? "page" : undefined}
                  className="inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm font-semibold whitespace-nowrap text-muted hover:text-ink aria-[current=page]:border-brand aria-[current=page]:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
