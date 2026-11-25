// Featured Image (Gambar Utama) specification & deterministic 16:10 crop geometry.
// Adapted from Busacare's PROFIL.artikel (1200 × 750 px, 16:10) with interactive
// focal-point support for SUMENEP's Media Library and Article Editor.

export const FEATURED_IMAGE_WIDTH = 1200;
export const FEATURED_IMAGE_HEIGHT = 750;
export const FEATURED_IMAGE_RATIO = FEATURED_IMAGE_WIDTH / FEATURED_IMAGE_HEIGHT; // 1.6 (16:10)
export const FEATURED_IMAGE_MIN_WIDTH = 800;
export const FEATURED_IMAGE_LABEL = "1200 × 750 px (16:10)";

const RATIO_TOLERANCE = 0.03;

export type MediaUploadPreset = "default" | "featured";

export interface CoverCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FeaturedImageAssessment {
  matchesRatio: boolean;
  meetsRecommendedSize: boolean;
  meetsMinimumWidth: boolean;
  ratioDelta: number;
  status: "optimal" | "ratio-mismatch" | "low-resolution";
  summary: string;
}

/** Clamps a focal percentage into [0, 100], rounding to whole percent. */
export function clampFocal(value: unknown, fallback = 50): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Computes the maximal extract rectangle inside `srcWidth × srcHeight` with
 * aspect ratio `targetWidth / targetHeight`, anchored around `(focalX%, focalY%)`.
 * Always returns integer coordinates strictly within source bounds.
 */
export function computeCoverCrop(
  srcWidth: number,
  srcHeight: number,
  targetWidth = FEATURED_IMAGE_WIDTH,
  targetHeight = FEATURED_IMAGE_HEIGHT,
  focalX = 50,
  focalY = 50,
): CoverCropRect {
  const safeSrcW = Math.max(1, Math.floor(srcWidth));
  const safeSrcH = Math.max(1, Math.floor(srcHeight));
  const targetRatio = targetWidth / targetHeight;
  const srcRatio = safeSrcW / safeSrcH;
  const fx = clampFocal(focalX) / 100;
  const fy = clampFocal(focalY) / 100;

  let cropW = safeSrcW;
  let cropH = safeSrcH;

  if (srcRatio > targetRatio) {
    // Source is wider than 16:10 (e.g. 16:9 or panoramic): trim left/right around focalX.
    cropH = safeSrcH;
    cropW = Math.max(1, Math.min(safeSrcW, Math.round(safeSrcH * targetRatio)));
  } else if (srcRatio < targetRatio) {
    // Source is taller than 16:10 (e.g. 4:3, 1:1, portrait): trim top/bottom around focalY.
    cropW = safeSrcW;
    cropH = Math.max(1, Math.min(safeSrcH, Math.round(safeSrcW / targetRatio)));
  }

  const maxLeft = safeSrcW - cropW;
  const maxTop = safeSrcH - cropH;
  const idealLeft = Math.round(fx * safeSrcW - cropW / 2);
  const idealTop = Math.round(fy * safeSrcH - cropH / 2);

  return {
    left: Math.max(0, Math.min(maxLeft, idealLeft)),
    top: Math.max(0, Math.min(maxTop, idealTop)),
    width: cropW,
    height: cropH,
  };
}

/** Evaluates whether a media item matches SUMENEP's 1200 × 750 (16:10) recommendation. */
export function assessFeaturedImage(width: number, height: number): FeaturedImageAssessment {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const ratio = safeW / safeH;
  const ratioDelta = Math.abs(ratio - FEATURED_IMAGE_RATIO) / FEATURED_IMAGE_RATIO;
  const matchesRatio = ratioDelta <= RATIO_TOLERANCE;
  const meetsRecommendedSize = safeW >= FEATURED_IMAGE_WIDTH && safeH >= FEATURED_IMAGE_HEIGHT;
  const meetsMinimumWidth = safeW >= FEATURED_IMAGE_MIN_WIDTH;

  if (!meetsMinimumWidth) {
    return {
      matchesRatio,
      meetsRecommendedSize,
      meetsMinimumWidth,
      ratioDelta,
      status: "low-resolution",
      summary: `Ukuran ${safeW} × ${safeH} px terlalu kecil (rekomendasi ${FEATURED_IMAGE_LABEL}).`,
    };
  }
  if (!matchesRatio) {
    return {
      matchesRatio,
      meetsRecommendedSize,
      meetsMinimumWidth,
      ratioDelta,
      status: "ratio-mismatch",
      summary: `Rasio ${safeW} × ${safeH} px belum 16:10 — gunakan crop 1200 × 750 agar titik fokus tetap presisi.`,
    };
  }
  return {
    matchesRatio,
    meetsRecommendedSize,
    meetsMinimumWidth,
    ratioDelta,
    status: "optimal",
    summary: meetsRecommendedSize
      ? `Ideal untuk gambar utama (${safeW} × ${safeH} px · 16:10).`
      : `Rasio 16:10 sesuai (${safeW} × ${safeH} px; rekomendasi optimal ${FEATURED_IMAGE_LABEL}).`,
  };
}
