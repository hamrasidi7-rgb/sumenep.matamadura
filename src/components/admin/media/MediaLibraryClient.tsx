"use client";

import {
  Check,
  Copy,
  FolderPlus,
  ImagePlus,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  createMediaFolderAction,
  deleteMediaAction,
  deleteMediaFolderAction,
  renameMediaFolderAction,
  updateMediaMetaAction,
} from "@/app/(admin)/admin/(panel)/media/actions";
import { formatBytes, formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import type {
  MediaFolderSummary,
  MediaLibraryData,
  MediaLibraryItem,
  MediaLibraryQuery,
  MediaUsageFilter,
} from "@/server/media/library";

function buildClientHref(query: Partial<MediaLibraryQuery> & { page?: number }) {
  const sp = new URLSearchParams();
  if (query.q?.trim()) sp.set("q", query.q.trim());
  if (query.folder && query.folder !== "semua") sp.set("folder", query.folder);
  if (query.usage && query.usage !== "semua") sp.set("pemakaian", query.usage);
  if (query.page && query.page > 1) sp.set("halaman", String(query.page));
  const qs = sp.toString();
  return qs ? `/admin/media?${qs}` : "/admin/media";
}

const USAGE_FILTERS: readonly { value: MediaUsageFilter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "dipakai", label: "Dipakai" },
  { value: "tidak-dipakai", label: "Belum dipakai" },
];

export function MediaLibraryClient({
  data,
  pagination,
}: {
  data: MediaLibraryData;
  pagination: React.ReactNode;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(data.items[0]?.id ?? null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form upload baru
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMeta, setUploadMeta] = useState({
    alt: "",
    caption: "",
    credit: "",
    folderId:
      data.query.folder !== "semua" && data.query.folder !== "tanpa-folder"
        ? data.query.folder
        : "",
  });

  // Editor metadata item terpilih
  const selectedItem: MediaLibraryItem | null =
    data.items.find((item) => item.id === selectedId) ?? data.items[0] ?? null;

  const [editMeta, setEditMeta] = useState({
    alt: selectedItem?.alt ?? "",
    caption: selectedItem?.caption ?? "",
    credit: selectedItem?.credit ?? "",
    folderId: selectedItem?.folderId ?? "",
  });

  useEffect(() => {
    setEditMeta({
      alt: selectedItem?.alt ?? "",
      caption: selectedItem?.caption ?? "",
      credit: selectedItem?.credit ?? "",
      folderId: selectedItem?.folderId ?? "",
    });
  }, [selectedItem]);

  // Modal hapus media permanen
  const [deleteTarget, setDeleteTarget] = useState<MediaLibraryItem | null>(null);

  // Kelola folder
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<MediaFolderSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [pending, startTransition] = useTransition();
  const inspectorRef = useRef<HTMLElement>(null);

  function selectItem(item: MediaLibraryItem) {
    setSelectedId(item.id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setTimeout(() => {
        inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 40);
    }
  }

  async function handleCopyUrl(item: MediaLibraryItem) {
    try {
      await navigator.clipboard.writeText(item.src);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 2000);
    } catch {
      setNotice({ tone: "error", message: "Gagal menyalin tautan gambar." });
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setNotice({ tone: "error", message: "Pilih berkas gambar terlebih dahulu." });
      return;
    }
    if (!uploadMeta.alt.trim()) {
      setNotice({ tone: "error", message: "Teks alternatif (alt) wajib diisi." });
      return;
    }
    setNotice(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", uploadMeta.alt.trim());
      form.append("caption", uploadMeta.caption.trim());
      form.append("credit", uploadMeta.credit.trim());
      if (uploadMeta.folderId) form.append("folderId", uploadMeta.folderId);

      const res = await fetch("/api/admin/media", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setNotice({ tone: "error", message: body.error ?? "Gagal mengunggah gambar." });
        return;
      }

      const media = body.media as MediaLibraryItem;
      setUploadMeta((prev) => ({ ...prev, alt: "", caption: "", credit: "" }));
      if (fileRef.current) fileRef.current.value = "";
      setUploadOpen(false);
      setSelectedId(media.id);
      setNotice({
        tone: "success",
        message: body.duplicate
          ? "Gambar identik sudah tersimpan di pustaka media."
          : "Gambar berhasil diunggah ke pustaka media.",
      });
      router.refresh();
    } catch {
      setNotice({ tone: "error", message: "Gagal mengunggah. Periksa koneksi lalu coba lagi." });
    } finally {
      setUploading(false);
    }
  }

  function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setNotice(null);
    startTransition(async () => {
      const res = await updateMediaMetaAction(selectedItem.id, {
        alt: editMeta.alt,
        caption: editMeta.caption,
        credit: editMeta.credit,
        folderId: editMeta.folderId ? editMeta.folderId : null,
      });
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setNotice({ tone: "success", message: "Keterangan dan folder gambar diperbarui." });
      router.refresh();
    });
  }

  function confirmDeleteMedia() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setNotice(null);
    startTransition(async () => {
      const res = await deleteMediaAction(target.id);
      setDeleteTarget(null);
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setSelectedId((prev) => (prev === target.id ? null : prev));
      setNotice({ tone: "success", message: `Gambar "${target.originalName}" dihapus permanen.` });
      router.refresh();
    });
  }

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) {
      setNotice({ tone: "error", message: "Masukkan nama folder baru." });
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const res = await createMediaFolderAction(newFolderName.trim());
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setNewFolderName("");
      setNotice({ tone: "success", message: `Folder "${res.folder.name}" dibuat.` });
      router.refresh();
    });
  }

  function handleRenameFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFolder) return;
    setNotice(null);
    startTransition(async () => {
      const res = await renameMediaFolderAction(editingFolder.id, renameValue.trim());
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setEditingFolder(null);
      setRenameValue("");
      setNotice({ tone: "success", message: `Nama folder diubah menjadi "${res.folder.name}".` });
      router.refresh();
    });
  }

  function handleDeleteFolder(folder: MediaFolderSummary) {
    setNotice(null);
    startTransition(async () => {
      const res = await deleteMediaFolderAction(folder.id);
      if (!res.ok) {
        setNotice({ tone: "error", message: res.error });
        return;
      }
      setNotice({
        tone: "success",
        message: `Folder "${res.name}" dihapus (${res.movedCount} gambar dipindahkan ke Tanpa folder).`,
      });
      if (data.query.folder === folder.id) {
        router.push(buildClientHref({ ...data.query, folder: "semua", page: 1 }));
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Ringkasan KPI Pustaka Media */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total gambar</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {data.stats.totalCount.toLocaleString("id-ID")}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {data.folders.length} folder &middot; {data.stats.withoutFolderCount} tanpa folder
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Penyimpanan</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {formatBytes(data.stats.totalBytes)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Format WebP terkompresi (maks. 2400 px)</p>
        </div>
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Status pemakaian</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {data.stats.usedCount}{" "}
            <span className="font-sans text-sm font-normal text-muted">
              dipakai &middot; {data.stats.unusedCount} belum dipakai
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted">Media yang masih dipakai terkunci dari hapus</p>
        </div>
      </div>

      {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}

      {/* Bilah Aksi Utama + Pencarian + Filter */}
      <div className="space-y-4 rounded-xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form method="get" action="/admin/media" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
            {data.query.folder !== "semua" && (
              <input type="hidden" name="folder" value={data.query.folder} />
            )}
            {data.query.usage !== "semua" && (
              <input type="hidden" name="pemakaian" value={data.query.usage} />
            )}
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Cari media</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={data.query.q}
                placeholder="Cari alt, caption, kredit, atau nama berkas…"
                className="admin-input w-full pl-9"
              />
            </label>
            <button type="submit" className="admin-button-quiet shrink-0">
              Cari
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFolderModalOpen((v) => !v)}
              aria-expanded={folderModalOpen}
              className="admin-button-quiet"
            >
              <FolderPlus className="size-4" aria-hidden />
              Kelola folder ({data.folders.length})
            </button>
            <button
              type="button"
              onClick={() => setUploadOpen((v) => !v)}
              aria-expanded={uploadOpen}
              className="admin-button"
            >
              <ImagePlus className="size-4" aria-hidden />
              Unggah gambar
            </button>
          </div>
        </div>

        {/* Panel Unggah Gambar Baru */}
        {uploadOpen && (
          <form
            onSubmit={handleUploadSubmit}
            className="space-y-3 rounded-lg border border-line bg-warm/40 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Unggah gambar baru</h2>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="admin-icon-button"
                aria-label="Tutup formulir unggah"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold sm:col-span-2">
                Berkas gambar (JPEG, PNG, WebP, AVIF, GIF; maks. 15 MB)
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  className="mt-1.5 block w-full text-sm"
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Teks alternatif (alt) <span className="text-brand">*</span>
                <input
                  value={uploadMeta.alt}
                  onChange={(e) => setUploadMeta({ ...uploadMeta, alt: e.target.value })}
                  maxLength={500}
                  placeholder="Jelaskan isi foto secara singkat"
                  className="admin-input mt-1 w-full"
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Folder (opsional)
                <select
                  value={uploadMeta.folderId}
                  onChange={(e) => setUploadMeta({ ...uploadMeta, folderId: e.target.value })}
                  className="admin-input mt-1 w-full"
                >
                  <option value="">Tanpa folder</option>
                  {data.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Caption (opsional)
                <input
                  value={uploadMeta.caption}
                  onChange={(e) => setUploadMeta({ ...uploadMeta, caption: e.target.value })}
                  maxLength={500}
                  className="admin-input mt-1 w-full"
                />
              </label>
              <label className="block text-sm font-semibold">
                Kredit foto (opsional)
                <input
                  value={uploadMeta.credit}
                  onChange={(e) => setUploadMeta({ ...uploadMeta, credit: e.target.value })}
                  maxLength={200}
                  placeholder="Foto: …"
                  className="admin-input mt-1 w-full"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted">
                Metadata EXIF/lokasi otomatis dihapus saat konversi ke WebP.
              </p>
              <button type="submit" disabled={uploading} className="admin-button">
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Mengunggah…
                  </>
                ) : (
                  "Simpan & unggah"
                )}
              </button>
            </div>
          </form>
        )}

        {/* Panel Kelola Folder */}
        {folderModalOpen && (
          <div className="space-y-3 rounded-lg border border-line bg-warm/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Kelola folder media</h2>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="admin-icon-button"
                aria-label="Tutup kelola folder"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="new-folder-name">
                Nama folder baru
              </label>
              <input
                id="new-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                maxLength={100}
                placeholder="Nama folder baru (mis. Liputan Kepulauan)"
                className="admin-input min-w-0 flex-1 sm:max-w-xs"
              />
              <button type="submit" disabled={pending} className="admin-button-quiet">
                Tambah folder
              </button>
            </form>

            {data.folders.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
                {data.folders.map((folder) => {
                  const isEditing = editingFolder?.id === folder.id;
                  return (
                    <li
                      key={folder.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      {isEditing ? (
                        <form onSubmit={handleRenameFolder} className="flex flex-1 flex-wrap items-center gap-2">
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            maxLength={100}
                            aria-label="Nama folder baru"
                            className="admin-input h-8 min-w-0 flex-1 text-sm"
                            required
                          />
                          <button type="submit" disabled={pending} className="admin-button h-8 px-3 text-xs">
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFolder(null)}
                            className="admin-button-quiet h-8 px-2.5 text-xs"
                          >
                            Batal
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <span className="font-semibold text-ink">{folder.name}</span>{" "}
                            <span className="text-xs text-muted">({folder.mediaCount} gambar)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolder(folder);
                                setRenameValue(folder.name);
                              }}
                              className="admin-button-quiet h-8 px-2.5 text-xs"
                            >
                              <Pencil className="size-3.5" aria-hidden /> Ubah nama
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => handleDeleteFolder(folder)}
                              className="admin-button-quiet h-8 px-2.5 text-xs text-brand-deep hover:border-brand/40"
                            >
                              <Trash2 className="size-3.5" aria-hidden /> Hapus
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted">
              Menghapus folder tidak menghapus berkas gambar; gambar di dalamnya berpindah ke Tanpa folder.
            </p>
          </div>
        )}

        {/* Filter Chips: Folder + Status Pemakaian */}
        <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter folder">
            <Link
              href={buildClientHref({ ...data.query, folder: "semua", page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                data.query.folder === "semua"
                  ? "bg-ink text-white"
                  : "border border-line bg-paper text-muted hover:text-ink"
              }`}
            >
              Semua folder ({data.stats.totalCount})
            </Link>
            <Link
              href={buildClientHref({ ...data.query, folder: "tanpa-folder", page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                data.query.folder === "tanpa-folder"
                  ? "bg-ink text-white"
                  : "border border-line bg-paper text-muted hover:text-ink"
              }`}
            >
              Tanpa folder ({data.stats.withoutFolderCount})
            </Link>
            {data.folders.map((folder) => {
              const active = data.query.folder === folder.id;
              return (
                <Link
                  key={folder.id}
                  href={buildClientHref({ ...data.query, folder: folder.id, page: 1 })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-ink text-white"
                      : "border border-line bg-paper text-muted hover:text-ink"
                  }`}
                >
                  {folder.name} ({folder.mediaCount})
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter pemakaian">
            {USAGE_FILTERS.map((u) => {
              const active = data.query.usage === u.value;
              return (
                <Link
                  key={u.value}
                  href={buildClientHref({ ...data.query, usage: u.value, page: 1 })}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "border border-line bg-paper text-muted hover:text-ink"
                  }`}
                >
                  {u.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid Media + Panel Detail */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center">
              <p className="font-semibold text-ink">Tidak ada gambar yang cocok.</p>
              <p className="mt-1 text-sm text-muted">
                Ubah kata kunci pencarian, pilih folder lain, atau unggah gambar baru.
              </p>
              {(data.query.q || data.query.folder !== "semua" || data.query.usage !== "semua") && (
                <Link href="/admin/media" className="admin-button-quiet mt-4 inline-flex">
                  Reset filter media
                </Link>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {data.items.map((item) => {
                const selected = selectedItem?.id === item.id;
                const used = item.totalUsages > 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectItem(item)}
                      aria-pressed={selected}
                      className={`group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-paper text-left transition-all ${
                        selected
                          ? "border-brand ring-2 ring-brand/20"
                          : "border-line hover:border-ink/40"
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-warm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.src}
                          alt={item.alt || item.originalName}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <span
                          className={`absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            used
                              ? "bg-emerald-700/90 text-white"
                              : "bg-ink/70 text-white"
                          }`}
                        >
                          {used ? `Dipakai (${item.totalUsages})` : "Kosong"}
                        </span>
                        {item.folderName && (
                          <span className="absolute bottom-2 left-2 max-w-[75%] truncate rounded bg-paper/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow-xs">
                            {item.folderName}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-1 p-2.5">
                        <p className="line-clamp-2 text-xs font-semibold text-ink">
                          {item.alt || item.originalName}
                        </p>
                        <p className="text-[11px] text-muted tabular-nums">
                          {item.width}&times;{item.height} &middot; {formatBytes(item.sizeBytes)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pagination}
        </div>

        {/* Panel Inspeksi & Edit Detail */}
        <aside ref={inspectorRef} aria-label="Detail media" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          {selectedItem ? (
            <div className="space-y-4 rounded-xl border border-line bg-paper p-4">
              <div className="overflow-hidden rounded-lg border border-line bg-warm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedItem.src}
                  alt={selectedItem.alt || selectedItem.originalName}
                  className="aspect-[16/10] w-full object-contain"
                />
              </div>

              <div className="space-y-1 text-xs text-muted">
                <p className="truncate font-semibold text-ink" title={selectedItem.originalName}>
                  {selectedItem.originalName}
                </p>
                <p className="tabular-nums">
                  {selectedItem.width}&times;{selectedItem.height} px &middot;{" "}
                  {formatBytes(selectedItem.sizeBytes)}
                </p>
                <p>Diunggah {formatWib(new Date(selectedItem.createdAtIso))}</p>
                <div className="flex items-center gap-2 pt-1">
                  <code className="min-w-0 flex-1 truncate rounded bg-warm px-2 py-1 text-[11px] text-ink">
                    {selectedItem.src}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(selectedItem)}
                    className="admin-button-quiet h-7 shrink-0 px-2 text-xs"
                  >
                    {copiedId === selectedItem.id ? (
                      <>
                        <Check className="size-3.5 text-emerald-700" aria-hidden /> Disalin
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" aria-hidden /> Salin URL
                      </>
                    )}
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveMeta} className="space-y-3 border-t border-line pt-3">
                <label className="block text-xs font-semibold text-ink">
                  Teks alternatif (alt)
                  <input
                    value={editMeta.alt}
                    onChange={(e) => setEditMeta({ ...editMeta, alt: e.target.value })}
                    maxLength={500}
                    className="admin-input mt-1 w-full text-sm"
                    placeholder="Jelaskan isi gambar untuk aksesibilitas & SEO"
                  />
                </label>
                <label className="block text-xs font-semibold text-ink">
                  Caption
                  <input
                    value={editMeta.caption}
                    onChange={(e) => setEditMeta({ ...editMeta, caption: e.target.value })}
                    maxLength={500}
                    className="admin-input mt-1 w-full text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-ink">
                  Kredit foto
                  <input
                    value={editMeta.credit}
                    onChange={(e) => setEditMeta({ ...editMeta, credit: e.target.value })}
                    maxLength={200}
                    className="admin-input mt-1 w-full text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-ink">
                  Folder media
                  <select
                    value={editMeta.folderId}
                    onChange={(e) => setEditMeta({ ...editMeta, folderId: e.target.value })}
                    className="admin-input mt-1 w-full text-sm"
                  >
                    <option value="">Tanpa folder</option>
                    {data.folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={pending} className="admin-button w-full">
                  Simpan keterangan
                </button>
              </form>

              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Pemakaian di situs ({selectedItem.totalUsages})
                </p>
                {selectedItem.totalUsages === 0 ? (
                  <p className="text-xs text-muted">Belum digunakan oleh artikel, penulis, atau pengaturan situs.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {selectedItem.usages.map((u, idx) => (
                      <li key={`${u.kind}-${idx}`} className="rounded bg-warm/70 px-2.5 py-1.5">
                        <span className="font-semibold text-ink">{u.kind}:</span>{" "}
                        {u.href ? (
                          <Link href={u.href} className="text-brand underline hover:text-brand-deep">
                            {u.label}
                          </Link>
                        ) : (
                          <span>{u.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={pending || selectedItem.totalUsages > 0}
                    onClick={() => setDeleteTarget(selectedItem)}
                    className="admin-button-quiet w-full border-brand/30 text-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {selectedItem.totalUsages > 0
                      ? "Terkunci (masih dipakai)"
                      : "Hapus permanen"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-paper p-5 text-sm text-muted">
              Pilih salah satu gambar untuk melihat detail pemakaian, mengubah keterangan, atau menghapusnya.
            </div>
          )}
        </aside>
      </div>

      {/* Modal Konfirmasi Hapus Permanen Media */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hapus-media-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-line bg-paper p-5 shadow-xl">
            <h2 id="hapus-media-title" className="font-display text-lg font-semibold text-ink">
              Hapus gambar secara permanen?
            </h2>
            <p className="text-sm text-muted">
              Gambar <span className="font-semibold text-ink">{deleteTarget.originalName}</span> (
              {formatBytes(deleteTarget.sizeBytes)}) akan dihapus permanen dari database dan disk penyimpanan. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setDeleteTarget(null)}
                className="admin-button-quiet"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmDeleteMedia}
                className="admin-button bg-brand-deep hover:bg-brand"
              >
                {pending ? "Menghapus…" : "Ya, hapus permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
