import { getMediaStorage, MEDIA_KEY_PATTERN } from "@/server/media/storage";

// Public images uploaded through the CMS. Keys are derived from the file's
// content and never reused, so the response can be cached for a year by the
// browser and the CDN. Anything that is not a well-formed media key is a 404
// (no path traversal, no listing).
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!MEDIA_KEY_PATTERN.test(key)) return new Response("Tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const data = await getMediaStorage().get(key);
  if (!data) return new Response("Tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
