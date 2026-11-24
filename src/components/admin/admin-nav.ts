// Konfigurasi navigasi sidebar CMS SUMENEP – Mata Madura.
// Diadaptasi dari pola grup menu & active-state Busacare
// (components/admin/admin-sidebar.tsx), disesuaikan untuk arsitektur
// Single-Admin SUMENEP tanpa modul kesehatan dan tanpa halaman multi-pengguna.
//
// Modul murni (tanpa React/DOM) agar aturan active-state dapat diuji langsung
// di unit test dan mudah diperluas pada fase selective cloning berikutnya.

export type AdminNavIcon =
  | "dashboard"
  | "newspaper"
  | "pen"
  | "trending"
  | "media"
  | "sections"
  | "authors"
  | "activity"
  | "settings"
  | "shield";

export interface AdminNavLink {
  href: string;
  label: string;
  icon: AdminNavIcon;
  /** Cocok hanya bila pathname identik (mis. /admin atau /admin/artikel/baru). */
  exact?: boolean;
  /** Prefix yang dikecualikan agar rute anak tertentu tidak menyorot menu induknya. */
  excludePrefixes?: readonly string[];
}

export interface AdminNavGroup {
  label: string;
  icon: AdminNavIcon;
  children: readonly AdminNavLink[];
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

// Fase 1 hanya memuat rute yang sudah aktif & berfungsi agar tidak ada tautan 404.
// Fase 5–9 (Media Library, Kanal & Rubrik, Penulis, Statistik & Trending,
// Aktivitas Redaksi, Pengaturan) tinggal menambahkan entri di sini saat rutenya siap.
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
  {
    label: "Berita",
    icon: "newspaper",
    children: [
      { href: "/admin/artikel/baru", label: "Tulis Artikel", icon: "pen", exact: true },
      {
        href: "/admin/artikel",
        label: "Semua Artikel",
        icon: "newspaper",
        excludePrefixes: ["/admin/artikel/baru"],
      },
    ],
  },
  { href: "/admin/media", label: "Media Library", icon: "media" },
  { href: "/admin/seksi", label: "Kanal & Rubrik", icon: "sections" },
  { href: "/admin/penulis", label: "Penulis", icon: "authors" },
  { href: "/admin/aktivitas", label: "Aktivitas", icon: "activity" },
  { href: "/admin/akun", label: "Akun & Keamanan", icon: "shield" },
];

export function isNavGroup(entry: AdminNavEntry): entry is AdminNavGroup {
  return "children" in entry;
}

function normalizePath(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] || "/";
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  const target = normalizePath(prefix);
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function isNavLinkActive(pathname: string, link: Pick<AdminNavLink, "href" | "exact" | "excludePrefixes">): boolean {
  const current = normalizePath(pathname);
  const target = normalizePath(link.href);

  if (link.exact) return current === target;
  if (!matchesPrefix(current, target)) return false;
  if (link.excludePrefixes?.some((excluded) => matchesPrefix(current, excluded))) return false;
  return true;
}
