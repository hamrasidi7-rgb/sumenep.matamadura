// SEO checks for an article — pure TypeScript (no Prisma, DOM or React), so
// the editor panel runs it live in the browser and tests run it directly.
//
// Ported from Busacare lib/seo-engine (types, content, rules/title-lead,
// structure, links, images, metadata). Same philosophy: every check returns
// PASS / WARNING / MISSING / NOT_APPLICABLE with a reason and a suggestion,
// marked "verified" (code can be sure) or "heuristic" (needs human judgement).
// There is no score and no promise of ranking. Not ported: the focus-keyword
// rules — the SUMENEP article model has no focus keyword field.

import type { DocNode } from "@/lib/article-doc";

export type SeoStatus = "PASS" | "WARNING" | "MISSING" | "NOT_APPLICABLE";
export type SeoConfidence = "verified" | "heuristic";
export type SeoField = "title" | "standfirst" | "body" | "slug" | "seoTitle" | "seoDescription" | "canonicalUrl" | "hero";

export interface SeoFinding {
  id: string;
  category: "title-lead" | "structure" | "links" | "images" | "metadata";
  label: string;
  status: SeoStatus;
  message: string;
  suggestion?: string;
  field?: SeoField;
  confidence: SeoConfidence;
}

export interface ArticleSeoInput {
  title: string;
  standfirst: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  body: DocNode | null;
  hero: { alt: string; caption: string } | null;
  /** Images inside the body, with their effective alt text. */
  bodyImages?: { alt: string }[];
  internalHost?: string;
}

const HOST = "sumenep.matamaduranews.com";
const META_MIN = 120;
const META_MAX = 160;
const GENERIC_ANCHORS = new Set(["klik di sini", "klik disini", "di sini", "disini", "baca selengkapnya", "link ini", "tautan ini"]);

interface Analysis {
  wordCount: number;
  paragraphCount: number;
  headings: { level: number; text: string }[];
  links: { href: string; text: string; internal: boolean }[];
  imageAlts: string[];
}

function textOf(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "pullQuote") return typeof node.attrs?.text === "string" ? node.attrs.text : "";
  if (node.type === "largeStatement") {
    return [node.attrs?.headline, node.attrs?.description].filter((v): v is string => typeof v === "string").join(" ");
  }
  if (node.type === "factBox") {
    const items = Array.isArray(node.attrs?.items) ? node.attrs.items.filter((v): v is string => typeof v === "string") : [];
    return [node.attrs?.title, ...items].filter((v): v is string => typeof v === "string").join(" ");
  }
  if (node.type === "callout") {
    return [node.attrs?.title, node.attrs?.body].filter((v): v is string => typeof v === "string").join(" ");
  }
  return (node.content ?? []).map(textOf).join(node.type.startsWith("table") ? " " : "");
}

function isInternal(href: string, host: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    return new URL(href).hostname.replace(/^www\./, "") === host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export function analyzeBody(doc: DocNode | null, host = HOST): Analysis {
  const headings: { level: number; text: string }[] = [];
  const texts: string[] = [];
  let paragraphCount = 0;
  const imageAlts: string[] = [];
  for (const node of doc?.content ?? []) {
    const text = textOf(node).trim();
    if (node.type === "heading" && text) headings.push({ level: Number(node.attrs?.level) || 2, text });
    if (node.type === "paragraph" && text) paragraphCount++;
    if (text) texts.push(text);
    if (node.type === "articleImage") {
      imageAlts.push(typeof node.attrs?.alt === "string" ? node.attrs.alt : "");
      if (node.attrs?.layout === "pair" && typeof node.attrs?.pairMediaId === "string" && node.attrs.pairMediaId) {
        imageAlts.push(typeof node.attrs?.pairAlt === "string" ? node.attrs.pairAlt : "");
      }
    }
  }
  const links: Analysis["links"] = [];
  const collect = (node: DocNode) => {
    if (node.type === "text" && node.text) {
      const href = node.marks?.find((m) => m.type === "link")?.attrs?.href;
      if (typeof href === "string") {
        const last = links[links.length - 1];
        if (last && last.href === href) last.text += node.text;
        else links.push({ href, text: node.text, internal: isInternal(href, host) });
      }
    }
    node.content?.forEach(collect);
  };
  if (doc) collect(doc);
  const plain = texts.join(" ").replace(/\s+/g, " ").trim();
  return { wordCount: plain ? plain.split(" ").length : 0, paragraphCount, headings, links, imageAlts };
}

function overlap(a: string, b: string): number {
  const words = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const other = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.size || !other.length) return 0;
  return other.filter((w) => words.has(w)).length / other.length;
}

export function runSeoChecks(input: ArticleSeoInput): SeoFinding[] {
  const f: SeoFinding[] = [];
  const ctx = analyzeBody(input.body, input.internalHost);
  const title = input.title.trim();
  const lead = input.standfirst.trim();

  // ── Judul & lead ──
  f.push(
    title
      ? { id: "title.present", category: "title-lead", label: "Judul", status: "PASS", message: `Judul terisi (${title.length} karakter).`, confidence: "verified" }
      : { id: "title.present", category: "title-lead", label: "Judul", status: "MISSING", message: "Judul belum diisi.", suggestion: "Judul wajib diisi sebelum terbit.", field: "title", confidence: "verified" },
  );
  if (!lead) {
    f.push({ id: "lead.present", category: "title-lead", label: "Lead", status: "MISSING", message: "Lead (standfirst) belum diisi.", suggestion: "Satu-dua kalimat inti berita membantu pembaca dan mesin pencari.", field: "standfirst", confidence: "verified" });
  } else {
    f.push({ id: "lead.present", category: "title-lead", label: "Lead", status: "PASS", message: `Lead terisi (${lead.length} karakter).`, confidence: "verified" });
    if (title && overlap(title, lead) > 0.85) {
      f.push({ id: "lead.not-redundant", category: "title-lead", label: "Lead tidak mengulang judul", status: "WARNING", message: "Lead tampak hampir sama dengan judul.", suggestion: "Tambahkan konteks, angka, atau dampak — jangan mengulang judul.", field: "standfirst", confidence: "heuristic" });
    }
  }

  // ── Struktur ──
  if (!ctx.headings.length) {
    f.push({ id: "structure.headings", category: "structure", label: "Subjudul", status: "NOT_APPLICABLE", message: "Belum ada subjudul — wajar untuk berita pendek.", confidence: "verified" });
  } else {
    let sawH2 = false;
    const skipped = ctx.headings.some((h) => {
      if (h.level === 2) sawH2 = true;
      return h.level > 2 && !sawH2;
    });
    f.push(
      skipped
        ? { id: "structure.headings", category: "structure", label: "Urutan subjudul", status: "WARNING", message: "H3/H4 muncul sebelum ada H2.", suggestion: "Pakai H2 untuk bagian utama, H3/H4 untuk sub-bagian.", field: "body", confidence: "verified" }
        : { id: "structure.headings", category: "structure", label: "Urutan subjudul", status: "PASS", message: `${ctx.headings.length} subjudul dengan urutan wajar.`, confidence: "verified" },
    );
  }
  f.push({ id: "structure.length", category: "structure", label: "Panjang", status: "NOT_APPLICABLE", message: `${ctx.wordCount} kata, ${ctx.paragraphCount} paragraf — informasi, bukan syarat.`, confidence: "verified" });

  // ── Tautan ──
  const internal = ctx.links.filter((l) => l.internal);
  const external = ctx.links.filter((l) => !l.internal);
  f.push(
    ctx.wordCount === 0
      ? { id: "links.internal", category: "links", label: "Tautan internal", status: "NOT_APPLICABLE", message: "Isi belum ditulis.", confidence: "verified" }
      : internal.length
        ? { id: "links.internal", category: "links", label: "Tautan internal", status: "PASS", message: `${internal.length} tautan internal.`, confidence: "verified" }
        : { id: "links.internal", category: "links", label: "Tautan internal", status: "MISSING", message: "Belum ada tautan ke artikel SUMENEP lain.", suggestion: "Tautkan artikel terkait bila memang relevan (tombol tautan → Cari artikel).", field: "body", confidence: "verified" },
  );
  external.forEach((link, i) => {
    if (GENERIC_ANCHORS.has(link.text.trim().toLowerCase())) {
      f.push({ id: `links.anchor-${i}`, category: "links", label: "Teks tautan", status: "WARNING", message: `Teks tautan "${link.text}" kurang menjelaskan tujuannya.`, suggestion: "Pakai nama sumber atau topik, bukan \"klik di sini\".", field: "body", confidence: "heuristic" });
    }
  });

  // ── Gambar ──
  if (!input.hero) {
    f.push({ id: "images.hero", category: "images", label: "Gambar utama", status: "MISSING", message: "Gambar utama belum dipilih.", suggestion: "Wajib sebelum terbit.", field: "hero", confidence: "verified" });
  } else {
    const alt = input.hero.alt.trim();
    f.push(
      !alt || alt.toLowerCase() === title.toLowerCase()
        ? { id: "images.hero-alt", category: "images", label: "Alt text gambar utama", status: "WARNING", message: alt ? "Alt text sama dengan judul." : "Alt text gambar utama kosong.", suggestion: "Jelaskan isi gambar yang sebenarnya.", field: "hero", confidence: "heuristic" }
        : { id: "images.hero-alt", category: "images", label: "Alt text gambar utama", status: "PASS", message: "Alt text gambar utama tersedia.", confidence: "heuristic" },
    );
  }
  const alts = input.bodyImages?.map((i) => i.alt) ?? ctx.imageAlts;
  if (alts.length) {
    const missing = alts.filter((a) => !a.trim()).length;
    f.push(
      missing
        ? { id: "images.body-alt", category: "images", label: "Gambar di isi", status: "MISSING", message: `${missing} dari ${alts.length} gambar belum punya alt text.`, suggestion: "Isi alt text setiap gambar.", field: "body", confidence: "verified" }
        : { id: "images.body-alt", category: "images", label: "Gambar di isi", status: "PASS", message: `Semua ${alts.length} gambar punya alt text.`, confidence: "verified" },
    );
  }

  // ── Metadata ──
  const slug = input.slug.trim();
  f.push(
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
      ? { id: "metadata.slug", category: "metadata", label: "Slug", status: "WARNING", message: "Slug kosong atau memuat karakter yang tidak diizinkan.", suggestion: "Huruf kecil, angka, tanda hubung.", field: "slug", confidence: "verified" }
      : slug.length > 75
        ? { id: "metadata.slug", category: "metadata", label: "Slug", status: "WARNING", message: `Slug cukup panjang (${slug.length} karakter).`, suggestion: "Slug ringkas lebih mudah dibaca.", field: "slug", confidence: "heuristic" }
        : { id: "metadata.slug", category: "metadata", label: "Slug", status: "PASS", message: "Slug terbaca jelas.", confidence: "verified" },
  );
  const seoTitle = input.seoTitle.trim();
  f.push(
    seoTitle
      ? { id: "metadata.seo-title", category: "metadata", label: "SEO title", status: seoTitle.length > 70 ? "WARNING" : "PASS", message: `SEO title ${seoTitle.length} karakter${seoTitle.length > 70 ? " — bisa terpotong di hasil pencarian (±60–70)." : "."}`, field: "seoTitle", confidence: "heuristic" }
      : { id: "metadata.seo-title", category: "metadata", label: "SEO title", status: "NOT_APPLICABLE", message: "Kosong — judul artikel dipakai sebagai SEO title.", field: "seoTitle", confidence: "verified" },
  );
  const desc = input.seoDescription.trim();
  f.push(
    !desc
      ? { id: "metadata.description", category: "metadata", label: "Meta description", status: "MISSING", message: "Meta description belum diisi (lead dipakai sebagai cadangan).", suggestion: `Ringkasan akurat ${META_MIN}–${META_MAX} karakter.`, field: "seoDescription", confidence: "verified" }
      : { id: "metadata.description", category: "metadata", label: "Meta description", status: desc.length >= META_MIN && desc.length <= META_MAX ? "PASS" : "WARNING", message: `Meta description ${desc.length} karakter${desc.length >= META_MIN && desc.length <= META_MAX ? "." : ` (referensi ${META_MIN}–${META_MAX}).`}`, field: "seoDescription", confidence: "heuristic" },
  );
  if (input.canonicalUrl.trim() && !/^https:\/\//.test(input.canonicalUrl.trim())) {
    f.push({ id: "metadata.canonical", category: "metadata", label: "Canonical URL", status: "WARNING", message: "Canonical URL harus diawali https://.", field: "canonicalUrl", confidence: "verified" });
  }
  return f;
}

export function summarize(findings: SeoFinding[]) {
  return {
    pass: findings.filter((x) => x.status === "PASS").length,
    warning: findings.filter((x) => x.status === "WARNING").length,
    missing: findings.filter((x) => x.status === "MISSING").length,
  };
}
