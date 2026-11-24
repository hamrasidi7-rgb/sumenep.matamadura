// Smoke test website yang sedang berjalan, HANYA membaca (GET, plus satu POST
// lintas-origin yang selalu ditolak sebelum menyentuh database). Tidak login,
// tidak menulis data, tidak mencetak secret. Aman dijalankan ke production.
//
//   npm run prod:smoke                                   https://sumenep.matamaduranews.com
//   npm run prod:smoke -- --base http://localhost:3301   server lokal
//
// Selain halaman publik dan pengamanan admin, skrip ini menjawab dua pertanyaan
// tanpa kredensial apa pun:
//   - Database terhubung?    /api/admin/me dengan token sesi acak (format valid):
//                            401 = database terbaca, 500 = DATABASE_URL belum/tidak bisa dipakai.
//   - Media siap?            /media/<key acak yang valid>:
//                            404 = penyimpanan terbaca, 500 = MEDIA_ROOT belum diisi/tidak valid (atau driver S3 salah).
// Exit 0 = semua lolos, 1 = ada yang gagal.
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const PRODUCTION = "https://sumenep.matamaduranews.com";
const PARENT = "https://matamaduranews.com/";

const { values } = parseArgs({ options: { base: { type: "string", default: PRODUCTION } } });
const base = values.base.replace(/\/+$/, "");
const isProduction = base === PRODUCTION;

const results = [];
const add = (ok, label, detail) => results.push({ ok, label, detail });

async function hit(path, init = {}) {
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const started = Date.now();
  const response = await fetch(url, { redirect: "manual", cache: "no-store", ...init, signal: AbortSignal.timeout(30_000) });
  const body = init.method === "HEAD" ? "" : await response.text();
  return { status: response.status, headers: response.headers, body, ms: Date.now() - started };
}

async function check(label, run) {
  try {
    await run();
  } catch (error) {
    add(false, label, `tidak terjangkau: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await check("Beranda", async () => {
  const r = await hit("/");
  add(r.status === 200 && /<html/i.test(r.body), "Beranda", `${r.status}, ${r.ms} ms`);
});

await check("robots.txt", async () => {
  const r = await hit("/robots.txt");
  const blocked = /Disallow:\s*\/\s*$/m.test(r.body);
  add(r.status === 200, "robots.txt", `${r.status}, ${blocked ? "Disallow: / (noindex, mode staging)" : "situs boleh diindeks"}`);
});

await check("Halaman login", async () => {
  const r = await hit("/admin/login");
  const noStore = /no-store/.test(r.headers.get("cache-control") ?? "");
  const noIndex = /noindex/.test(r.headers.get("x-robots-tag") ?? "");
  const nonce = /'nonce-[^']+'/.test(r.headers.get("content-security-policy") ?? "");
  const form = /type="password"/.test(r.body);
  add(r.status === 200 && noStore && noIndex && nonce && form, "Halaman login",
    `${r.status}; no-store ${noStore ? "ya" : "TIDAK"}, noindex ${noIndex ? "ya" : "TIDAK"}, CSP nonce ${nonce ? "ya" : "TIDAK"}, form ${form ? "ada" : "TIDAK ADA"}`);
});

await check("Dashboard terlindungi", async () => {
  const r = await hit("/admin");
  const location = r.headers.get("location") ?? "";
  add([302, 303, 307, 308].includes(r.status) && location.includes("/admin/login"), "Dashboard terlindungi", `${r.status} → ${location || "(tanpa redirect)"}`);
});

await check("API tanpa sesi", async () => {
  const r = await hit("/api/admin/me");
  add(r.status === 401, "API tanpa sesi", `${r.status} (seharusnya 401)`);
});

await check("Database", async () => {
  // Format valid, tidak pernah ada di database. Dua nama cookie: next start / next dev.
  const token = randomBytes(32).toString("base64url");
  const r = await hit("/api/admin/me", { headers: { cookie: `__Host-sumenep_admin=${token}; sumenep_admin_dev=${token}` } });
  const detail = r.status === 401 ? "terhubung (sesi acak dicari di database → 401)"
    : r.status === 500 ? "BELUM terhubung (500): DATABASE_URL belum diisi, salah, atau MariaDB tidak terjangkau"
    : `status tak terduga ${r.status}`;
  add(r.status === 401, "Database", detail);
});

await check("Media", async () => {
  const key = `2000/01/${randomBytes(8).toString("hex")}.webp`; // format valid, tidak pernah ada
  const r = await hit(`/media/${key}`);
  const detail = r.status === 404 ? "penyimpanan terbaca (objek acak → 404)"
    : r.status === 500 ? "BELUM siap (500): MEDIA_ROOT belum diisi, relatif, di dalam folder aplikasi, atau tidak bisa dibaca"
    : `status tak terduga ${r.status}`;
  add(r.status === 404, "Media", detail);
});

await check("Artikel publik", async () => {
  const r = await hit(`/artikel/cek-${randomBytes(6).toString("hex")}`);
  const detail = r.status === 404 ? "slug acak → 404 (normal)"
    : r.status === 500 ? "500: CMS_PUBLIC_ARTICLES=on tetapi database tidak terbaca"
    : `status tak terduga ${r.status}`;
  add(r.status === 404, "Artikel publik", detail);
});

await check("Tolak lintas-origin", async () => {
  // Ditolak oleh pemeriksaan Origin sebelum sesi atau database disentuh.
  const r = await hit("/api/admin/logout", {
    method: "POST",
    headers: { origin: "https://matamaduranews.com", "sec-fetch-site": "cross-site" },
  });
  add(r.status === 403, "Tolak lintas-origin", `${r.status} (seharusnya 403)`);
});

if (isProduction) {
  await check("Website induk", async () => {
    const r = await hit(PARENT, { method: "HEAD" });
    add(r.status === 200, "Website induk", `${PARENT} → ${r.status}`);
  });
}

console.log(`Smoke test ${base} (read-only)\n`);
const width = Math.max(...results.map((r) => r.label.length));
for (const r of results) console.log(`${r.ok ? "[OK]   " : "[GAGAL]"} ${r.label.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\nRingkasan: ${results.length - failed} lolos, ${failed} gagal.`);
process.exitCode = failed ? 1 : 0;
