"use client";

import { Check, ImageUp, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FocalPointPicker } from "@/components/admin/media/FocalPointPicker";
import { FEATURED_IMAGE_LABEL, type MediaUploadPreset } from "@/lib/media-crop";
import type { MediaDto } from "@/server/media/service";

// Picker for images: upload a new one (with alt, caption, credit, and optional
// 1200 × 750 featured crop/focal point) or choose from Media Library uploads.

export function MediaPicker({
  title = "Pilih gambar",
  multiple,
  preset = "default",
  onDone,
}: {
  title?: string;
  multiple: boolean;
  preset?: MediaUploadPreset;
  onDone: (chosen: MediaDto[] | null) => void;
}) {
  const isFeatured = preset === "featured";
  const [tab, setTab] = useState<"pilih" | "unggah">("pilih");
  const [items, setItems] = useState<MediaDto[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderFilter, setFolderFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState({ alt: "", caption: "", credit: "", folderId: "" });
  const [cropFeatured, setCropFeatured] = useState(isFeatured);
  const [focal, setFocal] = useState({ focalX: 50, focalY: 50 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setPreviewUrl(null);
      setNaturalSize(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    setFocal({ focalX: 50, focalY: 50 });
    const img = new Image();
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setNaturalSize(null);
    img.src = nextUrl;
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ limit: "48", q: query });
        if (folderFilter) sp.set("folder", folderFilter);
        const res = await fetch(`/api/admin/media?${sp.toString()}`, { signal: controller.signal });
        const body = await res.json();
        if (res.ok) {
          setItems(body.media as MediaDto[]);
          if (Array.isArray(body.folders)) setFolders(body.folders as { id: string; name: string }[]);
        } else {
          setError(body.error ?? "Gagal memuat gambar.");
        }
      } catch {
        if (!controller.signal.aborted) setError("Gagal memuat gambar.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, folderFilter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  function toggle(id: string) {
    setSelected((current) => (multiple ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id]));
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pilih berkas gambar dulu.");
      return;
    }
    if (!meta.alt.trim()) {
      setError("Isi teks alternatif (alt): jelaskan isi gambar.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", meta.alt);
      form.append("caption", meta.caption);
      form.append("credit", meta.credit);
      if (meta.folderId) form.append("folderId", meta.folderId);
      if (cropFeatured) {
        form.append("preset", "featured");
        form.append("focalX", String(focal.focalX));
        form.append("focalY", String(focal.focalY));
      }
      const res = await fetch("/api/admin/media", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Gagal mengunggah.");
        return;
      }
      const media = body.media as MediaDto;
      if (multiple) {
        setItems((current) => [media, ...current.filter((m) => m.id !== media.id)]);
        setSelected((current) => [...current.filter((x) => x !== media.id), media.id]);
        setTab("pilih");
        setMeta({ alt: "", caption: "", credit: "", folderId: "" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setNaturalSize(null);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        onDone([media]);
      }
    } catch {
      setError("Gagal mengunggah. Periksa koneksi lalu coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  const chosen = selected.map((id) => items.find((m) => m.id === id)).filter((m): m is MediaDto => Boolean(m));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-xl bg-paper shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" onClick={() => onDone(null)} aria-label="Tutup" className="admin-icon-button">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex gap-1 border-b border-line px-4 pt-2" role="tablist">
          {(["pilih", "unggah"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`admin-tab ${tab === t ? "admin-tab-active" : ""}`}>
              {t === "pilih" ? "Pilih dari unggahan" : "Unggah baru"}
            </button>
          ))}
        </div>

        {isFeatured && (
          <p className="border-b border-line bg-warm/60 px-4 py-2 text-xs text-muted">
            Rekomendasi gambar utama: <strong className="font-semibold text-ink">{FEATURED_IMAGE_LABEL}</strong>. Pilih dari Media Library atau unggah foto baru untuk crop titik fokus otomatis.
          </p>
        )}

        {error && <p className="mx-4 mt-3 rounded-md bg-blush px-3 py-2 text-sm text-brand-deep" role="alert">{error}</p>}

        {tab === "pilih" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block flex-1">
                <span className="sr-only">Cari gambar</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari alt, caption, atau nama berkas" className="admin-input w-full pl-9" />
              </label>
              {folders.length > 0 && (
                <label className="block sm:w-44">
                  <span className="sr-only">Filter folder media</span>
                  <select
                    aria-label="Filter folder media"
                    value={folderFilter}
                    onChange={(e) => setFolderFilter(e.target.value)}
                    className="admin-input w-full"
                  >
                    <option value="">Semua folder</option>
                    <option value="none">Tanpa folder</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {loading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Memuat…</p>
            ) : items.length === 0 ? (
              <p className="mt-6 text-sm text-muted">Belum ada gambar. Unggah lewat tab “Unggah baru”.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {items.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <li key={m.id}>
                      <button type="button" onClick={() => toggle(m.id)} aria-pressed={on} className={`group relative block w-full overflow-hidden rounded-md border-2 text-left ${on ? "border-brand" : "border-transparent"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.src}
                          alt={m.alt}
                          className={`${isFeatured ? "aspect-[16/10]" : "aspect-[4/3]"} w-full bg-warm object-cover`}
                          loading="lazy"
                        />
                        <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-xs text-muted">
                          <span className="truncate">{m.alt || "(tanpa alt)"}</span>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums">{m.width}×{m.height}</span>
                        </span>
                        {on && <Check className="absolute top-1.5 right-1.5 size-6 rounded-full bg-brand p-1 text-white" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <label className="block text-sm font-semibold">
              Berkas gambar (JPEG, PNG, WebP, AVIF, GIF; maks. 15 MB)
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                onChange={handleFileChange}
                className="mt-1.5 block w-full text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cropFeatured}
                onChange={(e) => setCropFeatured(e.target.checked)}
                disabled={uploading}
              />
              <span>Pangkas otomatis ke ukuran gambar utama {FEATURED_IMAGE_LABEL}</span>
            </label>
            {previewUrl && (
              cropFeatured ? (
                <FocalPointPicker
                  src={previewUrl}
                  alt={meta.alt || "Pratinjau gambar utama"}
                  focalX={focal.focalX}
                  focalY={focal.focalY}
                  onChange={setFocal}
                  disabled={uploading}
                  naturalSize={naturalSize}
                />
              ) : (
                <div className="space-y-1">
                  <div className="overflow-hidden rounded-md border border-line bg-warm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt={meta.alt || "Pratinjau unggahan"} className="max-h-56 w-full object-contain" />
                  </div>
                  {naturalSize && (
                    <p className="text-xs text-muted tabular-nums">
                      Ukuran asli: {naturalSize.width} × {naturalSize.height} px (disimpan proporsional tanpa crop).
                    </p>
                  )}
                </div>
              )
            )}
            <label className="block text-sm font-semibold">
              Teks alternatif (alt) <span className="text-brand">*</span>
              <input value={meta.alt} onChange={(e) => setMeta({ ...meta, alt: e.target.value })} maxLength={500} className="admin-input mt-1.5" placeholder="Jelaskan isi gambar" />
            </label>
            <label className="block text-sm font-semibold">
              Caption
              <input value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} maxLength={500} className="admin-input mt-1.5" />
            </label>
            <label className="block text-sm font-semibold">
              Kredit foto
              <input value={meta.credit} onChange={(e) => setMeta({ ...meta, credit: e.target.value })} maxLength={200} className="admin-input mt-1.5" placeholder="Foto: …" />
            </label>
            {folders.length > 0 && (
              <label className="block text-sm font-semibold">
                Folder (opsional)
                <select
                  value={meta.folderId}
                  onChange={(e) => setMeta({ ...meta, folderId: e.target.value })}
                  className="admin-input mt-1.5 w-full"
                >
                  <option value="">Tanpa folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-muted">Data lokasi dan metadata kamera dihapus otomatis saat diunggah.</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={() => onDone(null)} className="admin-button-quiet">Batal</button>
          {tab === "unggah" ? (
            <button type="button" onClick={upload} disabled={uploading} className="admin-button">
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
              {uploading ? "Mengunggah…" : multiple ? "Unggah" : "Unggah & pakai"}
            </button>
          ) : (
            <button type="button" onClick={() => onDone(chosen)} disabled={!chosen.length} className="admin-button">
              Pakai{multiple && chosen.length ? ` (${chosen.length})` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
