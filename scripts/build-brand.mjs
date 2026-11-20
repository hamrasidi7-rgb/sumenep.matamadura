// Generates every SUMENEP – Mata Madura identity asset from ONE source:
// brand/source/brand-source.json, a vector trace of the official logo
// brand/source/logo.png (see brand/source/trace-logo.cjs). Original colours
// of the logo are kept: ink #050404, red #D60303.
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
//   src/components/brand/brand-meta.json                ukuran intrinsik (anti layout shift)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const src = JSON.parse(fs.readFileSync(path.join(root, "brand/source/brand-source.json"), "utf8"));
const { ink: INK, red: RED } = src.colors;
const P = src.parts;
const WARM = "#FAF9F7";
const r1 = (n) => Math.round(n * 100) / 100;

const path_ = (part, fill, dx = 0, dy = 0) =>
  `<path fill="${fill}" fill-rule="evenodd"${dx || dy ? ` transform="translate(${r1(dx)} ${r1(dy)})"` : ""} d="${part.d}"/>`;

/** Wraps content given in trace space into a viewBox normalised to `outW` units wide. */
function frame(body, box, pad, outW) {
  const k = outW / (box.w + pad * 2);
  const w = outW;
  const h = (box.h + pad * 2) * k;
  return {
    vb: `0 0 ${r1(w)} ${r1(h)}`,
    body: `<g transform="scale(${r1(k * 1e6) / 1e6}) translate(${r1(-box.x + pad)} ${r1(-box.y + pad)})">${body}</g>`,
    w,
    h,
  };
}

const union = (...bs) => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};

function stacked({ sumenep = INK, mata = INK, madura = RED, swoosh = RED } = {}) {
  const box = union(P.sumenep.bbox, P.mata.bbox, P.madura.bbox, P.swoosh.bbox);
  const body = path_(P.sumenep, sumenep) + path_(P.mata, mata) + path_(P.madura, madura) + path_(P.swoosh, swoosh);
  return frame(body, box, 40, 1000);
}

function horizontal({ sumenep = INK, mata = INK, madura = RED, rule = RED } = {}) {
  // SUMENEP | matamadura — same relative size as the stacked logo, baselines aligned.
  const s = P.sumenep.bbox;
  const mm = union(P.mata.bbox, P.madura.bbox);
  const gap = 170;
  const ruleW = 44;
  const ruleX = s.x + s.w + gap;
  const dx = ruleX + ruleW + gap - mm.x;
  const dy = s.y + s.h - (mm.y + mm.h); // align bottoms (baselines)
  const rect = `<rect x="${ruleX}" y="${s.y}" width="${ruleW}" height="${s.h}" fill="${rule}"/>`;
  const body = path_(P.sumenep, sumenep) + rect + path_(P.mata, mata, dx, dy) + path_(P.madura, madura, dx, dy);
  const box = { x: s.x, y: s.y, w: mm.x + mm.w + dx - s.x, h: s.h };
  return frame(body, box, 40, 2000);
}

const svgDoc = ({ vb, body }, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

const TITLE = "SUMENEP – Mata Madura";
const outBrand = path.join(root, "public/brand");
fs.mkdirSync(outBrand, { recursive: true });

const variants = {
  "sumenep-matamadura-stacked": stacked(),
  "sumenep-matamadura-horizontal": horizontal(),
  "sumenep-matamadura-mono": stacked({ sumenep: INK, mata: INK, madura: INK, swoosh: INK }),
  "sumenep-matamadura-mono-white": stacked({ sumenep: "#fff", mata: "#fff", madura: "#fff", swoosh: "#fff" }),
};

for (const [name, v] of Object.entries(variants)) {
  const svg = svgDoc(v, TITLE);
  fs.writeFileSync(path.join(outBrand, `${name}.svg`), svg);
  const pngW = name.includes("horizontal") ? 2000 : 1200;
  await sharp(Buffer.from(svg), { density: 300 }).resize({ width: pngW }).png().toFile(path.join(outBrand, `${name}.png`));
}

// ── Favicon / app icons: the logo's own "S", white on the logo red ───────────
const S = P.s;
function iconSvg(size, radius, inset) {
  const box = size - inset * 2;
  const k = (box * 0.84) / S.bbox.h;
  const gw = S.bbox.w * k;
  const gh = S.bbox.h * k;
  const tx = (size - gw) / 2 - S.bbox.x * k;
  const ty = (size - gh) / 2 - S.bbox.y * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${RED}"/><g transform="translate(${r1(tx)} ${r1(ty)}) scale(${r1(k * 1e6) / 1e6})"><path fill="#fff" fill-rule="evenodd" d="${S.d}"/></g></svg>\n`;
}
const appDir = path.join(root, "src/app");
fs.writeFileSync(path.join(appDir, "icon.svg"), iconSvg(64, 14, 10));
await sharp(Buffer.from(iconSvg(180, 0, 34))).png().toFile(path.join(appDir, "apple-icon.png"));

// ICO container with embedded PNGs (supported by all current browsers)
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(icoSizes.map((s) => sharp(Buffer.from(iconSvg(64, 14, s <= 16 ? 6 : 10))).resize(s, s).png().toBuffer()));
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
  const logoW = 520;
  const logoH = Math.round((v.h / v.w) * logoW);
  const logo = await sharp(Buffer.from(svgDoc(v, TITLE)), { density: 300 }).resize({ width: logoW }).png().toBuffer();
  const tagline = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="80"><text x="600" y="50" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#111827">Catatan, Berita, dan Perspektif tentang Sumenep</text></svg>`;
  const top = Math.round((630 - logoH - 110) / 2);
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: WARM } })
    .composite([
      { input: logo, left: Math.round((1200 - logoW) / 2), top },
      { input: Buffer.from(tagline), left: 0, top: top + logoH + 30 },
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="8"><rect width="1200" height="8" fill="${RED}"/></svg>`), left: 0, top: 622 },
    ])
    .png()
    .toFile(path.join(root, "public/og-default.png"));
}

const meta = Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, { w: Math.round(v.w), h: Math.round(v.h) }]));
fs.writeFileSync(path.join(root, "src/components/brand/brand-meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log("brand assets written", meta);
