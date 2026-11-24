"use client";

import type { SectionKind } from "@prisma/client";
import { CheckCircle2, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createSectionAction,
  deleteSectionAction,
  toggleSectionAction,
  updateSectionAction,
} from "@/app/(admin)/admin/(panel)/seksi/actions";
import { Notice } from "@/components/admin/Notice";
import { slugify } from "@/lib/article-slug";
import type { SectionAdminRow } from "@/server/sections/service";

export function SectionManager({
  kanal,
  rubrik,
  initialKind = "KANAL",
}: {
  kanal: SectionAdminRow[];
  rubrik: SectionAdminRow[];
  initialKind?: SectionKind;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SectionKind>(initialKind);
  const [editing, setEditing] = useState<SectionAdminRow | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const items = activeTab === "KANAL" ? kanal : rubrik;
  const kindLabel = activeTab === "KANAL" ? "Kanal" : "Rubrik";

  function loadForm(row: SectionAdminRow | null) {
    setEditing(row);
    if (row) setActiveTab(row.kind);
    setName(row?.name ?? "");
    setSlug(row?.slug ?? "");
    setSlugTouched(Boolean(row));
    setDescription(row?.description ?? "");
    setSortOrder(row?.sortOrder ?? 0);
    setIsActive(row?.isActive ?? true);
    setNotice(null);
  }

  function switchTab(kind: SectionKind) {
    setActiveTab(kind);
    setEditing(null);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setDescription("");
    setSortOrder(0);
    setIsActive(true);
    setNotice(null);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!editing && !slugTouched) setSlug(slugify(value).slice(0, 80));
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const payload = {
        name,
        slug,
        description,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive,
      };
      const res = editing
        ? await updateSectionAction(editing.id, payload)
        : await createSectionAction({ ...payload, kind: activeTab });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      const savedName = name;
      if (!editing) loadForm(null);
      else setEditing((prev) => (prev ? { ...prev, name, slug: res.slug, description, sortOrder: payload.sortOrder, isActive } : null));
      setNotice({
        tone: "success",
        text: editing ? `${kindLabel} "${savedName}" diperbarui.` : `${kindLabel} "${savedName}" ditambahkan.`,
      });
      router.refresh();
    });
  }

  function handleToggle(row: SectionAdminRow) {
    setNotice(null);
    startTransition(async () => {
      const res = await toggleSectionAction(row.id);
      if (!res.ok) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      setNotice({
        tone: "success",
        text: res.isActive ? `"${row.name}" diaktifkan kembali.` : `"${row.name}" dinonaktifkan dari pilihan editor.`,
      });
      if (editing?.id === row.id) setIsActive(res.isActive);
      router.refresh();
    });
  }

  function handleDelete(row: SectionAdminRow) {
    if (!window.confirm(`Hapus ${row.kind === "KANAL" ? "kanal" : "rubrik"} "${row.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setNotice(null);
    startTransition(async () => {
      const res = await deleteSectionAction(row.id);
      if (!res.ok) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      if (editing?.id === row.id) loadForm(null);
      setNotice({ tone: "success", text: `"${row.name}" dihapus.` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Jenis struktur redaksi" className="flex gap-1 border-b border-line">
        {(
          [
            { kind: "KANAL", label: `Kanal (${kanal.length})` },
            { kind: "RUBRIK", label: `Rubrik (${rubrik.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.kind}
            onClick={() => switchTab(tab.kind)}
            className={`admin-tab ${activeTab === tab.kind ? "admin-tab-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <section className="admin-card" aria-labelledby="daftar-seksi-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="daftar-seksi-heading" className="font-display text-xl font-semibold">
              Daftar {kindLabel}
            </h2>
            {editing && (
              <button type="button" onClick={() => loadForm(null)} className="admin-button-quiet min-h-9 px-3 text-xs">
                <Plus className="size-3.5" aria-hidden="true" /> Tambah baru
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Belum ada {kindLabel.toLowerCase()}.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-warm px-1.5 py-0.5 font-mono text-xs text-muted tabular-nums">#{item.sortOrder}</span>
                      <p className="font-semibold text-ink break-words">{item.name}</p>
                      <span className={`admin-badge ${item.isActive ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>
                        {item.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted break-words">
                      /{item.kind.toLowerCase()}/{item.slug} · {item.articleCount} artikel
                      {item.homepageUsageCount > 0 ? " · Kurasi Beranda" : ""}
                    </p>
                    {item.description && <p className="mt-1 text-xs text-muted break-words">{item.description}</p>}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => loadForm(item)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink hover:border-ink/40 hover:bg-warm"
                    >
                      <Pencil className="size-3" aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleToggle(item)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink hover:border-ink/40 hover:bg-warm"
                    >
                      {item.isActive ? (
                        <>
                          <EyeOff className="size-3" aria-hidden="true" /> Nonaktifkan
                        </>
                      ) : (
                        <>
                          <Eye className="size-3" aria-hidden="true" /> Aktifkan
                        </>
                      )}
                    </button>
                    {item.articleCount === 0 && item.homepageUsageCount === 0 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleDelete(item)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-brand/30 bg-blush/60 px-2.5 text-xs font-semibold text-brand-deep hover:bg-blush"
                      >
                        <Trash2 className="size-3" aria-hidden="true" /> Hapus
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card" aria-labelledby="form-seksi-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="form-seksi-heading" className="font-display text-xl font-semibold">
              {editing ? `Ubah ${kindLabel}: ${editing.name}` : `Tambah ${kindLabel}`}
            </h2>
            <span className="admin-badge bg-warm text-ink">{editing ? `${editing.kind} (tetap)` : activeTab}</span>
          </div>

          <form onSubmit={submitForm} className="mt-4 space-y-4">
            <div>
              <label htmlFor="section-name" className="admin-label">Nama {kindLabel}</label>
              <input
                id="section-name"
                type="text"
                required
                maxLength={80}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={activeTab === "KANAL" ? "mis. Wisata & Budaya" : "mis. Suara Kepulauan"}
                disabled={pending}
                className="admin-input mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="section-slug" className="admin-label">Slug URL (`/{activeTab.toLowerCase()}/[slug]`)</label>
              <input
                id="section-slug"
                type="text"
                maxLength={80}
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                placeholder="Otomatis dari nama jika dikosongkan"
                disabled={pending}
                className="admin-input mt-1.5 font-mono text-sm"
              />
              <p className="admin-help">Huruf kecil, angka, dan tanda hubung (maks. 80 karakter).</p>
            </div>

            <div>
              <label htmlFor="section-desc" className="admin-label">Deskripsi (opsional)</label>
              <textarea
                id="section-desc"
                rows={3}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Penjelasan cakupan liputan untuk halaman seksi."
                disabled={pending}
                className="admin-input mt-1.5 py-2"
              />
            </div>

            <div>
              <label htmlFor="section-order" className="admin-label">Urutan tampil</label>
              <input
                id="section-order"
                type="number"
                min={0}
                max={999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number.parseInt(e.target.value || "0", 10) || 0)}
                disabled={pending}
                className="admin-input mt-1.5 w-32 tabular-nums"
              />
              <p className="admin-help">Angka lebih kecil tampil lebih awal pada daftar pilihan.</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending}
              />
              <span>Aktif di pilihan editor</span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" disabled={pending} className="admin-button">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                {pending ? "Menyimpan…" : editing ? `Perbarui ${kindLabel}` : `Simpan ${kindLabel}`}
              </button>
              {editing && (
                <button type="button" onClick={() => loadForm(null)} disabled={pending} className="admin-button-quiet">
                  Batal
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
