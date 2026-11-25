"use client";

import { CheckCircle2, ExternalLink, ImageIcon, Loader2, Pencil, Plus, Trash2, UserCheck, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createAuthorAction,
  deleteAuthorAction,
  toggleAuthorAction,
  updateAuthorAction,
} from "@/app/(admin)/admin/(panel)/penulis/actions";
import { useMedia } from "@/components/admin/editor/MediaContext";
import { Notice } from "@/components/admin/Notice";
import { WordCounter } from "@/components/admin/WordCounter";
import { slugify } from "@/lib/article-slug";
import type { AuthorAdminRow } from "@/server/authors/service";

export function AuthorManager({ authors }: { authors: AuthorAdminRow[] }) {
  const router = useRouter();
  const { media, pick } = useMedia();
  const [editing, setEditing] = useState<AuthorAdminRow | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  function loadForm(author: AuthorAdminRow | null) {
    setEditing(author);
    setName(author?.name ?? "");
    setSlug(author?.slug ?? "");
    setSlugTouched(Boolean(author));
    setRole(author?.role ?? "");
    setBio(author?.bio ?? "");
    setAvatarId(author?.avatarId ?? null);
    setIsActive(author?.isActive ?? true);
    setNotice(null);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!editing && !slugTouched) setSlug(slugify(value).slice(0, 80));
  }

  async function pickAvatar() {
    const chosen = await pick({ title: "Pilih foto profil penulis" });
    if (chosen?.length) setAvatarId(chosen[0].id);
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const payload = { name, slug, role, bio, avatarId, isActive };
      const res = editing
        ? await updateAuthorAction(editing.id, payload)
        : await createAuthorAction(payload);
      if (!res.ok) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      const savedName = name;
      if (!editing) loadForm(null);
      else setEditing((prev) => (prev ? { ...prev, name, slug: res.slug, role, bio, avatarId, isActive } : null));
      setNotice({
        tone: "success",
        text: editing ? `Profil "${savedName}" diperbarui.` : `Penulis "${savedName}" ditambahkan.`,
      });
      router.refresh();
    });
  }

  function handleToggle(author: AuthorAdminRow) {
    setNotice(null);
    startTransition(async () => {
      const res = await toggleAuthorAction(author.id);
      if (!res.ok) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      setNotice({
        tone: "success",
        text: res.isActive ? `"${author.name}" diaktifkan kembali.` : `"${author.name}" dinonaktifkan dari pilihan editor.`,
      });
      if (editing?.id === author.id) setIsActive(res.isActive);
      router.refresh();
    });
  }

  function handleDelete(author: AuthorAdminRow) {
    if (!window.confirm(`Hapus profil penulis "${author.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setNotice(null);
    startTransition(async () => {
      const res = await deleteAuthorAction(author.id);
      if (!res.ok) {
        setNotice({ tone: "error", text: res.error });
        return;
      }
      if (editing?.id === author.id) loadForm(null);
      setNotice({ tone: "success", text: `Profil "${author.name}" dihapus.` });
      router.refresh();
    });
  }

  const previewSrc = avatarId ? media[avatarId]?.src ?? editing?.avatarSrc ?? null : null;

  return (
    <div className="space-y-6">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <section className="admin-card" aria-labelledby="daftar-penulis-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="daftar-penulis-heading" className="font-display text-xl font-semibold">
              Daftar Penulis ({authors.length})
            </h2>
            {editing && (
              <button type="button" onClick={() => loadForm(null)} className="admin-button-quiet min-h-9 px-3 text-xs">
                <Plus className="size-3.5" aria-hidden="true" /> Tambah baru
              </button>
            )}
          </div>

          {authors.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Belum ada profil penulis.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {authors.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {a.avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.avatarSrc} alt="" className="size-12 shrink-0 rounded-full border border-line bg-warm object-cover" loading="lazy" />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-warm text-sm font-semibold text-muted" aria-hidden="true">
                        {a.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink break-words">{a.name}</p>
                        <span className={`admin-badge ${a.isActive ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>
                          {a.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted break-words">
                        {[a.role || "Tanpa peran", `/penulis/${a.slug}`, `${a.articleCount} artikel`].join(" · ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {(a.isActive || a.articleCount > 0) && (
                      <a
                        href={`/penulis/${a.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink hover:border-ink/40 hover:bg-warm"
                      >
                        <ExternalLink className="size-3" aria-hidden="true" /> Profil
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => loadForm(a)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink hover:border-ink/40 hover:bg-warm"
                    >
                      <Pencil className="size-3" aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleToggle(a)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-paper px-2.5 text-xs font-semibold text-ink hover:border-ink/40 hover:bg-warm"
                    >
                      {a.isActive ? (
                        <>
                          <UserMinus className="size-3" aria-hidden="true" /> Nonaktifkan
                        </>
                      ) : (
                        <>
                          <UserCheck className="size-3" aria-hidden="true" /> Aktifkan
                        </>
                      )}
                    </button>
                    {a.articleCount === 0 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleDelete(a)}
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

        <section className="admin-card" aria-labelledby="form-penulis-heading">
          <h2 id="form-penulis-heading" className="font-display text-xl font-semibold">
            {editing ? `Ubah penulis: ${editing.name}` : "Tambah penulis baru"}
          </h2>

          <form onSubmit={submitForm} className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc} alt="" className="size-20 shrink-0 rounded-full border border-line bg-warm object-cover" />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-full border border-dashed border-line bg-warm text-muted">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={pickAvatar} disabled={pending} className="admin-button-quiet min-h-9 px-3 text-xs">
                  {previewSrc ? "Ganti foto" : "Pilih / unggah foto"}
                </button>
                {previewSrc && (
                  <button
                    type="button"
                    onClick={() => setAvatarId(null)}
                    disabled={pending}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Lepas foto
                  </button>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="author-name" className="admin-label">Nama lengkap</label>
              <input
                id="author-name"
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="mis. Ahmad Fauzi"
                disabled={pending}
                className="admin-input mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="author-slug" className="admin-label">Slug URL (`/penulis/[slug]`)</label>
              <input
                id="author-slug"
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
              <label htmlFor="author-role" className="admin-label">Jabatan / Profesi</label>
              <input
                id="author-role"
                type="text"
                maxLength={200}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="mis. Tim Redaksi, Wartawan Kepulauan"
                disabled={pending}
                className="admin-input mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="author-bio" className="admin-label">Bio singkat (opsional)</label>
              <textarea
                id="author-bio"
                rows={4}
                maxLength={3000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ringkasan profil penulis yang tampil di halaman artikel & penulis."
                disabled={pending}
                className="admin-input mt-1.5 py-2"
              />
              <WordCounter text={bio} recommendedMin={20} id="author-bio-counter" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending}
              />
              <span>Aktif di daftar pilihan penulis editor artikel</span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" disabled={pending} className="admin-button">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                {pending ? "Menyimpan…" : editing ? "Perbarui penulis" : "Simpan penulis"}
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
