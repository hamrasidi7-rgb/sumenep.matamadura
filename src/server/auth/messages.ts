import { AUTH } from "./config";

// One message for every failed login — wrong email, wrong password, locked
// account or rate limit — so the answer never tells an attacker which it was.
export const LOGIN_FAILED_MESSAGE =
  `Login gagal. Periksa email dan password Anda. Setelah ${AUTH.lockoutThreshold} kali gagal, ` +
  `login dikunci sementara (${AUTH.lockoutMinutes} menit).`;

export const NOTICES: Record<string, string> = {
  keluar: "Anda telah keluar.",
  semua: "Anda telah keluar dari semua perangkat.",
  berakhir: "Sesi Anda berakhir. Silakan masuk kembali.",
};
