// Shared contract between the Chator UI and the /api/chator proxy.

export interface ChatorSource {
  /** Judul dokumen/artikel sumber, bila engine menyediakannya. */
  title: string | null;
  url: string | null;
  /** Tanggal data/terbit sumber (ISO atau teks), bila tersedia. */
  date: string | null;
  snippet: string;
}

export type ChatorStatus = "ok" | "not_configured" | "busy" | "error" | "rate_limited" | "invalid";

export interface ChatorResponse {
  status: ChatorStatus;
  /** null whenever the engine did not produce an answer — the UI never invents one. */
  answer: string | null;
  sources: ChatorSource[];
  message?: string;
}

export const CHATOR_MAX_QUESTION = 1000;
