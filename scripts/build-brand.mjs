// Generates every SUMENEP – Mata Madura identity asset from ONE source:
// brand/source/brand-source.json (outlined "SUMENEP" + traced "matamadura").
//
//   node scripts/build-brand.mjs
//
// Output:
//   public/brand/sumenep-matamadura-stacked.svg|png      logo utama bertingkat
//   public/brand/sumenep-matamadura-horizontal.svg|png   logo horizontal
//   public/brand/sumenep-matamadura-mono.svg|png         monokrom gelap
//   public/brand/sumenep-matamadura-mono-white.svg|png   monokrom terang
//   src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png
//   public/og-default.png                               Open Graph bawaan
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const src = JSON.parse(fs.readFileSync(path.join(root, "brand/source/brand-source.json"), "utf8"));

const NAVY = "#111827";
const RED = "#A61B2B";
const WARM = "#FAF9F7";
const r1 = (n) => Math.round(n * 100) / 100;

const S = src.sumenep;
const W = src.wordmark;

// ── Geometry (units: SUMENEP ink width = 1000) ───────────────────────────────
const sScale = 1000 / S.bbox.w;
const sH = S.bbox.h * sScale;
const sBaseline = -S.bbox.y * sScale; // glyph origin y=0 is the baseline

function sumenepGroup(x, y, fill, scale = sScale) {
  // places SUMENEP so its ink bbox top-left sits at (x, y)
  const tx = x - S.bbox.x * scale;
  const ty = y - S.bbox.y * scale;
  return `<g transform="translate(${r1(tx)} ${r1(ty)}) scale(${r1(scale * 1e4) / 1e4})" fill="${fill}"><path d="${S.d}"/></g>`;
}

function wordmarkGroup(x, y, width, mataFill, maduraFill) {
  const k = width / W.bbox.w;
  const tx = x - W.bbox.x * k;
  const ty = y - W.bbox.y * k;
  return {
    height: W.bbox.h * k,
    svg: `<g transform="translate(${r1(tx)} ${r1(ty)}) scale(${r1(k * 1e5) / 1e5})" fill-rule="evenodd"><path fill="${mataFill}" d="${W.mata}"/><path fill="${maduraFill}" d="${W.madura}"/></g>`,
  };
}

// Tapered red stroke, echoing the red track of the Mata Madura emblem.
function swoosh(x, y, w, fill) {
  const p = (fx, dy) => `${r1(x + w * fx)} ${r1(y + dy)}`;
  return `<path fill="${fill}" d="M${p(0, 12)} C${p(0.25, 2)} ${p(0.6, -1)} ${p(1, 0)} C${p(0.6, 22)} ${p(0.25, 33)} ${p(0, 12)} Z"/>`;
}

function stacked({ sFill = NAVY, mata = NAVY, madura = RED, accent = RED } = {}) {
  const pad = 8;
  const wmWidth = 700;
  const wmX = (1000 - wmWidth) / 2;
  const wmY = sBaseline + 26;
  const wm = wordmarkGroup(wmX, wmY, wmWidth, mata, madura);
  const swY = wmY + wm.height + 18;
  const swW = 720;
  const totalH = swY + 34;
  const vb = `${-pad} ${-pad} ${1000 + pad * 2} ${r1(totalH + pad * 2)}`;
  const body = [sumenepGroup(0, 0, sFill), wm.svg, swoosh((1000 - swW) / 2, swY, swW, accent)].join("");
  return { vb, body, w: 1000 + pad * 2, h: totalH + pad * 2 };
}

function horizontal({ sFill = NAVY, mata = NAVY, madura = RED, accent = RED } = {}) {
  const pad = 8;
  const capH = S.bbox.h * sScale;
  // wordmark x-height ≈ 0.72 × SUMENEP cap height; baselines aligned
  const xHeightRatio = 0.744; // x-height / total wordmark ink height
  const wmH = (capH * 0.72) / xHeightRatio;
  const wmW = wmH * (W.bbox.w / W.bbox.h);
  const gap = 56;
  const ruleX = 1000 + gap;
  const wmX = ruleX + 6 + gap;
  const wmY = sBaseline - wmH;
  const wm = wordmarkGroup(wmX, wmY, wmW, mata, madura);
  const rule = `<rect x="${r1(ruleX)}" y="${r1(-6)}" width="6" height="${r1(sH + 12)}" fill="${accent}"/>`;
  const totalW = wmX + wmW;
  const top = Math.min(0, wmY) - 6;
  const vb = `${-pad} ${r1(top - pad)} ${r1(totalW + pad * 2)} ${r1(sH + 12 - top + pad * 2)}`;
  return { vb, body: sumenepGroup(0, 0, sFill) + rule + wm.svg, w: totalW + pad * 2, h: sH + 12 - top + pad * 2 };
}

const svgDoc = ({ vb, body }, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

const TITLE = "SUMENEP – Mata Madura";
const outBrand = path.join(root, "public/brand");
fs.mkdirSync(outBrand, { recursive: true });

const variants = {
  "sumenep-matamadura-stacked": stacked(),
  "sumenep-matamadura-horizontal": horizontal(),
  "sumenep-matamadura-mono": stacked({ sFill: NAVY, mata: NAVY, madura: NAVY, accent: NAVY }),
  "sumenep-matamadura-mono-white": stacked({ sFill: "#fff", mata: "#fff", madura: "#fff", accent: "#fff" }),
};

for (const [name, v] of Object.entries(variants)) {
  const svg = svgDoc(v, TITLE);
  fs.writeFileSync(path.join(outBrand, `${name}.svg`), svg);
  const pngW = name.includes("horizontal") ? 2000 : 1200;
  await sharp(Buffer.from(svg), { density: 300 }).resize({ width: pngW }).png().toFile(path.join(outBrand, `${name}.png`));
}

// ── Favicon / app icons ──────────────────────────────────────────────────────
const F = src.faviconS;
function iconSvg(size, radius, inset) {
  const box = size - inset * 2;
  const k = (box * 0.86) / F.bbox.h;
  const gw = F.bbox.w * k;
  const gh = F.bbox.h * k;
  const tx = (size - gw) / 2 - F.bbox.x * k;
  const ty = (size - gh) / 2 - F.bbox.y * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${RED}"/><g transform="translate(${r1(tx)} ${r1(ty)}) scale(${r1(k * 1e5) / 1e5})" fill="#fff"><path d="${F.d}"/></g></svg>\n`;
}
const appDir = path.join(root, "src/app");
fs.writeFileSync(path.join(appDir, "icon.svg"), iconSvg(64, 14, 10));
await sharp(Buffer.from(iconSvg(180, 0, 34))).png().toFile(path.join(appDir, "apple-icon.png"));

// ICO container with embedded PNGs (supported by all current browsers)
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(
  icoSizes.map((s) => sharp(Buffer.from(iconSvg(64, 14, s <= 16 ? 6 : 10))).resize(s, s).png().toBuffer()),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const dir = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(icoSizes[i] % 256, 0);
  e.writeUInt8(icoSizes[i] % 256, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
fs.writeFileSync(path.join(appDir, "favicon.ico"), Buffer.concat([header, ...dir, ...pngs]));

// ── Default Open Graph image ─────────────────────────────────────────────────
{
  const v = stacked();
  const logoW = 560;
  const logoH = (v.h / v.w) * logoW;
  const logo = await sharp(Buffer.from(svgDoc(v, TITLE)), { density: 300 }).resize({ width: logoW }).png().toBuffer();
  const tagline = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="80"><text x="600" y="50" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="${NAVY}">Catatan, Berita, dan Perspektif tentang Sumenep</text></svg>`;
  const top = Math.round((630 - logoH - 110) / 2);
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: WARM } })
    .composite([
      { input: logo, left: Math.round((1200 - logoW) / 2), top },
      { input: Buffer.from(tagline), left: 0, top: Math.round(top + logoH + 34) },
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="8"><rect width="1200" height="8" fill="${RED}"/></svg>`), left: 0, top: 622 },
    ])
    .png()
    .toFile(path.join(root, "public/og-default.png"));
}

// Aspect ratios for <img width/height> (prevents layout shift)
const meta = Object.fromEntries(
  Object.entries(variants).map(([k, v]) => [k, { w: Math.round(v.w), h: Math.round(v.h) }]),
);
fs.writeFileSync(
  path.join(root, "src/components/brand/brand-meta.json"),
  JSON.stringify(meta, null, 2) + "\n",
);
console.log("brand assets written", meta);
