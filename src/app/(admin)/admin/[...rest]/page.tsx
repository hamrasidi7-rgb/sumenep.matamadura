import { notFound } from "next/navigation";

import { requireAdmin } from "@/server/auth/next";

// Unknown CMS addresses: log in first, then a 404 inside the CMS layout. There
// is deliberately no registration or "create account" page.
export default async function UnknownAdminPage() {
  await requireAdmin();
  notFound();
}
