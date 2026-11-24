// Display helpers for the CMS. Times are shown in WIB (Asia/Jakarta); the
// database stores UTC.

const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const byteDecimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/**
 * Ukuran berkas yang mudah dibaca ("0 B", "420 KB", "2,4 MB").
 * Diadaptasi dari ukuranTerbaca() Busacare (components/admin/media-library.tsx)
 * dengan format desimal Indonesia dan pengaman nilai kosong/negatif.
 */
export function formatBytes(bytes: number | null | undefined): string {
  const safe = typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
  if (safe < 1024) return `${safe} B`;
  if (safe < 1024 * 1024) return `${Math.round(safe / 1024)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${byteDecimal.format(safe / (1024 * 1024))} MB`;
  return `${byteDecimal.format(safe / (1024 * 1024 * 1024))} GB`;
}

/** "21 Nov 2026, 10.15 WIB" */
export function formatWib(date: Date | null | undefined): string {
  return date ? `${dateTime.format(date)} WIB` : "–";
}

/** Rough "browser · system" from a user agent, for the sessions list. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Perangkat tidak dikenal";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Peramban lain";
  const system = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "sistem lain";
  return `${browser} · ${system}`;
}

const ACTIONS: Record<string, string> = {
  "auth.login": "Login",
  "auth.logout": "Logout",
  "auth.logout_all": "Keluar dari semua perangkat",
  "auth.session_revoked": "Sesi dicabut",
  "auth.password_changed": "Password diganti",
  "auth.lockout": "Login dikunci sementara",
  "admin.bootstrap": "Akun Admin dibuat (CLI)",
  "admin.recover.password_reset": "Password direset (CLI)",
  "admin.recover.sessions_revoked": "Semua sesi dicabut (CLI)",
  "admin.recover.unlock": "Penguncian dibuka (CLI)",
  "admin.recover.email_changed": "Email login diubah (CLI)",
  "system.seed": "Data awal diisi",
  "article.create": "Artikel dibuat",
  "article.save": "Draf disimpan",
  "article.update": "Artikel terbit diperbarui",
  "article.publish": "Artikel diterbitkan",
  "article.schedule": "Artikel dijadwalkan",
  "article.unpublish": "Artikel ditarik dari publikasi",
  "article.archive": "Artikel diarsipkan",
  "article.unarchive": "Artikel dikembalikan dari arsip",
  "article.trash": "Artikel ke tempat sampah",
  "article.restore": "Artikel dipulihkan",
  "article.delete": "Artikel dihapus permanen",
  "media.upload": "Gambar diunggah",
  "media.update": "Keterangan gambar diubah",
  "media.delete": "Gambar dihapus",
  "media.folder_create": "Folder media dibuat",
  "media.folder_rename": "Folder media diubah",
  "media.folder_delete": "Folder media dihapus",
  "author.create": "Profil penulis dibuat",
  "author.update": "Profil penulis diperbarui",
  "author.toggle": "Status penulis diubah",
  "author.delete": "Profil penulis dihapus",
  "section.create": "Kanal/rubrik dibuat",
  "section.update": "Kanal/rubrik diperbarui",
  "section.toggle": "Status kanal/rubrik diubah",
  "section.delete": "Kanal/rubrik dihapus",
  "site.settings_update": "Pengaturan situs diperbarui",
  "homepage.update": "Susunan beranda diperbarui",
};

const LOGIN_REASONS: Record<string, string> = {
  ok: "Berhasil",
  bad_credentials: "Kredensial salah",
  locked: "Akun dikunci sementara",
  rate_limited: "Batas percobaan (rate limit)",
  invalid_input: "Masukan tidak valid",
};

const ARTICLE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  SCHEDULED: "Terjadwal",
  PUBLISHED: "Terbit",
  ARCHIVED: "Arsip",
};

export function activityLabel(action: string): string {
  return ACTIONS[action] ?? action;
}

export function loginReasonLabel(reason: string): string {
  return LOGIN_REASONS[reason] ?? reason;
}

export function articleStatusLabel(status: string | null | undefined): string {
  if (!status) return "Baru";
  return ARTICLE_STATUS_LABELS[status] ?? status;
}
