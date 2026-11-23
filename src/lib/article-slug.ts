import { SLUG_PATTERN } from "@/server/validation/common";

// Slug rules shared by the editor (live preview of the URL) and the server.
// slugify/slugCandidate adapted from Busacare lib/slug-artikel.ts.

export const MAX_SLUG = 120;

export function slugify(text: string): string {
  const plain = Array.from(text.normalize("NFKD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f; // drop combining marks left by NFKD
    })
    .join("");
  return plain
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
}

/** n-th candidate for a base slug: "judul", "judul-2", "judul-3", … (never longer than MAX_SLUG). */
export function slugCandidate(base: string, n: number): string {
  const root = base || "artikel";
  if (n <= 1) return root;
  const suffix = `-${n}`;
  return `${root.slice(0, MAX_SLUG - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG && SLUG_PATTERN.test(slug);
}
