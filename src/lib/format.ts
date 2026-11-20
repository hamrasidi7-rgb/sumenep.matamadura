const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const longFmt = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** "20 Nov 2026" */
export const formatDate = (iso: string) => dateFmt.format(new Date(iso)).replace(/\./g, "");

/** "Jumat, 20 November 2026 07.00 WIB" */
export const formatDateLong = (iso: string) => `${longFmt.format(new Date(iso))} WIB`;

export const readingLabel = (minutes: number) => `${minutes} menit baca`;
