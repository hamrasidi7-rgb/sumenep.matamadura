import { jsonResponse, requireAdminApi } from "@/server/auth/api";
import { getDb } from "@/server/db";
import { deleteMedia } from "@/server/media/service";

// Delete one image (database row + file on disk). Same-origin + valid session
// only (requireAdminApi). An image still in use is refused with 409.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return jsonResponse({ error: "Gambar tidak ditemukan." }, 404);
  const result = await deleteMedia(getDb(), id, { adminId: guard.session.admin.id, ip: guard.ip, userAgent: guard.userAgent });
  if (!result.ok) return jsonResponse({ error: result.error }, result.status);
  return jsonResponse({ ok: true });
}
