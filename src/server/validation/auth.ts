import { z } from "zod";

import { adminEmailSchema, adminPasswordSchema, PASSWORD_MAX_LENGTH } from "./admin";

// Login and account-security input. Validated on the server for every request,
// whatever the browser form already checked.

export const loginSchema = z.object({
  email: adminEmailSchema,
  // No strength rules at login: just a bounded, non-empty string.
  password: z
    .string({ error: "Password wajib diisi." })
    .min(1, { error: "Password wajib diisi." })
    .max(PASSWORD_MAX_LENGTH, { error: "Password terlalu panjang." }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Password saat ini wajib diisi." })
      .min(1, { error: "Password saat ini wajib diisi." })
      .max(PASSWORD_MAX_LENGTH, { error: "Password terlalu panjang." }),
    newPassword: adminPasswordSchema,
    confirmPassword: z.string({ error: "Ulangi password baru." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    error: "Konfirmasi password baru tidak sama.",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    error: "Password baru harus berbeda dari password saat ini.",
  });

export const sessionIdSchema = z.uuid({ error: "Sesi tidak valid." });

/** FormData → plain object of strings (files and repeated keys are dropped). */
export function formFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !(key in fields)) fields[key] = value;
  }
  return fields;
}
