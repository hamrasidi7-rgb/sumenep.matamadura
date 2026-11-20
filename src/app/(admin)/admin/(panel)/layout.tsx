import { requireAdmin } from "@/server/auth/next";

// Every page in this group belongs to the logged-in Admin. The layout checks
// the session, and each page checks it again: layouts are not re-rendered on
// client-side navigation, so they must never be the only gate.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
