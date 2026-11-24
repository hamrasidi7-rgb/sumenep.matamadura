import { SITE } from "@/lib/site";

// Format pesan siap tempel ke Saluran WhatsApp SUMENEP – Mata Madura.
// Diadaptasi dari Busacare lib/teks-saluran-whatsapp.ts:
// - *Judul* dengan pembersihan karakter * agar format tebal tidak patah.
// - Ringkasan (lead/standfirst) dipotong rapi di batas kata (~220 karakter).
// - URL publik ber-UTM (/artikel/<slug>?utm_source=whatsapp&utm_medium=saluran).

const SUMMARY_LIMIT = 220;

export function whatsappChannelUrl(slug: string, siteUrl: string = SITE.url): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/artikel/${encodeURIComponent(slug)}?utm_source=whatsapp&utm_medium=saluran`;
}

export function shortSummary(text: string, limit: number = SUMMARY_LIMIT): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= limit) return clean;
  const slice = clean.slice(0, limit);
  const space = slice.lastIndexOf(" ");
  const cut = (space > limit * 0.6 ? slice.slice(0, space) : slice).replace(/[\s,.;:–-]+$/, "");
  return `${cut}…`;
}

export function formatWhatsappChannelText(
  article: { title: string; standfirst?: string | null; slug: string },
  siteUrl: string = SITE.url,
): string {
  const safeTitle = article.title.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  const lead = shortSummary(article.standfirst ?? "");
  return [
    safeTitle ? `*${safeTitle}*` : "",
    lead,
    `Baca selengkapnya: ${whatsappChannelUrl(article.slug, siteUrl)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
