// Shared editorial palette, typography sizes, and layout constants for SUMENEP.
// Used identically by the TipTap block editor, server-side document sanitizer,
// block converter, and public article renderer so arbitrary styles are never accepted.

export const EDITORIAL_INK = "#252525";

export const EDITORIAL_TEXT_COLORS = [
  { id: "brand", label: "Merah editorial", hex: "#A61B2B" },
  { id: "black", label: "Hitam", hex: "#171717" },
  { id: "muted", label: "Abu-abu", hex: "#62666D" },
] as const;

export type EditorialTextColorId = (typeof EDITORIAL_TEXT_COLORS)[number]["id"];
export type EditorialTextColorHex = (typeof EDITORIAL_TEXT_COLORS)[number]["hex"];

export const EDITORIAL_HIGHLIGHTS = [
  { id: "blush", label: "Merah lembut", hex: "#F8EFEC" },
  { id: "cream", label: "Krem editorial", hex: "#F5EFE6" },
  { id: "mist", label: "Abu-abu lembut", hex: "#F1F3F5" },
  { id: "sand", label: "Kuning kertas", hex: "#FAF3D6" },
] as const;

export type EditorialHighlightId = (typeof EDITORIAL_HIGHLIGHTS)[number]["id"];
export type EditorialHighlightHex = (typeof EDITORIAL_HIGHLIGHTS)[number]["hex"];

export const EDITORIAL_FONT_SIZES = [
  { id: "sm", label: "Kecil", scale: "0.89em" },
  { id: "md", label: "Normal", scale: "1em" },
  { id: "lg", label: "Besar", scale: "1.14em" },
  { id: "xl", label: "Ekstra besar", scale: "1.28em" },
] as const;

export type EditorialFontSize = "sm" | "lg" | "xl";

export type ImageSize = "column" | "wide" | "full";
export type ImageAlign = "center" | "left" | "right";
export type ImageLayout = "single" | "pair";
export type ImageRatio = "auto" | "16/9" | "4/3" | "3/2" | "1/1";

export const IMAGE_RATIOS: readonly { value: ImageRatio; label: string }[] = [
  { value: "auto", label: "Asli" },
  { value: "16/9", label: "16:9" },
  { value: "3/2", label: "3:2" },
  { value: "4/3", label: "4:3" },
  { value: "1/1", label: "1:1" },
];

export type PullQuoteVariant = "editorial" | "italic" | "framed";
export type LargeStatementTone = "brand" | "ink" | "cream";
export type BoxTone = "cream" | "blush" | "mist" | "dark";
export type FactBoxTone = "cream" | "blush" | "mist";
export type DividerVariant = "editorial" | "subtle" | "dots";

const TEXT_COLOR_BY_KEY = new Map<string, EditorialTextColorHex>(
  EDITORIAL_TEXT_COLORS.flatMap((c) => [
    [c.id.toLowerCase(), c.hex],
    [c.hex.toLowerCase(), c.hex],
  ]),
);

const HIGHLIGHT_BY_KEY = new Map<string, EditorialHighlightHex>(
  EDITORIAL_HIGHLIGHTS.flatMap((c) => [
    [c.id.toLowerCase(), c.hex],
    [c.hex.toLowerCase(), c.hex],
  ]),
);

export function normalizeTextColor(raw: unknown): EditorialTextColorHex | null {
  if (typeof raw !== "string") return null;
  return TEXT_COLOR_BY_KEY.get(raw.trim().toLowerCase()) ?? null;
}

export function normalizeHighlightColor(raw: unknown): EditorialHighlightHex | null {
  if (typeof raw !== "string") return null;
  return HIGHLIGHT_BY_KEY.get(raw.trim().toLowerCase()) ?? null;
}

export function normalizeFontSize(raw: unknown): EditorialFontSize | null {
  if (raw === "sm" || raw === "lg" || raw === "xl") return raw;
  return null;
}

export function normalizeImageSize(raw: unknown): ImageSize {
  if (raw === "wide" || raw === "full") return raw;
  return "column";
}

export function normalizeImageAlign(raw: unknown): ImageAlign {
  if (raw === "left" || raw === "right") return raw;
  return "center";
}

export function normalizeImageRatio(raw: unknown): ImageRatio {
  if (raw === "16/9" || raw === "4/3" || raw === "3/2" || raw === "1/1") return raw;
  return "auto";
}

export function normalizePullQuoteVariant(raw: unknown): PullQuoteVariant {
  if (raw === "italic" || raw === "framed") return raw;
  return "editorial";
}

export function normalizeLargeStatementTone(raw: unknown): LargeStatementTone {
  if (raw === "ink" || raw === "cream") return raw;
  return "brand";
}

export function normalizeCalloutTone(raw: unknown): BoxTone {
  if (raw === "blush" || raw === "mist" || raw === "dark") return raw;
  return "cream";
}

export function normalizeFactBoxTone(raw: unknown): FactBoxTone {
  if (raw === "blush" || raw === "mist") return raw;
  return "cream";
}

export function normalizeDividerVariant(raw: unknown): DividerVariant {
  if (raw === "subtle" || raw === "dots") return raw;
  return "editorial";
}
