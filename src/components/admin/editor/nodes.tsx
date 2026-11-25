"use client";

// Core article media/embed/quote block nodes for the SUMENEP editorial block editor.
// New editorial box nodes (LargeStatement, FactBox, Callout) live in ./editorial-blocks.tsx.

import { mergeAttributes, Node, type CommandProps } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ArrowLeft, ArrowRight, ImageIcon, MapPin, Plus, Quote, RefreshCw, Video } from "lucide-react";

import { NODE } from "@/lib/article-doc";
import { parseVideoUrl } from "@/lib/article-utils";
import { IMAGE_RATIOS, type ImageAlign, type ImageLayout, type ImageRatio, type ImageSize, type PullQuoteVariant } from "@/lib/editorial-tokens";

import { BlockField, BlockFrame, BlockThumb, ToneOptionRow, useBlockMove } from "./BlockFrame";
import { parseCoordinates } from "./coordinates";
import { useMedia } from "./MediaContext";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    articleBlocks: {
      insertArticleBlock: (type: string, attrs: Record<string, unknown>) => ReturnType;
    };
  }
}

// ─── Gambar (8 ragam tata letak editorial) ───────────────────────────────────

type ImageAttrs = {
  mediaId: string | null;
  alt: string;
  caption: string;
  credit: string;
  size: ImageSize;
  align: ImageAlign;
  ratio: ImageRatio;
  layout: ImageLayout;
  pairMediaId: string | null;
  pairAlt: string;
  pairCaption: string;
  pairCredit: string;
};

type SinglePlacementId = "column" | "wide" | "full" | "left" | "right";

const PLACEMENT_OPTIONS: { id: SinglePlacementId; label: string }[] = [
  { id: "column", label: "Selebar teks" },
  { id: "wide", label: "Besar (Large)" },
  { id: "full", label: "Full-width" },
  { id: "left", label: "Rata kiri + teks" },
  { id: "right", label: "Rata kanan + teks" },
];

function currentPlacement(a: ImageAttrs): SinglePlacementId {
  if (a.size === "full") return "full";
  if (a.size === "wide") return "wide";
  if (a.align === "left") return "left";
  if (a.align === "right") return "right";
  return "column";
}

function ImageView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pick, media } = useMedia();
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as ImageAttrs;
  const isPair = a.layout === "pair";
  const placement = currentPlacement(a);

  async function replacePrimary() {
    const chosen = await pick({ title: isPair ? "Pilih gambar pertama" : "Ganti gambar" });
    if (chosen) {
      updateAttributes({
        mediaId: chosen[0].id,
        alt: chosen[0].alt,
        caption: chosen[0].caption,
        credit: chosen[0].credit,
      });
    }
  }

  async function replacePair() {
    const chosen = await pick({ title: "Pilih gambar kedua (berdampingan)" });
    if (chosen) {
      updateAttributes({
        pairMediaId: chosen[0].id,
        pairAlt: chosen[0].alt,
        pairCaption: chosen[0].caption,
        pairCredit: chosen[0].credit,
      });
    }
  }

  function selectPlacement(id: SinglePlacementId) {
    if (id === "full") updateAttributes({ layout: "single", size: "full", align: "center" });
    else if (id === "wide") updateAttributes({ layout: "single", size: "wide", align: "center" });
    else if (id === "left") updateAttributes({ layout: "single", size: "column", align: "left" });
    else if (id === "right") updateAttributes({ layout: "single", size: "column", align: "right" });
    else updateAttributes({ layout: "single", size: "column", align: "center" });
  }

  return (
    <BlockFrame selected={selected} label="Gambar" icon={<ImageIcon className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-ink">Mode:</span>
        <button
          type="button"
          onClick={() => updateAttributes({ layout: "single" })}
          aria-pressed={!isPair}
          className={`rounded-md border px-2.5 py-1 font-medium ${!isPair ? "border-brand bg-blush text-brand-deep" : "border-line bg-paper text-ink hover:bg-warm"}`}
        >
          Satu gambar
        </button>
        <button
          type="button"
          onClick={() => updateAttributes({ layout: "pair", size: "column", align: "center" })}
          aria-pressed={isPair}
          className={`rounded-md border px-2.5 py-1 font-medium ${isPair ? "border-brand bg-blush text-brand-deep" : "border-line bg-paper text-ink hover:bg-warm"}`}
        >
          Dua gambar berdampingan
        </button>
      </div>

      {!isPair ? (
        <>
          {(placement === "left" || placement === "right") && (
            <div className="rounded-md border border-dashed border-brand/40 bg-blush/35 px-3 py-2 text-xs text-ink">
              Tata letak <strong>{placement === "left" ? "rata kiri" : "rata kanan"}</strong>: di desktop teks paragraf berikutnya mengalir di sisi {placement === "left" ? "kanan" : "kiri"} gambar; di ponsel tersusun vertikal penuh.
            </div>
          )}
          <div className={placement === "left" || placement === "right" ? "mx-auto max-w-xs" : ""}>
            {a.mediaId ? <BlockThumb mediaId={a.mediaId} alt={a.alt} /> : <p className="text-sm text-muted">Belum ada gambar.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-ink">Tata letak:</span>
            {PLACEMENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectPlacement(opt.id)}
                aria-pressed={placement === opt.id}
                className={`rounded-md border px-2.5 py-1 font-medium ${
                  placement === opt.id ? "border-brand bg-blush text-brand-deep" : "border-line bg-paper text-ink hover:bg-warm"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-ink">Rasio:</span>
            {IMAGE_RATIOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => updateAttributes({ ratio: r.value })}
                aria-pressed={(a.ratio || "auto") === r.value}
                className={`rounded-md border px-2 py-1 font-medium ${
                  (a.ratio || "auto") === r.value ? "border-brand bg-blush text-brand-deep" : "border-line bg-paper text-ink hover:bg-warm"
                }`}
              >
                {r.label}
              </button>
            ))}
            <button type="button" onClick={replacePrimary} className="ml-auto flex items-center gap-1 rounded-md border border-line bg-paper px-2.5 py-1 font-semibold hover:bg-warm">
              <RefreshCw className="size-3.5" aria-hidden /> Ganti gambar
            </button>
          </div>
          <BlockField label="Teks alternatif (alt)" value={a.alt} onChange={(alt) => updateAttributes({ alt })} warn={!a.alt.trim()} placeholder="Jelaskan isi gambar untuk aksesibilitas & SEO" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <BlockField label="Caption" value={a.caption} onChange={(caption) => updateAttributes({ caption })} multiline placeholder={a.mediaId ? media[a.mediaId]?.caption : ""} />
            <BlockField label="Kredit fotografer (opsional)" value={a.credit || ""} onChange={(credit) => updateAttributes({ credit })} max={200} placeholder={a.mediaId && media[a.mediaId]?.credit ? media[a.mediaId].credit : "mis. Foto: Nama Fotografer"} />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-ink">Rasio pasangan:</span>
            {IMAGE_RATIOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => updateAttributes({ ratio: r.value })}
                aria-pressed={(a.ratio || "auto") === r.value}
                className={`rounded-md border px-2 py-1 font-medium ${
                  (a.ratio || "auto") === r.value ? "border-brand bg-blush text-brand-deep" : "border-line bg-paper text-ink hover:bg-warm"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-md border border-line bg-warm/30 p-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Gambar 1 (Kiri)</span>
                <button type="button" onClick={replacePrimary} className="text-brand hover:underline">Ganti</button>
              </div>
              {a.mediaId ? <BlockThumb mediaId={a.mediaId} alt={a.alt} /> : <p className="text-xs text-muted">Belum dipilih.</p>}
              <BlockField label="Alt gambar 1" value={a.alt} onChange={(alt) => updateAttributes({ alt })} warn={!a.alt.trim()} />
              <BlockField label="Caption gambar 1" value={a.caption} onChange={(caption) => updateAttributes({ caption })} />
              <BlockField label="Kredit foto 1" value={a.credit || ""} onChange={(credit) => updateAttributes({ credit })} max={200} />
            </div>
            <div className="space-y-2 rounded-md border border-line bg-warm/30 p-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Gambar 2 (Kanan)</span>
                <button type="button" onClick={replacePair} className="text-brand hover:underline">
                  {a.pairMediaId ? "Ganti" : "Pilih gambar kedua"}
                </button>
              </div>
              {a.pairMediaId ? (
                <BlockThumb mediaId={a.pairMediaId} alt={a.pairAlt || ""} />
              ) : (
                <button
                  type="button"
                  onClick={replacePair}
                  className="flex h-36 w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-line bg-paper text-xs font-semibold text-brand hover:bg-warm"
                >
                  <Plus className="size-4" aria-hidden /> Pilih gambar kedua dari Media Library
                </button>
              )}
              <BlockField label="Alt gambar 2" value={a.pairAlt || ""} onChange={(pairAlt) => updateAttributes({ pairAlt })} warn={Boolean(a.pairMediaId && !(a.pairAlt || "").trim())} />
              <BlockField label="Caption gambar 2" value={a.pairCaption || ""} onChange={(pairCaption) => updateAttributes({ pairCaption })} />
              <BlockField label="Kredit foto 2" value={a.pairCredit || ""} onChange={(pairCredit) => updateAttributes({ pairCredit })} max={200} />
            </div>
          </div>
        </>
      )}
    </BlockFrame>
  );
}

// ─── Galeri ──────────────────────────────────────────────────────────────────

type GalleryItem = { mediaId: string; alt: string; caption: string; credit?: string };

function GalleryView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pick } = useMedia();
  const move = useBlockMove(editor, getPos);
  const title = node.attrs.title as string;
  const items = (node.attrs.items as GalleryItem[]) ?? [];
  const set = (next: GalleryItem[]) => updateAttributes({ items: next });
  async function add() {
    const chosen = await pick({ title: "Tambah foto ke galeri", multiple: true });
    if (chosen) set([...items, ...chosen.map((m) => ({ mediaId: m.id, alt: m.alt, caption: m.caption, credit: m.credit }))]);
  }
  function moveItem(i: number, d: -1 | 1) {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  }
  return (
    <BlockFrame selected={selected} label="Galeri" icon={<ImageIcon className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <BlockField label="Judul galeri (opsional)" value={title} onChange={(v) => updateAttributes({ title: v })} max={200} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <li key={`${item.mediaId}-${i}`} className="space-y-1.5 rounded border border-line p-2">
            <BlockThumb mediaId={item.mediaId} alt={item.alt} />
            <BlockField label="Alt" value={item.alt} onChange={(alt) => set(items.map((x, k) => (k === i ? { ...x, alt } : x)))} warn={!item.alt.trim()} />
            <BlockField label="Caption" value={item.caption} onChange={(caption) => set(items.map((x, k) => (k === i ? { ...x, caption } : x)))} />
            <BlockField label="Kredit foto" value={item.credit || ""} onChange={(credit) => set(items.map((x, k) => (k === i ? { ...x, credit } : x)))} max={200} />
            <div className="flex justify-between text-xs">
              <span className="flex gap-1">
                <button type="button" onClick={() => moveItem(i, -1)} aria-label="Geser ke kiri" className="rounded border border-line p-1"><ArrowLeft className="size-3.5" aria-hidden /></button>
                <button type="button" onClick={() => moveItem(i, 1)} aria-label="Geser ke kanan" className="rounded border border-line p-1"><ArrowRight className="size-3.5" aria-hidden /></button>
              </span>
              <button type="button" onClick={() => set(items.filter((_, k) => k !== i))} className="text-brand">Hapus</button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="flex items-center gap-1 rounded border border-line px-2.5 py-1 text-xs font-semibold">
        <Plus className="size-3.5" aria-hidden /> Tambah foto
      </button>
    </BlockFrame>
  );
}

// ─── Infografik ──────────────────────────────────────────────────────────────

function InfographicView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pick } = useMedia();
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { mediaId: string | null; title: string; source: string; dataDate: string; note: string };
  async function replace() {
    const chosen = await pick({ title: "Pilih gambar infografik" });
    if (chosen) updateAttributes({ mediaId: chosen[0].id });
  }
  return (
    <BlockFrame selected={selected} label="Infografik" icon={<ImageIcon className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      {a.mediaId ? <BlockThumb mediaId={a.mediaId} alt={a.title} /> : <p className="text-sm text-muted">Belum ada gambar.</p>}
      <BlockField label="Judul infografik" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} warn={!a.title.trim()} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <BlockField label="Sumber data" value={a.source} onChange={(source) => updateAttributes({ source })} />
        <BlockField label="Tanggal data" value={a.dataDate} onChange={(dataDate) => updateAttributes({ dataDate })} max={100} placeholder="mis. Oktober 2026" />
      </div>
      <BlockField label="Catatan" value={a.note} onChange={(note) => updateAttributes({ note })} multiline />
      <button type="button" onClick={replace} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs"><RefreshCw className="size-3.5" aria-hidden /> Ganti gambar</button>
    </BlockFrame>
  );
}

// ─── Kutipan menonjol ────────────────────────────────────────────────────────

const PULL_QUOTE_OPTIONS: { value: PullQuoteVariant; label: string }[] = [
  { value: "editorial", label: "Garis atas (Editorial)" },
  { value: "italic", label: "Garis kiri miring" },
  { value: "framed", label: "Kotak krem" },
];

function PullQuoteView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { text: string; attribution: string; variant?: PullQuoteVariant };
  return (
    <BlockFrame selected={selected} label="Kutipan menonjol" icon={<Quote className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <BlockField label="Kutipan" value={a.text} onChange={(text) => updateAttributes({ text })} max={600} multiline warn={!a.text.trim()} />
      <BlockField label="Narasumber (opsional)" value={a.attribution} onChange={(attribution) => updateAttributes({ attribution })} max={200} />
      <ToneOptionRow label="Gaya" value={a.variant || "editorial"} options={PULL_QUOTE_OPTIONS} onChange={(variant) => updateAttributes({ variant })} />
    </BlockFrame>
  );
}

// ─── Video (YouTube / Vimeo) ─────────────────────────────────────────────────

function VideoView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { provider: string; videoId: string; title: string; caption: string; url: string };
  const parsed = a.videoId ? { provider: a.provider, videoId: a.videoId } : null;
  return (
    <BlockFrame selected={selected} label="Video" icon={<Video className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <BlockField
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
      <BlockField label="Judul video" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} />
      <BlockField label="Caption" value={a.caption} onChange={(caption) => updateAttributes({ caption })} multiline />
    </BlockFrame>
  );
}

// ─── Peta (OpenStreetMap) ────────────────────────────────────────────────────

function MapView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { title: string; latitude: number | null; longitude: number | null; zoom: number; marker: boolean; caption: string; input: string };
  const ok = a.latitude !== null && a.longitude !== null;
  return (
    <BlockFrame selected={selected} label="Peta" icon={<MapPin className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <BlockField
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
        <BlockField label="Judul peta (opsional)" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} />
        <label className="block text-xs font-semibold">
          Zoom (3–18)
          <input type="number" min={3} max={18} value={a.zoom} onChange={(e) => updateAttributes({ zoom: Math.min(18, Math.max(3, Number(e.target.value) || 13)) })} className="admin-input mt-1 text-sm" />
        </label>
      </div>
      <BlockField label="Caption" value={a.caption} onChange={(caption) => updateAttributes({ caption })} multiline />
    </BlockFrame>
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

export const ArticleImageNode = atom(
  NODE.image,
  {
    mediaId: null,
    alt: "",
    caption: "",
    credit: "",
    size: "column",
    align: "center",
    ratio: "auto",
    layout: "single",
    pairMediaId: null,
    pairAlt: "",
    pairCaption: "",
    pairCredit: "",
  },
  ImageView,
).extend({
  addCommands() {
    return {
      insertArticleBlock:
        (type: string, attrs: Record<string, unknown>) =>
        ({ commands }: CommandProps) =>
          commands.insertContent([{ type, attrs }, { type: "paragraph" }]),
    };
  },
});
export const GalleryNode = atom(NODE.gallery, { title: "", items: [] }, GalleryView);
export const InfographicNode = atom(NODE.infographic, { mediaId: null, title: "", source: "", dataDate: "", note: "" }, InfographicView);
export const PullQuoteNode = atom(NODE.pullQuote, { text: "", attribution: "", variant: "editorial" }, PullQuoteView);
export const VideoNode = atom(NODE.video, { provider: "youtube", videoId: "", title: "", caption: "", url: "" }, VideoView);
export const MapNode = atom(NODE.map, { title: "", latitude: null, longitude: null, zoom: 13, marker: true, caption: "", input: "" }, MapView);
export { CalloutNode, FactBoxNode, LargeStatementNode } from "./editorial-blocks";
