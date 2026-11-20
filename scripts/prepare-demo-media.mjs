// One-time: extracts the demo images from the approved mockup
// ("mokup refrensi.png") into public/demo as WebP. These are design
// illustrations only — every caption says "Ilustrasi demo" — and are replaced by
// real, credited photos uploaded through the CMS media library (Tahap 5).
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "mokup refrensi.png");
const out = (f) => path.join(root, "public/demo", f);

const jobs = [
  // name,          left, top, width, height, outWidth
  ["senja-perahu.webp", 297, 588, 462, 260, 1280],
  ["gerbang-keraton.webp", 112, 947, 258, 115, 774],
  ["ruang-kelas.webp", 113, 1089, 259, 113, 777],
  ["nelayan.webp", 113, 1229, 260, 110, 780],
];

for (const [name, left, top, width, height, outWidth] of jobs) {
  const info = await sharp(src)
    .extract({ left, top, width, height })
    .resize({ width: outWidth, kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .webp({ quality: 82 })
    .toFile(out(name));
  console.log(name, info.width, "x", info.height);
}
