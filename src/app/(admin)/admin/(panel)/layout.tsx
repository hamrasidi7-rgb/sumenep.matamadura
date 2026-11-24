import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { requireAdmin } from "@/server/auth/next";

export const dynamic = "force-dynamic";

// Every page in this group belongs to the logged-in Admin. The layout checks
// the session, and each page checks it again: layouts are not re-rendered on
// client-side navigation, so they must never be the only gate.
//
// Shell adapted from Busacare app/admin/(dashboard)/layout.tsx (8a97c57):
// sticky sidebar on desktop, topbar + slide-over drawer on mobile, and a
// non-overflowing main wrapper so sticky toolbars in the editor keep working.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <div className="min-h-dvh bg-warm lg:flex">
      <AdminSidebar admin={{ name: session.admin.name, email: session.admin.email }} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
