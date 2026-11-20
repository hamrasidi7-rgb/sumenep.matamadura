// One-time vector trace of the official logo (brand/source/logo.png) into
// brand/source/brand-source.json. Kept for provenance; the site never runs it.
//
//   npm i --no-save potrace@2.1.8
//   node brand/source/trace-logo.cjs
//
// Each part is traced on its own (everything outside its band is masked out),
// in the same 4× coordinate space, so parts can be recomposed or recoloured.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { Potrace } = require("potrace");

const SRC = path.join(__dirname, "logo.png");
const OUT = path.join(__dirname, "brand-source.json");
const SCALE = 4;
const clamp = (v) => Math.max(0, Math.min(255, v));

// Bands measured from the image (rows / columns in source pixels).
const PARTS = {
  sumenep: { ink: "dark", y: [140, 369] },
  mata: { ink: "dark", y: [368, 526] },
  madura: { ink: "red", y: [366, 526] },
  swoosh: { ink: "red", y: [535, 600] },
  s: { ink: "dark", y: [140, 369], x: [520, 669] },
};

(async () => {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const out = { source: "brand/source/logo.png", scale: SCALE, space: [w * SCALE, h * SCALE], colors: { ink: "#050404", red: "#D60303" }, parts: {} };

  for (const [name, part] of Object.entries(PARTS)) {
    const mask = Buffer.alloc(w * h, 255);
    for (let y = part.y[0]; y <= Math.min(h - 1, part.y[1]); y++) {
      for (let x = part.x ? part.x[0] : 0; x <= (part.x ? part.x[1] : w - 1); x++) {
        const i = (y * w + x) * 3;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const chroma = r - (g + b) / 2;
        const lum = (r + g + b) / 3;
        const cov = part.ink === "red" ? clamp(((chroma - 20) / 170) * 255) : chroma > 60 ? 0 : clamp(((235 - lum) / 190) * 255);
        mask[y * w + x] = 255 - cov;
      }
    }
    const png = await sharp(mask, { raw: { width: w, height: h, channels: 1 } })
      .median(5)
      .resize({ width: w * SCALE, kernel: "cubic" })
      .blur(5)
      .png()
      .toBuffer();
    const p = new Potrace({ threshold: 128, turdSize: 200, alphaMax: 1.0, optCurve: true, optTolerance: 0.6, blackOnWhite: true });
    await new Promise((ok, ko) => p.loadImage(png, (e) => (e ? ko(e) : ok())));
    const d = p
      .getPathTag()
      .match(/ d="([^"]+)"/)[1]
      .replace(/-?\d+\.\d+/g, (n) => String(Math.round(parseFloat(n) * 10) / 10));
    // Ink bounding box in the 4× space (via rasterising the path).
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * SCALE} ${h * SCALE}" width="${w * SCALE}" height="${h * SCALE}"><path fill-rule="evenodd" d="${d}"/></svg>`;
    const { info: t } = await sharp(Buffer.from(svg)).flatten({ background: "#fff" }).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    out.parts[name] = { d, bbox: { x: -t.trimOffsetLeft, y: -t.trimOffsetTop, w: t.width, h: t.height } };
    console.log(name, out.parts[name].bbox, `${d.length} chars`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
