"use client";

// Block nodes of the SUMENEP article editor. Each one is an atom: its fields
// are edited in the small form of its node view, never typed into the
// document. Node names and attributes are shared with the server sanitiser
// (src/server/articles/sanitize.ts) and the block converter (blocks.ts).
//
// ArticleImage is ported from Busacare components/admin/editor/
// article-image-node.tsx (atom node + React node view with alt/caption,
// replace and delete), changed to reference media by id and to choose images
// through the picker. Gallery, infographic, pull quote, video and map follow
// the same pattern; they are new because Busacare has no such blocks.

import { mergeAttributes, Node, type CommandProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ArrowLeft, ArrowRight, ImageIcon, MapPin, Plus, Quote, RefreshCw, Trash2, Video } from "lucide-react";

import { NODE } from "@/lib/article-doc";
import { parseVideoUrl } from "@/lib/article-utils";

import { parseCoordinates } from "./coordinates";
import { useMedia } from "./MediaContext";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    articleBlocks: {
      insertArticleBlock: (type: string, attrs: Record<string, unknown>) => ReturnType;
    };
  }
}

function Frame({ selected, label, icon, children, onDelete }: { selected: boolean; label: string; icon: React.ReactNode; children: React.ReactNode; onDelete: () => void }) {
  return (
    <NodeViewWrapper contentEditable={false} data-block={label} className={`my-5 rounded-lg border bg-paper ${selected ? "border-brand ring-2 ring-brand/20" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase" data-drag-handle>
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <button type="button" onClick={onDelete} className="flex items-center gap-1 rounded px-2 py-1 text-brand hover:bg-blush" aria-label={`Hapus ${label.toLowerCase()}`}>
          <Trash2 className="size-3.5" aria-hidden /> Hapus
        </button>
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </NodeViewWrapper>
  );
}

function Field({ label, value, onChange, max = 500, placeholder, multiline, warn }: { label: string; value: string; onChange: (v: string) => void; max?: number; placeholder?: string; multiline?: boolean; warn?: boolean }) {
  const cls = `admin-input mt-1 text-sm ${warn ? "border-amber-500 bg-amber-50" : ""}`;
  return (
    <label className="block text-xs font-semibold text-ink">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={2} placeholder={placeholder} className={`${cls} py-2`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} className={cls} />
      )}
    </label>
  );
}

function Thumb({ mediaId, alt }: { mediaId: string; alt: string }) {
  const { media } = useMedia();
  const m = media[mediaId];
  if (!m) return <div className="flex h-36 items-center justify-center rounded bg-warm text-xs text-muted">Gambar tidak ditemukan</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.src} alt={alt || m.alt} className="max-h-80 w-full rounded bg-warm object-contain" loading="lazy" />;
}

// ─── Gambar ──────────────────────────────────────────────────────────────────

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pick, media } = useMedia();
  const a = node.attrs as { mediaId: string | null; alt: string; caption: string; size: "column" | "wide" };
  async function replace() {
    const chosen = await pick({ title: "Ganti gambar" });
    if (chosen) updateAttributes({ mediaId: chosen[0].id, alt: chosen[0].alt, caption: chosen[0].caption });
  }
  return (
    <Frame selected={selected} label="Gambar" icon={<ImageIcon className="size-3.5" aria-hidden />} onDelete={deleteNode}>
      {a.mediaId ? <Thumb mediaId={a.mediaId} alt={a.alt} /> : <p className="text-sm text-muted">Belum ada gambar.</p>}
      <Field label="Teks alternatif (alt)" value={a.alt} onChange={(alt) => updateAttributes({ alt })} warn={!a.alt.trim()} placeholder="Jelaskan isi gambar" />
      <Field label="Caption" value={a.caption} onChange={(caption) => updateAttributes({ caption })} multiline placeholder={a.mediaId ? media[a.mediaId]?.caption : ""} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Lebar:</span>
        {(["column", "wide"] as const).map((size) => (
          <button key={size} type="button" onClick={() => updateAttributes({ size })} aria-pressed={a.size === size} className={`rounded border px-2 py-1 ${a.size === size ? "border-brand bg-blush text-brand-deep" : "border-line"}`}>
            {size === "column" ? "Selebar teks" : "Lebar"}
          </button>
        ))}
        <button type="button" onClick={replace} className="ml-auto flex items-center gap-1 rounded border border-line px-2 py-1">
          <RefreshCw className="size-3.5" aria-hidden /> Ganti
        </button>
      </div>
    </Frame>
  );
}

// ─── Galeri ──────────────────────────────────────────────────────────────────

type GalleryItem = { mediaId: string; alt: string; caption: string };

function GalleryView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pick } = useMedia();
  const title = node.attrs.title as string;
  const items = (node.attrs.items as GalleryItem[]) ?? [];
  const set = (next: GalleryItem[]) => updateAttributes({ items: next });
  async function add() {
    const chosen = await pick({ title: "Tambah foto ke galeri", multiple: true });
    if (chosen) set([...items, ...chosen.map((m) => ({ mediaId: m.id, alt: m.alt, caption: m.caption }))]);
  }
  function move(i: number, d: -1 | 1) {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  }
  return (
    <Frame selected={selected} label="Galeri" icon={<ImageIcon className="size-3.5" aria-hidden />} onDelete={deleteNode}>
      <Field label="Judul galeri (opsional)" value={title} onChange={(v) => updateAttributes({ title: v })} max={200} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item, i) => (
          <li key={`${item.mediaId}-${i}`} className="space-y-1.5 rounded border border-line p-2">
            <Thumb mediaId={item.mediaId} alt={item.alt} />
            <Field label="Alt" value={item.alt} onChange={(alt) => set(items.map((x, k) => (k === i ? { ...x, alt } : x)))} warn={!item.alt.trim()} />
            <Field label="Caption" value={item.caption} onChange={(caption) => set(items.map((x, k) => (k === i ? { ...x, caption } : x)))} />
            <div className="flex justify-between text-xs">
              <span className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} aria-label="Geser ke kiri" className="rounded border border-line p-1"><ArrowLeft className="size-3.5" aria-hidden /></button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Geser ke kanan" className="rounded border border-line p-1"><ArrowRight className="size-3.5" aria-hidden /></button>
              </span>
              <button type="button" onClick={() => set(items.filter((_, k) => k !== i))} className="text-brand">Hapus</button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs font-semibold">
        <Plus className="size-3.5" aria-hidden /> Tambah foto
      </button>
    </Frame>
  );
}

// ─── Infografik ──────────────────────────────────────────────────────────────

function InfographicView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pick } = useMedia();
  const a = node.attrs as { mediaId: string | null; title: string; source: string; dataDate: string; note: string };
  async function replace() {
    const chosen = await pick({ title: "Pilih gambar infografik" });
    if (chosen) updateAttributes({ mediaId: chosen[0].id });
  }
  return (
    <Frame selected={selected} label="Infografik" icon={<ImageIcon className="size-3.5" aria-hidden />} onDelete={deleteNode}>
      {a.mediaId ? <Thumb mediaId={a.mediaId} alt={a.title} /> : <p className="text-sm text-muted">Belum ada gambar.</p>}
      <Field label="Judul infografik" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} warn={!a.title.trim()} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Sumber data" value={a.source} onChange={(source) => updateAttributes({ source })} />
        <Field label="Tanggal data" value={a.dataDate} onChange={(dataDate) => updateAttributes({ dataDate })} max={100} placeholder="mis. Oktober 2026" />
      </div>
      <Field label="Catatan" value={a.note} onChange={(note) => updateAttributes({ note })} multiline />
      <button type="button" onClick={replace} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs"><RefreshCw className="size-3.5" aria-hidden /> Ganti gambar</button>
    </Frame>
  );
}

// ─── Kutipan menonjol ────────────────────────────────────────────────────────

function PullQuoteView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  return (
    <Frame selected={selected} label="Kutipan menonjol" icon={<Quote className="size-3.5" aria-hidden />} onDelete={deleteNode}>
      <Field label="Kutipan" value={node.attrs.text as string} onChange={(text) => updateAttributes({ text })} max={600} multiline warn={!(node.attrs.text as string).trim()} />
      <Field label="Narasumber (opsional)" value={node.attrs.attribution as string} onChange={(attribution) => updateAttributes({ attribution })} max={200} />
    </Frame>
  );
}

// ─── Video (YouTube / Vimeo) ─────────────────────────────────────────────────

function VideoView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const a = node.attrs as { provider: string; videoId: string; title: string; caption: string; url: string };
  const parsed = a.videoId ? { provider: a.provider, videoId: a.videoId } : null;
  return (
    <Frame selected={selected} label="Video" icon={<Video className="size-3.5" aria-hidden />} onDelete={deleteNode}>
      <Field
        label="Tautan video YouTube atau Vimeo"
        value={a.url || (a.videoId ? (a.provider === "vimeo" ? `https://vimeo.com/${a.videoId}` : `https://youtu.be/${a.videoId}`) : "")}
        max={2000}
        warn={!parsed}
        onChange={(url) => {
          const p = parseVideoUrl(url);
          updateAttributes({ url, ...(p ? { provider: p.provider, videoId: p.videoId } : { videoId: "" }) });
        }}
        placeholder="https://www.youtube.com/watch?v=…"
      />
      <p className="text-xs text-muted">{parsed ? `${parsed.provider === "vimeo" ? "Vimeo" : "YouTube"} · ${parsed.videoId} — diputar setelah pembaca menekan tombol putar.` : "Hanya tautan YouTube atau Vimeo yang diterima."}</p>
      <Field label="Judul video" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} />
      <Field label="Caption" value={a.caption} onChange={(caption) => updateAttributes({ caption })} multiline />
    </Frame>
  );
}

// ─── Peta (OpenStreetMap) ────────────────────────────────────────────────────

function MapView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const a = node.attrs as { title: string; latitude: number | null; longitude: number | null; zoom: number; marker: boolean; caption: string; input: string };
  const ok = a.latitude !== null && a.longitude !== null;
  return (
    <Frame selected={selected} label="Peta" icon={<MapPin className="size-3.5" aria-hidden />} onDelete={deleteNode}>
      <Field
        label="Koordinat atau tautan peta"
        value={a.input || (ok ? `${a.latitude}, ${a.longitude}` : "")}
        max={2000}
        warn={!ok}
        onChange={(input) => {
          const c = parseCoordinates(input);
          updateAttributes({ input, ...(c ? { latitude: c.latitude, longitude: c.longitude, ...(c.zoom ? { zoom: c.zoom } : {}) } : { latitude: null, longitude: null }) });
        }}
        placeholder="-7.0123, 113.8650 atau tautan OpenStreetMap / Google Maps"
      />
      <p className="text-xs text-muted">{ok ? `Titik ${a.latitude?.toFixed(5)}, ${a.longitude?.toFixed(5)} · zoom ${a.zoom}. Ditampilkan dengan OpenStreetMap.` : "Masukkan koordinat yang valid."}</p>
      <div className="grid gap-2.5 sm:grid-cols-[1fr_8rem]">
        <Field label="Judul peta (opsional)" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} />
        <label className="block text-xs font-semibold">
          Zoom (3–18)
          <input type="number" min={3} max={18} value={a.zoom} onChange={(e) => updateAttributes({ zoom: Math.min(18, Math.max(3, Number(e.target.value) || 13)) })} className="admin-input mt-1 text-sm" />
        </label>
      </div>
      <Field label="Caption" value={a.caption} onChange={(caption) => updateAttributes({ caption })} multiline />
    </Frame>
  );
}

// ─── Node definitions ────────────────────────────────────────────────────────

function atom(name: string, defaults: Record<string, unknown>, view: (props: NodeViewProps) => React.JSX.Element) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value }]));
    },
    parseHTML() {
      return [{ tag: `div[data-node="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": name })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(view);
    },
  });
}

export const ArticleImageNode = atom(NODE.image, { mediaId: null, alt: "", caption: "", size: "column" }, ImageView).extend({
  addCommands() {
    return {
      // The block plus an empty paragraph after it: the cursor lands below the
      // block (typing goes on there) instead of selecting the block itself.
      insertArticleBlock:
        (type: string, attrs: Record<string, unknown>) =>
        ({ commands }: CommandProps) =>
          commands.insertContent([{ type, attrs }, { type: "paragraph" }]),
    };
  },
});
export const GalleryNode = atom(NODE.gallery, { title: "", items: [] }, GalleryView);
export const InfographicNode = atom(NODE.infographic, { mediaId: null, title: "", source: "", dataDate: "", note: "" }, InfographicView);
export const PullQuoteNode = atom(NODE.pullQuote, { text: "", attribution: "" }, PullQuoteView);
export const VideoNode = atom(NODE.video, { provider: "youtube", videoId: "", title: "", caption: "", url: "" }, VideoView);
export const MapNode = atom(NODE.map, { title: "", latitude: null, longitude: null, zoom: 13, marker: true, caption: "", input: "" }, MapView);
