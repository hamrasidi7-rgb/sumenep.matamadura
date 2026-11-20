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
};

export function activityLabel(action: string): string {
  return ACTIONS[action] ?? action;
}
