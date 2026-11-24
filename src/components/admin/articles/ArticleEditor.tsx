"use client";

import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CloudOff,
  Eye,
  ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  changeArticleStateAction,
  createArticleAction,
  deleteArticleAction,
  publishArticleAction,
  revisionSnapshotAction,
  saveArticleAction,
  updateMediaMetaAction,
} from "@/app/(admin)/admin/(panel)/artikel/actions";
import { articleStatusLabel, formatWib } from "@/components/admin/format";
import { Notice } from "@/components/admin/Notice";
import { WordCounter } from "@/components/admin/WordCounter";
import { EMPTY_DOC, type DocNode } from "@/lib/article-doc";
import { slugify } from "@/lib/article-slug";
import { analyzeBody, type SeoField } from "@/lib/seo-engine";
import { buildSeoPreview, estimateReadingMinutes, SITE_PUBLIC_HOST } from "@/lib/seo-preview";
import type { EditableArticle } from "@/server/articles/queries";
import type { ArticleState } from "@/server/articles/status";
import type { MediaDto } from "@/server/media/service";

import { MediaProvider, useMedia } from "../editor/MediaContext";
import { RichTextEditor } from "../editor/RichTextEditor";
import { SettingsSection } from "../editor/SettingsSection";
import { clearDraft, draftKey, readDraft, writeDraft } from "./local-draft";
import { SeoPanel } from "./SeoPanel";
import { StateBadge } from "./StateBadge";

// The article editor: fields, body, featured image, SEO, publication.
//
// Saving (adapted from Busacare components/admin/artikel-form.tsx: debounced
// autosave that stops on a conflict, "unsaved changes" guard on leaving):
//   - every change is copied to this browser first (local-draft.ts);
//   - a draft is saved to the server 2.5 s after the last change, with the
//     version it started from; a newer version elsewhere = conflict, nothing is
//     overwritten, and the Admin decides;
//   - offline: changes stay in the browser and are retried when back online;
//   - a live article (published or scheduled) is never autosaved to the
//     server — changes go public only through "Perbarui".

type Template = "STANDARD" | "FEATURE" | "SPOTLIGHT";

export interface FormFields {
  title: string;
  slug: string;
  standfirst: string;
  template: Template;
  body: DocNode;
  authorId: string;
  kanalId: string;
  rubrikId: string;
  heroMediaId: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogMediaId: string;
  hideFromHomepage: boolean;
}

interface Option {
  id: string;
  name: string;
  slug: string;
}

export interface EditorProps {
  initial: EditableArticle | null;
  media: Record<string, MediaDto>;
  options: { kanal: Option[]; rubrik: Option[]; authors: Option[] };
  defaultAuthorId: string | null;
  backHref?: string;
  revisions: { id: string; version: number; reason: string; createdAt: string }[];
  statusHistory?: { id: string; fromStatus: string | null; toStatus: string; changedAt: string }[];
}

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "offline" | "error" | "conflict" | "live";

const TEMPLATES: { value: Template; label: string; help: string }[] = [
  { value: "STANDARD", label: "Berita", help: "Laporan harian" },
  { value: "FEATURE", label: "Feature", help: "Liputan mendalam, profil, opini" },
  { value: "SPOTLIGHT", label: "Sorotan", help: "Gambar besar di bagian atas" },
];

const REASON: Record<string, string> = { MANUAL_SAVE: "Disimpan", PUBLISH: "Diterbitkan", RESTORE: "Dipulihkan" };

function initialFields(props: EditorProps): FormFields {
  const a = props.initial;
  return {
    title: a?.title ?? "",
    slug: a?.slug ?? "",
    standfirst: a?.standfirst ?? "",
    template: a?.template ?? "STANDARD",
    body: a?.body ?? EMPTY_DOC,
    authorId: a?.authorId ?? props.defaultAuthorId ?? props.options.authors[0]?.id ?? "",
    kanalId: a?.kanalId ?? "",
    rubrikId: a?.rubrikId ?? "",
    heroMediaId: a?.heroMediaId ?? "",
    tags: a?.tags ?? [],
    seoTitle: a?.seoTitle ?? "",
    seoDescription: a?.seoDescription ?? "",
    canonicalUrl: a?.canonicalUrl ?? "",
    ogMediaId: a?.ogMediaId ?? "",
    hideFromHomepage: a?.hideFromHomepage ?? false,
  };
}

function toInput(f: FormFields) {
  return {
    ...f,
    kanalId: f.kanalId || null,
    rubrikId: f.rubrikId || null,
    heroMediaId: f.heroMediaId || null,
    ogMediaId: f.ogMediaId || null,
  };
}

/** "2026-11-21T10:30" in WIB ⇄ ISO instant. Schedules are always WIB, whatever the browser's zone. */
function isoToWibInput(iso: string | null): string {
  if (!iso) return "";
  const wib = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return wib.toISOString().slice(0, 16);
}
function wibInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function snapshotToFields(s: Record<string, unknown>, fallback: FormFields): FormFields {
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  return {
    ...fallback,
    title: str("title") || fallback.title,
    slug: str("slug") || fallback.slug,
    standfirst: str("standfirst"),
    template: (["STANDARD", "FEATURE", "SPOTLIGHT"].includes(str("template")) ? str("template") : "STANDARD") as Template,
    body: (s.body as DocNode) ?? EMPTY_DOC,
    authorId: str("authorId") || fallback.authorId,
    kanalId: str("kanalId"),
    rubrikId: str("rubrikId"),
    heroMediaId: str("heroMediaId"),
    tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
    seoTitle: str("seoTitle"),
    seoDescription: str("seoDescription"),
    canonicalUrl: str("canonicalUrl"),
    ogMediaId: str("ogMediaId"),
    hideFromHomepage: Boolean(s.hideFromHomepage),
  };
}

export function ArticleEditor(props: EditorProps) {
  return (
    <MediaProvider initial={props.media}>
      <Editor {...props} />
    </MediaProvider>
  );
}

function Editor(props: EditorProps) {
  const router = useRouter();
  const { media } = useMedia();
  const everPublished = props.initial?.everPublished ?? false;

  const [articleId, setArticleId] = useState<string | null>(props.initial?.id ?? null);
  const [version, setVersion] = useState(props.initial?.version ?? 0);
  const [state, setState] = useState<ArticleState | "baru">(props.initial?.state ?? "baru");
  const [publishedAt, setPublishedAt] = useState<string | null>(props.initial?.publishedAt ?? null);
  const [fields, setFields] = useState<FormFields>(() => initialFields(props));
  const [slugTouched, setSlugTouched] = useState(Boolean(props.initial));
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<{ status: SaveStatus; message?: string; at?: string }>({ status: "idle" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ version: number; updatedAt: string } | null>(null);
  const [restoreOffer, setRestoreOffer] = useState<{ fields: FormFields; savedAt: string } | null>(null);
  const [scheduleAt, setScheduleAt] = useState(isoToWibInput(props.initial?.publishedAt ?? null));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [heroSectionSignal, setHeroSectionSignal] = useState(0);
  const [seoSectionSignal, setSeoSectionSignal] = useState(0);

  const live = state === "terbit" || state === "terjadwal";
  const trashed = state === "sampah";
  const key = draftKey(articleId);

  // Latest values for async code (timers, event listeners).
  const latest = useRef({ fields, version, articleId, dirty, saving: false, again: false });
  latest.current = { ...latest.current, fields, version, articleId, dirty };

  const update = useCallback(
    (patch: Partial<FormFields>) => {
      setFields((current) => {
        const next = { ...current, ...patch };
        if ("title" in patch && !slugTouched && !everPublished) next.slug = slugify(next.title);
        return next;
      });
      setDirty(true);
      setErrors((e) => {
        const copy = { ...e };
        for (const k of Object.keys(patch)) delete copy[k];
        return copy;
      });
    },
    [slugTouched, everPublished],
  );

  // A copy in this browser on every change.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => writeDraft(key, fields, version), 400);
    return () => clearTimeout(t);
  }, [dirty, fields, key, version]);

  // Offer unsaved changes found in this browser (newer than the server copy).
  useEffect(() => {
    const local = readDraft<FormFields>(draftKey(props.initial?.id ?? null));
    if (!local) return;
    const serverTime = props.initial ? new Date(props.initial.updatedAt).getTime() : 0;
    if (new Date(local.savedAt).getTime() > serverTime && JSON.stringify(local.fields) !== JSON.stringify(initialFields(props))) {
      setRestoreOffer({ fields: local.fields, savedAt: local.savedAt });
    } else {
      clearDraft(draftKey(props.initial?.id ?? null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (latest.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const failure = useCallback((r: { error: string; fields?: Record<string, string>; conflict?: { version: number; updatedAt: string }; live?: boolean }) => {
    if (r.conflict) {
      setConflict(r.conflict);
      setSave({ status: "conflict", message: r.error });
    } else if (r.live) {
      setSave({ status: "live", message: "Perubahan belum tayang — tekan Perbarui." });
    } else {
      if (r.fields) setErrors(r.fields);
      setSave({ status: "error", message: r.error });
    }
    return false;
  }, []);

  const persist = useCallback(
    async (mode: "autosave" | "manual"): Promise<boolean> => {
      if (latest.current.saving) {
        latest.current.again = true;
        return false;
      }
      const snapshot = latest.current.fields;
      latest.current.saving = true;
      setSave({ status: "saving" });
      try {
        let id = latest.current.articleId;
        let currentVersion = latest.current.version;
        if (!id) {
          const created = await createArticleAction(toInput(snapshot));
          if (!created.ok) return failure(created);
          id = created.id;
          currentVersion = created.version;
          setArticleId(id);
          setVersion(created.version);
          setState("draf");
          latest.current.articleId = id;
          latest.current.version = created.version;
          clearDraft(draftKey(null));
          window.history.replaceState(null, "", `/admin/artikel/${id}`);
          if (mode === "autosave") {
            setSlugFromServer(created.slug);
            return done(snapshot);
          }
        }
        const result = await saveArticleAction(id, currentVersion, toInput(snapshot), mode);
        if (!result.ok) return failure(result);
        setVersion(result.version);
        latest.current.version = result.version;
        setState(result.state);
        setSlugFromServer(result.slug);
        return done(snapshot);
      } catch {
        setSave(navigator.onLine ? { status: "error", message: "Gagal menyimpan. Perubahan aman di perangkat ini; dicoba lagi." } : { status: "offline" });
        setTimeout(() => latest.current.dirty && void persistRef.current("autosave"), 15_000);
        return false;
      } finally {
        latest.current.saving = false;
        if (latest.current.again) {
          latest.current.again = false;
          setTimeout(() => void persistRef.current("autosave"), 300);
        }
      }

      function done(saved: FormFields) {
        if (latest.current.fields === saved) {
          setDirty(false);
          latest.current.dirty = false;
          clearDraft(draftKey(latest.current.articleId));
        }
        setErrors({});
        setSave({ status: "saved", at: new Date().toISOString() });
        return true;
      }
      function setSlugFromServer(slug: string) {
        setFields((f) => (f.slug === slug || latest.current.fields !== snapshot ? f : { ...f, slug }));
      }
    },
    [failure],
  );
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Autosave drafts 2.5 s after the last change.
  useEffect(() => {
    if (!dirty || conflict || trashed) return;
    if (live) {
      setSave({ status: "live", message: "Perubahan belum tayang — tekan Perbarui." });
      return;
    }
    if (!fields.title.trim()) {
      setSave({ status: "pending", message: "Isi judul untuk mulai menyimpan otomatis." });
      return;
    }
    setSave((s) => (s.status === "saving" ? s : { status: "pending" }));
    const t = setTimeout(() => void persistRef.current("autosave"), 2500);
    return () => clearTimeout(t);
  }, [fields, dirty, conflict, live, trashed]);

  // Back online: retry.
  useEffect(() => {
    const online = () => latest.current.dirty && !live && void persistRef.current("autosave");
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [live]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await work();
    } catch {
      setNotice({ tone: "error", text: "Gagal menghubungi server. Coba lagi." });
    } finally {
      setBusy(null);
    }
  }

  /** Save pending draft changes first. A live article is never saved implicitly (that would publish them). */
  async function ensureSaved(): Promise<boolean> {
    if (live) return true;
    if (!latest.current.articleId || latest.current.dirty) return persist("autosave");
    return true;
  }

  const publish = (scheduled: boolean) =>
    run(scheduled ? "schedule" : "publish", async () => {
      const when = scheduled ? wibInputToIso(scheduleAt) : null;
      if (scheduled && (!when || new Date(when).getTime() <= Date.now())) {
        setErrors((e) => ({ ...e, publishedAt: "Pilih tanggal dan jam di masa depan (WIB)." }));
        return;
      }
      if (!latest.current.articleId && !(await persist("autosave"))) return;
      const id = latest.current.articleId!;
      const snapshot = latest.current.fields;
      const result = await publishArticleAction(id, latest.current.version, toInput(snapshot), when);
      if (!result.ok) {
        failure(result);
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setVersion(result.version);
      latest.current.version = result.version;
      setState(result.state);
      setPublishedAt(result.publishedAt);
      setScheduleAt(isoToWibInput(result.publishedAt));
      if (latest.current.fields === snapshot) {
        setDirty(false);
        latest.current.dirty = false;
        clearDraft(draftKey(id));
      }
      setSave({ status: "saved", at: new Date().toISOString() });
      setNotice({ tone: "success", text: result.state === "terjadwal" ? `Dijadwalkan terbit ${formatWib(new Date(result.publishedAt))}.` : "Artikel terbit." });
      router.refresh();
    });

  const changeState = (action: "unpublish" | "archive" | "unarchive" | "trash" | "restore", confirmText?: string) =>
    run(action, async () => {
      if (confirmText && !window.confirm(confirmText)) return;
      if (!latest.current.articleId) return;
      if (action !== "restore" && latest.current.dirty && !(await ensureSaved())) return;
      const result = await changeArticleStateAction(latest.current.articleId, latest.current.version, action);
      if (!result.ok) {
        failure(result);
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setVersion(result.version);
      latest.current.version = result.version;
      setState(result.state);
      const text = { unpublish: "Artikel ditarik dari publikasi (kembali menjadi draf).", archive: "Artikel diarsipkan.", unarchive: "Artikel dikembalikan dari arsip sebagai draf.", trash: "Artikel dipindahkan ke tempat sampah.", restore: "Artikel dipulihkan dari tempat sampah." }[action];
      setNotice({ tone: "success", text });
      router.refresh();
    });

  const deleteForever = () =>
    run("delete", async () => {
      if (!latest.current.articleId || !window.confirm("Hapus artikel ini secara permanen? Tindakan ini tidak bisa dibatalkan.")) return;
      const result = await deleteArticleAction(latest.current.articleId);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      clearDraft(key);
      latest.current.dirty = false;
      router.push("/admin/artikel?status=sampah&pesan=dihapus");
    });

  async function loadRevision(revisionId: string) {
    if (!articleId) return;
    const revision = await revisionSnapshotAction(articleId, revisionId);
    if (!revision) return;
    if (!window.confirm(`Muat isi revisi ${formatWib(new Date(revision.createdAt))} ke editor? Perubahan baru disimpan setelah Anda menyimpan.`)) return;
    setFields((f) => snapshotToFields(revision.snapshot, f));
    setSlugTouched(true);
    setDirty(true);
  }

  function resolveConflict(keepMine: boolean) {
    if (!conflict) return;
    if (!keepMine) {
      writeDraft(key, latest.current.fields, latest.current.version);
      latest.current.dirty = false;
      window.location.reload();
      return;
    }
    setVersion(conflict.version);
    latest.current.version = conflict.version;
    setConflict(null);
    void persist("manual");
  }

  const focusField = (field: SeoField) => {
    const id = { title: "judul", standfirst: "lead", body: "isi", slug: "slug", seoTitle: "seo-title", seoDescription: "seo-description", canonicalUrl: "canonical", hero: "gambar-utama" }[field];
    if (field === "hero") setHeroSectionSignal((n) => n + 1);
    if (field === "seoTitle" || field === "seoDescription" || field === "canonicalUrl") {
      setSeoSectionSignal((n) => n + 1);
    }
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById(id)?.focus();
    }, 40);
  };

  const hero = fields.heroMediaId ? media[fields.heroMediaId] : undefined;
  const og = fields.ogMediaId ? media[fields.ogMediaId] : undefined;
  const bodyWordCount = useMemo(() => analyzeBody(fields.body).wordCount, [fields.body]);
  const readingMinutes = estimateReadingMinutes(bodyWordCount);
  const seoPreview = useMemo(
    () =>
      buildSeoPreview({
        title: fields.title,
        slug: fields.slug,
        standfirst: fields.standfirst,
        seoTitle: fields.seoTitle,
        seoDescription: fields.seoDescription,
        canonicalUrl: fields.canonicalUrl,
        heroMedia: hero ?? null,
        ogMedia: og ?? null,
      }),
    [fields.title, fields.slug, fields.standfirst, fields.seoTitle, fields.seoDescription, fields.canonicalUrl, hero, og],
  );
  const selectedAuthor = props.options.authors.find((a) => a.id === fields.authorId)?.name ?? "Belum dipilih";
  const selectedKanal = props.options.kanal.find((k) => k.id === fields.kanalId)?.name ?? "Belum dipilih";
  const seoInput = useMemo(
    () => ({
      title: fields.title,
      standfirst: fields.standfirst,
      slug: fields.slug,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      canonicalUrl: fields.canonicalUrl,
      body: fields.body,
      hero: hero ? { alt: hero.alt, caption: hero.caption } : null,
    }),
    [fields, hero],
  );

  const disabled = trashed || Boolean(busy);
  const err = (k: string) => (errors[k] ? <p className="admin-error" role="alert">{errors[k]}</p> : null);

  return (
    <div className="pb-24">
      {/* Action bar */}
      <div className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-[3.75rem] max-w-6xl items-center gap-2 px-4 md:px-6">
          <Link href={props.backHref ?? "/admin/artikel"} className="text-sm font-semibold text-muted hover:text-ink">← Artikel</Link>
          <StateBadge state={state === "baru" ? null : state} />
          <SaveIndicator save={save} />
          <div className="ml-auto flex items-center gap-2">
            {articleId && (
              <a href={`/pratinjau/${articleId}`} target="_blank" rel="noopener" className="admin-button-quiet min-h-10 px-3" onClick={() => void ensureSaved()}>
                <Eye className="size-4" aria-hidden /> <span className="hidden sm:inline">Pratinjau</span>
              </a>
            )}
            {!live && !trashed && (
              <button type="button" className="admin-button-quiet min-h-10 px-3" disabled={disabled} onClick={() => run("save", async () => void (await persist("manual")))}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} <span className="hidden sm:inline">Simpan draf</span>
              </button>
            )}
            {live && (
              <button type="button" className="admin-button min-h-10 px-3" disabled={disabled} onClick={() => run("update", async () => void (await persist("manual")))}>
                {busy === "update" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Perbarui
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        {restoreOffer && (
          <div className="mb-4">
            <Notice tone="info">
              Ada perubahan yang belum tersimpan di perangkat ini ({formatWib(new Date(restoreOffer.savedAt))}).{" "}
              <button type="button" className="font-semibold text-brand underline" onClick={() => { setFields(restoreOffer.fields); setSlugTouched(true); setDirty(true); setRestoreOffer(null); }}>Pulihkan</button>{" · "}
              <button type="button" className="font-semibold underline" onClick={() => { clearDraft(key); setRestoreOffer(null); }}>Buang</button>
            </Notice>
          </div>
        )}
        {conflict && (
          <div className="mb-4">
            <Notice tone="error">
              Artikel ini sudah disimpan dari tab atau perangkat lain (versi {conflict.version}, {formatWib(new Date(conflict.updatedAt))}). Penyimpanan otomatis dihentikan; perubahan Anda aman di perangkat ini.{" "}
              <button type="button" className="font-semibold underline" onClick={() => resolveConflict(false)}>Muat versi terbaru</button>{" · "}
              <button type="button" className="font-semibold underline" onClick={() => resolveConflict(true)}>Timpa dengan versi saya</button>
            </Notice>
          </div>
        )}
        {trashed && (
          <div className="mb-4">
            <Notice tone="error">Artikel ini ada di tempat sampah dan tidak tampil di situs. Pulihkan untuk menyunting lagi.</Notice>
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ── Main column ── */}
          <div className="min-w-0 space-y-5">
            <div>
              <label htmlFor="judul" className="sr-only">Judul</label>
              <textarea id="judul" value={fields.title} onChange={(e) => update({ title: e.target.value.replace(/\n/g, " ") })} placeholder="Judul artikel" rows={2} maxLength={200} disabled={trashed} className="font-display w-full resize-none border-0 bg-transparent text-[1.75rem] leading-tight font-semibold outline-none placeholder:text-muted/60 md:text-[2.125rem]" />
              {err("title")}
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted">
                <label htmlFor="slug">{SITE_PUBLIC_HOST}/artikel/</label>
                <input id="slug" value={fields.slug} onChange={(e) => { setSlugTouched(true); update({ slug: e.target.value.toLowerCase() }); }} disabled={trashed} className="min-w-0 flex-1 border-b border-dashed border-line bg-transparent font-mono text-sm text-ink outline-none focus:border-brand" aria-describedby="slug-help" />
              </div>
              <p id="slug-help" className="admin-help">{everPublished ? "Mengubah slug artikel yang pernah terbit: alamat lama otomatis dialihkan (301)." : "Mengikuti judul sampai Anda mengubahnya sendiri."}</p>
              {!trashed && seoPreview.slugDivergesFromTitle && (slugTouched || everPublished) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-line bg-warm/60 px-2.5 py-1.5 text-xs text-muted">
                  <span>
                    {everPublished
                      ? "Slug dipertahankan dari URL terbit agar tautan tidak berubah."
                      : "Judul berbeda dari slug saat ini."}
                  </span>
                  <button
                    type="button"
                    onClick={() => update({ slug: seoPreview.suggestedSlug })}
                    className="font-semibold text-brand hover:underline"
                  >
                    Sesuaikan slug ({seoPreview.suggestedSlug})
                  </button>
                </p>
              )}
              {err("slug")}
            </div>

            <div>
              <label htmlFor="lead" className="admin-label">Lead (standfirst)</label>
              <textarea id="lead" value={fields.standfirst} onChange={(e) => update({ standfirst: e.target.value })} rows={3} maxLength={600} disabled={trashed} className="admin-input mt-1.5 py-2" placeholder="Satu-dua kalimat inti tulisan" />
              <WordCounter text={fields.standfirst} recommendedMin={12} recommendedContext="untuk lead artikel" />
              {err("standfirst")}
            </div>

            <div id="isi" tabIndex={-1}>
              <span className="admin-label mb-1.5">Isi artikel</span>
              <RichTextEditor content={fields.body} onChange={(body) => update({ body })} editable={!trashed} />
              <WordCounter
                wordCount={bodyWordCount}
                recommendedMin={300}
                recommendedContext="untuk artikel berita"
                extra={readingMinutes > 0 ? `Estimasi ${readingMinutes} menit baca` : undefined}
              />
              {err("body")}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <aside className="min-w-0 space-y-4">
            <section className="admin-card space-y-3" aria-labelledby="publikasi">
              <h2 id="publikasi" className="font-display text-lg font-semibold">Publikasi</h2>
              <p className="text-sm text-muted">
                {state === "baru" && "Belum disimpan."}
                {state === "draf" && "Draf — tidak tampil di situs."}
                {state === "terjadwal" && `Terjadwal: tampil ${formatWib(publishedAt ? new Date(publishedAt) : null)}.`}
                {state === "terbit" && `Terbit ${formatWib(publishedAt ? new Date(publishedAt) : null)}.`}
                {state === "arsip" && "Diarsipkan — tidak tampil di situs."}
                {state === "sampah" && "Di tempat sampah."}
              </p>
              {!trashed && (
                <>
                  {(state === "baru" || state === "draf" || state === "arsip") && (
                    <button type="button" className="admin-button w-full" disabled={disabled} onClick={() => publish(false)}>
                      {busy === "publish" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Terbitkan sekarang
                    </button>
                  )}
                  <div>
                    <label htmlFor="jadwal" className="admin-label">Jadwalkan (WIB)</label>
                    <div className="mt-1.5 flex gap-2">
                      <input id="jadwal" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="admin-input min-w-0 flex-1" />
                      <button type="button" className="admin-button-quiet shrink-0 px-3" disabled={disabled || !scheduleAt} onClick={() => publish(true)} aria-label={state === "terjadwal" ? "Ubah jadwal" : "Jadwalkan"}>
                        <CalendarClock className="size-4" aria-hidden /> {state === "terjadwal" ? "Ubah" : "Jadwalkan"}
                      </button>
                    </div>
                    {err("publishedAt")}
                  </div>
                  {live && (
                    <button type="button" className="admin-button-quiet w-full" disabled={disabled} onClick={() => changeState("unpublish", "Tarik artikel dari publikasi? Artikel kembali menjadi draf dan tidak tampil di situs.")}>
                      <RotateCcw className="size-4" aria-hidden /> Tarik dari publikasi
                    </button>
                  )}
                  {articleId && state !== "arsip" && (
                    <button type="button" className="admin-button-quiet w-full" disabled={disabled} onClick={() => changeState("archive", "Arsipkan artikel? Artikel tidak tampil di situs.")}>
                      <Archive className="size-4" aria-hidden /> Arsipkan
                    </button>
                  )}
                  {state === "arsip" && (
                    <button type="button" className="admin-button-quiet w-full" disabled={disabled} onClick={() => changeState("unarchive")}>
                      <ArchiveRestore className="size-4" aria-hidden /> Kembalikan dari arsip
                    </button>
                  )}
                  {articleId && (
                    <button type="button" className="w-full text-sm font-semibold text-brand hover:underline" disabled={disabled} onClick={() => changeState("trash", "Pindahkan artikel ke tempat sampah? Artikel tidak tampil di situs dan bisa dipulihkan.")}>
                      <Trash2 className="mr-1 inline size-4" aria-hidden /> Pindahkan ke tempat sampah
                    </button>
                  )}
                </>
              )}
              {trashed && (
                <>
                  <button type="button" className="admin-button w-full" disabled={Boolean(busy)} onClick={() => changeState("restore")}>
                    <RotateCcw className="size-4" aria-hidden /> Pulihkan
                  </button>
                  <button type="button" className="w-full text-sm font-semibold text-brand hover:underline" disabled={Boolean(busy)} onClick={deleteForever}>
                    Hapus permanen
                  </button>
                </>
              )}
            </section>

            <SettingsSection
              title="Pengaturan"
              summary={`${TEMPLATES.find((t) => t.value === fields.template)?.label ?? "Berita"} · ${selectedKanal} · ${selectedAuthor}`}
              openOnDesktop
            >
              <fieldset disabled={trashed}>
                <legend className="admin-label">Template</legend>
                <div className="mt-1.5 grid gap-1.5">
                  {TEMPLATES.map((t) => (
                    <label key={t.value} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${fields.template === t.value ? "border-brand bg-blush/50" : "border-line"}`}>
                      <input type="radio" name="template" value={t.value} checked={fields.template === t.value} onChange={() => update({ template: t.value })} className="mt-1" />
                      <span><span className="font-semibold">{t.label}</span> <span className="text-muted">— {t.help}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Select id="penulis" label="Penulis" value={fields.authorId} onChange={(authorId) => update({ authorId })} options={props.options.authors} disabled={trashed} required />
              {err("authorId")}
              <Select id="kanal" label="Kanal" value={fields.kanalId} onChange={(kanalId) => update({ kanalId })} options={props.options.kanal} disabled={trashed} />
              {err("kanalId")}
              <Select id="rubrik" label="Rubrik (opsional)" value={fields.rubrikId} onChange={(rubrikId) => update({ rubrikId })} options={props.options.rubrik} disabled={trashed} />
              {err("rubrikId")}
              <TagsInput tags={fields.tags} onChange={(tags) => update({ tags })} disabled={trashed} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fields.hideFromHomepage} onChange={(e) => update({ hideFromHomepage: e.target.checked })} disabled={trashed} />
                Jangan tampilkan di beranda
              </label>
            </SettingsSection>

            <SettingsSection
              title="Gambar utama"
              summary={hero ? hero.alt || hero.src : "Belum dipilih"}
              openOnDesktop
              openSignal={heroSectionSignal}
            >
              <HeroPanel heroId={fields.heroMediaId} onChange={(heroMediaId) => update({ heroMediaId })} disabled={trashed} error={errors.heroMediaId} />
            </SettingsSection>

            <SettingsSection
              title="SEO"
              summary={fields.seoTitle ? "Judul SEO khusus terpasang" : "Mengikuti judul & lead artikel"}
              openOnDesktop
              openSignal={seoSectionSignal}
            >
              <Counted id="seo-title" label="SEO title" value={fields.seoTitle} onChange={(seoTitle) => update({ seoTitle })} max={120} ideal={70} placeholder={fields.title} disabled={trashed} />
              {err("seoTitle")}
              <Counted id="seo-description" label="Meta description" value={fields.seoDescription} onChange={(seoDescription) => update({ seoDescription })} max={300} ideal={160} placeholder={fields.standfirst} multiline disabled={trashed} />
              {err("seoDescription")}
              <div>
                <label htmlFor="canonical" className="admin-label">Canonical URL (opsional)</label>
                <input id="canonical" value={fields.canonicalUrl} onChange={(e) => update({ canonicalUrl: e.target.value })} placeholder="https://…" maxLength={500} disabled={trashed} className="admin-input mt-1.5" />
                <p className="admin-help">Isi hanya bila tulisan ini pertama terbit di situs lain.</p>
                {err("canonicalUrl")}
              </div>
              <OgImageField ogId={fields.ogMediaId} onChange={(ogMediaId) => update({ ogMediaId })} disabled={trashed} />
              <div className="rounded-md border border-line p-3">
                <p className="text-xs text-muted">Pratinjau hasil pencarian</p>
                <p className="mt-1 truncate text-[1.05rem] text-[#1a0dab]">{seoPreview.displayTitle}</p>
                <p className="truncate text-xs text-emerald-800">{SITE_PUBLIC_HOST}{seoPreview.articlePath}</p>
                <p className="line-clamp-2 text-sm text-muted">{seoPreview.displayDescription}</p>
              </div>
              <div className="overflow-hidden rounded-md border border-line bg-warm/40">
                <p className="border-b border-line px-3 py-1.5 text-xs text-muted">Pratinjau berbagi media sosial (Open Graph)</p>
                {seoPreview.ogImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={seoPreview.ogImage.src} alt={seoPreview.ogImage.alt || seoPreview.displayTitle} className="aspect-[1.91/1] w-full bg-warm object-cover" />
                ) : (
                  <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-warm text-xs text-muted">
                    Belum ada gambar Open Graph / utama
                  </div>
                )}
                <div className="space-y-0.5 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{SITE_PUBLIC_HOST}</p>
                  <p className="line-clamp-1 text-sm font-semibold text-ink">{seoPreview.displayTitle}</p>
                  <p className="line-clamp-2 text-xs text-muted">{seoPreview.displayDescription}</p>
                </div>
              </div>
              <dl className="space-y-1 rounded-md bg-warm/60 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Canonical</dt>
                  <dd className="min-w-0 truncate font-mono text-[11px] text-ink" title={seoPreview.canonicalDisplay}>
                    {seoPreview.canonicalDisplay}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Schema NewsArticle</dt>
                  <dd className="truncate font-semibold text-ink">{selectedKanal} &middot; {selectedAuthor}</dd>
                </div>
              </dl>
              <SeoPanel input={seoInput} onField={focusField} />
            </SettingsSection>

            {props.revisions.length > 0 && (
              <SettingsSection title="Revisi" summary={`${props.revisions.length} riwayat versi tersimpan`}>
                <ul className="divide-y divide-line text-sm">
                  {props.revisions.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                      <span>{REASON[r.reason] ?? r.reason} · v{r.version}<br /><span className="text-xs text-muted">{formatWib(new Date(r.createdAt))}</span></span>
                      <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => void loadRevision(r.id)} disabled={trashed}>Muat ke editor</button>
                    </li>
                  ))}
                </ul>
              </SettingsSection>
            )}

            {props.statusHistory && props.statusHistory.length > 0 && (
              <SettingsSection title="Riwayat status" summary={`${props.statusHistory.length} transisi status`}>
                <ul className="divide-y divide-line text-xs">
                  {props.statusHistory.map((item) => (
                    <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                      <p className="font-semibold text-ink">
                        {item.fromStatus
                          ? `${articleStatusLabel(item.fromStatus)} → ${articleStatusLabel(item.toStatus)}`
                          : articleStatusLabel(item.toStatus)}
                      </p>
                      <p className="mt-0.5 text-muted">{formatWib(new Date(item.changedAt))}</p>
                    </li>
                  ))}
                </ul>
              </SettingsSection>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ save }: { save: { status: SaveStatus; message?: string; at?: string } }) {
  const map: Record<SaveStatus, { text: string; icon: React.ReactNode; className: string }> = {
    idle: { text: "", icon: null, className: "" },
    pending: { text: save.message ?? "Perubahan belum disimpan", icon: null, className: "text-muted" },
    saving: { text: "Menyimpan…", icon: <Loader2 className="size-4 animate-spin" aria-hidden />, className: "text-muted" },
    saved: { text: `Tersimpan${save.at ? ` ${formatWib(new Date(save.at)).replace(/^.*, /, "")}` : ""}`, icon: <CircleCheck className="size-4" aria-hidden />, className: "text-emerald-700" },
    offline: { text: "Offline — tersimpan di perangkat ini", icon: <CloudOff className="size-4" aria-hidden />, className: "text-amber-700" },
    error: { text: save.message ?? "Gagal menyimpan", icon: <CircleAlert className="size-4" aria-hidden />, className: "text-brand-deep" },
    conflict: { text: "Konflik: ada versi lebih baru", icon: <CircleAlert className="size-4" aria-hidden />, className: "text-brand-deep" },
    live: { text: save.message ?? "Perubahan belum tayang", icon: <CircleAlert className="size-4" aria-hidden />, className: "text-amber-700" },
  };
  const item = map[save.status];
  if (!item.text) return null;
  return (
    <span role="status" aria-live="polite" data-save-status={save.status} className={`flex min-w-0 max-w-[45vw] items-center gap-1 truncate text-xs sm:max-w-none sm:text-sm ${item.className}`}>
      {item.icon}
      <span className="truncate">{item.text}</span>
    </span>
  );
}

function Select({ id, label, value, onChange, options, disabled, required }: { id: string; label: string; value: string; onChange: (v: string) => void; options: Option[]; disabled?: boolean; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="admin-label">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="admin-input mt-1.5">
        {!required && <option value="">— Tidak ada —</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}

function Counted({ id, label, value, onChange, max, ideal, placeholder, multiline, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; max: number; ideal: number; placeholder?: string; multiline?: boolean; disabled?: boolean }) {
  const over = value.length > ideal;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="admin-label">{label}</label>
        <span className={`text-xs ${over ? "text-amber-700" : "text-muted"}`}>{value.length}/{ideal}</span>
      </div>
      {multiline ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={3} placeholder={placeholder} disabled={disabled} className="admin-input mt-1.5 py-2" />
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} disabled={disabled} className="admin-input mt-1.5" />
      )}
    </div>
  );
}

function TagsInput({ tags, onChange, disabled }: { tags: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().replace(/,$/, "");
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()) && tags.length < 12) onChange([...tags, tag.slice(0, 40)]);
    setDraft("");
  };
  return (
    <div>
      <label htmlFor="tag" className="admin-label">Tag</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="admin-badge bg-warm">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`} disabled={disabled}><X className="size-3" aria-hidden /></button>
          </span>
        ))}
      </div>
      <input id="tag" value={draft} onChange={(e) => (e.target.value.endsWith(",") ? (setDraft(e.target.value), setTimeout(add, 0)) : setDraft(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} placeholder="Ketik lalu Enter" maxLength={41} disabled={disabled} className="admin-input mt-1.5" />
    </div>
  );
}

function HeroPanel({ heroId, onChange, disabled, error }: { heroId: string; onChange: (id: string) => void; disabled?: boolean; error?: string }) {
  const { media, pick, remember } = useMedia();
  const hero = heroId ? media[heroId] : undefined;
  const [meta, setMeta] = useState({ alt: hero?.alt ?? "", caption: hero?.caption ?? "", credit: hero?.credit ?? "" });
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  useEffect(() => {
    setMeta({ alt: hero?.alt ?? "", caption: hero?.caption ?? "", credit: hero?.credit ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroId]);

  async function choose() {
    const chosen = await pick({ title: "Pilih gambar utama" });
    if (chosen) onChange(chosen[0].id);
  }

  async function saveMeta() {
    if (!hero || (meta.alt === hero.alt && meta.caption === hero.caption && meta.credit === hero.credit)) return;
    setState("saving");
    try {
      const result = await updateMediaMetaAction(hero.id, meta);
      if (result.ok) {
        remember([result.media]);
        setState("saved");
      } else setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="space-y-3">
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.src} alt={hero.alt} className="aspect-video w-full rounded-md bg-warm object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-line bg-warm text-sm text-muted">
          <ImageIcon className="mr-1.5 size-4" aria-hidden /> Belum dipilih
        </div>
      )}
      <button id="gambar-utama" type="button" className="admin-button-quiet w-full" onClick={choose} disabled={disabled}>
        {hero ? "Ganti gambar utama" : "Pilih gambar utama"}
      </button>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {hero && (
        <fieldset className="space-y-2" disabled={disabled} onBlur={saveMeta}>
          <label className="block text-xs font-semibold">Teks alternatif (alt)
            <input value={meta.alt} onChange={(e) => setMeta({ ...meta, alt: e.target.value })} maxLength={500} className="admin-input mt-1 text-sm" />
          </label>
          <label className="block text-xs font-semibold">Caption
            <input value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} maxLength={500} className="admin-input mt-1 text-sm" />
          </label>
          <label className="block text-xs font-semibold">Kredit foto
            <input value={meta.credit} onChange={(e) => setMeta({ ...meta, credit: e.target.value })} maxLength={200} className="admin-input mt-1 text-sm" />
          </label>
          <p className="admin-help" aria-live="polite">
            {state === "saving" ? "Menyimpan keterangan gambar…" : state === "saved" ? "Keterangan gambar tersimpan (berlaku di semua artikel yang memakai gambar ini)." : state === "error" ? "Gagal menyimpan keterangan gambar." : "Keterangan tersimpan ke gambar saat Anda keluar dari kolom."}
          </p>
        </fieldset>
      )}
    </div>
  );
}

function OgImageField({ ogId, onChange, disabled }: { ogId: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { media, pick } = useMedia();
  const og = ogId ? media[ogId] : undefined;
  return (
    <div>
      <span className="admin-label">Gambar Open Graph (opsional)</span>
      <div className="mt-1.5 flex items-center gap-2">
        {og ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={og.src} alt={og.alt} className="h-12 w-20 rounded bg-warm object-cover" />
        ) : (
          <span className="text-xs text-muted">Memakai gambar utama.</span>
        )}
        <button type="button" className="ml-auto text-xs font-semibold text-brand hover:underline" disabled={disabled} onClick={async () => { const c = await pick({ title: "Gambar untuk dibagikan (Open Graph)" }); if (c) onChange(c[0].id); }}>
          {og ? "Ganti" : "Pilih"}
        </button>
        {og && <button type="button" className="text-xs text-muted hover:underline" disabled={disabled} onClick={() => onChange("")}>Hapus</button>}
      </div>
    </div>
  );
}
