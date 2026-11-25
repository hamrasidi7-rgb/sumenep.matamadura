"use client";

// Sidebar navigasi CMS SUMENEP – Mata Madura.
// Diadaptasi dari Busacare components/admin/admin-sidebar.tsx (commit 8a97c57):
// sidebar sticky desktop (w-64), topbar + drawer off-canvas mobile, grup menu
// bersarang untuk Berita, serta footer profil + tombol keluar.
//
// Penyesuaian SUMENEP:
// - Token Tailwind v4 dari src/app/(admin)/admin.css (paper, warm, blush, brand-deep).
// - Single-Admin SUMENEP (tanpa peran OPERATOR/ADMIN Busacare, tanpa /admin/pengguna).
// - Tombol keluar memakai Server Action logoutAction SUMENEP + SubmitButton,
//   juga tersedia di topbar mobile agar tetap langsung terjangkau pada layar 390 px.

import {
  Contact,
  FolderOpen,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  PenSquare,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { logoutAction } from "@/app/(admin)/admin/actions";
import { Logo } from "@/components/brand/Logo";

import { ADMIN_NAV, isNavGroup, isNavLinkActive, type AdminNavIcon } from "./admin-nav";
import { SubmitButton } from "./SubmitButton";

const ICONS: Record<AdminNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  newspaper: Newspaper,
  pen: PenSquare,
  hero: Star,
  trending: TrendingUp,
  media: FolderOpen,
  sections: Layers,
  authors: Contact,
  activity: History,
  settings: Settings,
  shield: ShieldCheck,
};

export interface AdminSidebarProps {
  admin: {
    name: string;
    email: string;
  };
}

export function AdminSidebar({ admin }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Tutup drawer mobile otomatis ketika berpindah halaman.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Tutup drawer mobile dengan tombol Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {/* Topbar mobile: tidak sticky agar bar aksi & toolbar editor tetap menempel di top-0. */}
      <header className="flex h-14 items-center justify-between gap-2 border-b border-line bg-paper px-3 sm:px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
            aria-controls="admin-sidebar-panel"
            onClick={() => setOpen((current) => !current)}
            className="admin-icon-button shrink-0"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>

          <Link href="/admin" className="flex min-w-0 items-center gap-2" aria-label="Dashboard CMS">
            <Logo variant="sumenep-matamadura-horizontal" eager alt="" className="h-auto w-28 shrink-0 sm:w-36" />
            <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider text-white uppercase">
              CMS
            </span>
          </Link>
        </div>

        <form action={logoutAction} className="shrink-0">
          <SubmitButton pendingLabel="Keluar…" className="admin-button-quiet min-h-10 px-2.5 text-xs sm:px-3 sm:text-sm">
            <LogOut aria-hidden="true" className="size-4" strokeWidth={2} />
            Keluar
          </SubmitButton>
        </form>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="admin-sidebar-panel"
        aria-label="Navigasi CMS"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-paper transition-transform duration-200 lg:pointer-events-auto lg:visible lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? "pointer-events-auto visible translate-x-0" : "max-lg:pointer-events-none max-lg:invisible -translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-4">
          <Link href="/admin" className="flex min-w-0 items-center gap-2 lg:gap-2.5" aria-label="Dashboard CMS">
            <Logo variant="sumenep-matamadura-horizontal" eager alt="" className="h-auto w-28 shrink-0 lg:w-36" />
            <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider text-white uppercase">
              CMS
            </span>
          </Link>
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setOpen(false)}
            className="admin-icon-button shrink-0 lg:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Menu CMS">
          {ADMIN_NAV.map((entry) => {
            if (isNavGroup(entry)) {
              const GroupIcon = ICONS[entry.icon];
              return (
                <div key={entry.label} className="mt-1.5 first:mt-0">
                  <div className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold tracking-wider text-muted uppercase">
                    <GroupIcon className="size-4 shrink-0" aria-hidden="true" />
                    {entry.label}
                  </div>
                  <div className="ml-4 flex flex-col gap-1 border-l border-line pl-3">
                    {entry.children.map((child) => {
                      const ChildIcon = ICONS[child.icon];
                      const active = isNavLinkActive(pathname, child);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                            active ? "bg-blush font-semibold text-brand-deep" : "font-medium text-ink hover:bg-warm"
                          }`}
                        >
                          <ChildIcon className="size-4 shrink-0" aria-hidden="true" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const Icon = ICONS[entry.icon];
            const active = isNavLinkActive(pathname, entry);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  active ? "bg-blush font-semibold text-brand-deep" : "font-medium text-ink hover:bg-warm"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {entry.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-4">
          <p className="truncate text-sm font-semibold text-ink">{admin.name}</p>
          <p className="truncate text-xs text-muted">{admin.email}</p>
          <p className="mt-0.5 text-xs text-muted">Administrator</p>
          <form action={logoutAction} className="mt-3">
            <SubmitButton pendingLabel="Keluar…" className="admin-button-quiet min-h-10 w-full justify-center px-3">
              <LogOut aria-hidden="true" className="size-4" strokeWidth={2} />
              Keluar
            </SubmitButton>
          </form>
        </div>
      </aside>
    </>
  );
}
