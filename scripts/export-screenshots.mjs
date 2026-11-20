// Copies selected QA screenshots into docs/screenshots/<stage>/ as compact JPEGs
// (mobile shots are downscaled to 1×), so deliverables live in the repository.
//
//   node scripts/export-screenshots.mjs <stage> <file.png> [<file.png> …]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [stage, ...files] = process.argv.slice(2);
if (!stage || files.length === 0) {
  console.error("usage: node scripts/export-screenshots.mjs <stage> <qa/shots/file.png> …");
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "docs/screenshots", stage);
fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const src = path.resolve(root, f);
  const meta = await sharp(src).metadata();
  const isRetina = /mobile/.test(f) && meta.width && meta.width >= 700;
  const name = path.basename(f).replace(/\.png$/, ".jpg");
  let img = sharp(src, { limitInputPixels: false });
  if (isRetina) img = img.resize({ width: Math.round(meta.width / 2) });
  const info = await img.flatten({ background: "#ffffff" }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(outDir, name));
  console.log(`${name}  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
}
