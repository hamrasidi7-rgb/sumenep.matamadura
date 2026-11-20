import { z } from "zod";

// Admin account input. The same schemas validate the CLI scripts now and the
// CMS Server Actions (login, change password) in Fase 3.

/**
 * NIST SP 800-63B-4: at least 15 characters for a password that is the only
 * factor. A long passphrase ("tiga kata acak plus angka") is easier than symbols.
 * The upper bound keeps hashing cheap for absurd inputs.
 */
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 256;

export const adminEmailSchema = z
  .string({ error: "Email wajib diisi." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Format email tidak valid." }).max(254, { error: "Email terlalu panjang." }));

export const adminNameSchema = z
  .string({ error: "Nama wajib diisi." })
  .trim()
  .min(1, { error: "Nama wajib diisi." })
  .max(120, { error: "Nama maksimal 120 karakter." });

export const adminPasswordSchema = z
  .string({ error: "Password wajib diisi." })
  .min(PASSWORD_MIN_LENGTH, { error: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Password maksimal ${PASSWORD_MAX_LENGTH} karakter.` })
  .refine((value) => value.trim().length === value.length, {
    error: "Password tidak boleh diawali atau diakhiri spasi.",
  })
  .refine((value) => new Set(value).size >= 5, { error: "Password terlalu seragam." });

export const adminBootstrapSchema = z.object({
  email: adminEmailSchema,
  name: adminNameSchema,
  password: adminPasswordSchema,
});

export type AdminBootstrapInput = z.input<typeof adminBootstrapSchema>;

/** First issue of a failed parse, for one-line CLI / form messages. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : "Input tidak valid.";
}
