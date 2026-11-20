import { z } from "zod";

/** lowercase-kebab, same rule as the CHECK constraints in the database. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slugSchema = (max = 120) =>
  z
    .string()
    .trim()
    .min(1, { error: "Slug wajib diisi." })
    .max(max, { error: `Slug maksimal ${max} karakter.` })
    .regex(SLUG_PATTERN, { error: "Slug hanya huruf kecil, angka, dan tanda hubung (contoh: catatan-sumenep)." });

export const sectionKindSchema = z.enum(["KANAL", "RUBRIK"]);

export const sectionInputSchema = z.object({
  kind: sectionKindSchema,
  slug: slugSchema(80),
  name: z.string().trim().min(1, { error: "Nama wajib diisi." }).max(80),
  description: z.string().trim().max(300).default(""),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export type SectionInput = z.input<typeof sectionInputSchema>;
