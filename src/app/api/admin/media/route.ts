import { jsonResponse, requireAdminApi } from "@/server/auth/api";
import { getDb } from "@/server/db";
import { MAX_UPLOAD_BYTES, MediaError, recentMedia, uploadImage } from "@/server/media/service";

// Image upload for the article editor (featured image, body images, gallery,
// infographic) and the list of recent uploads for the picker.
// Same-origin + valid session only (requireAdminApi); size and type are
// checked from the bytes on the server.

export async function GET(request: Request) {
  const guard = await requireAdminApi(request);
  if ("response" in guard) return guard.response;
  const url = new URL(request.url);
  const media = await recentMedia(getDb(), url.searchParams.get("q") ?? "", Number(url.searchParams.get("limit")) || 30);
  return jsonResponse({ media });
}

export async function POST(request: Request) {
  const guard = await requireAdminApi(request);
  if ("response" in guard) return guard.response;

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return jsonResponse({ error: "Berkas lebih dari 15 MB." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "Kiriman tidak valid." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonResponse({ error: "Pilih berkas gambar." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return jsonResponse({ error: "Berkas lebih dari 15 MB." }, 413);

  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  try {
    const result = await uploadImage(
      getDb(),
      { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
      { alt: text("alt"), caption: text("caption"), credit: text("credit") },
      { adminId: guard.session.admin.id, ip: guard.ip, userAgent: guard.userAgent },
    );
    return jsonResponse(result, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof MediaError) return jsonResponse({ error: error.message }, 422);
    throw error;
  }
}
