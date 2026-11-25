"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ListChecks, Megaphone, Plus, Sparkles, X } from "lucide-react";

import { NODE } from "@/lib/article-doc";
import type { BoxTone, FactBoxTone, LargeStatementTone } from "@/lib/editorial-tokens";

import { BlockField, BlockFrame, ToneOptionRow, useBlockMove } from "./BlockFrame";

function atomBlock(name: string, defaults: Record<string, unknown>, view: (props: NodeViewProps) => React.JSX.Element) {
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

// ─── Pernyataan Besar / Angka Sorotan ────────────────────────────────────────

const STATEMENT_TONES: { value: LargeStatementTone; label: string; swatch: string }[] = [
  { value: "brand", label: "Merah editorial", swatch: "#A61B2B" },
  { value: "ink", label: "Hitam", swatch: "#171717" },
  { value: "cream", label: "Latar krem", swatch: "#FAF6F0" },
];

function LargeStatementView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { headline: string; description: string; source: string; tone: LargeStatementTone };
  return (
    <BlockFrame selected={selected} label="Pernyataan besar" icon={<Sparkles className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <div className={`rounded-md border px-4 py-4 text-center ${a.tone === "cream" ? "border-[#E6DFD3] bg-[#FAF6F0]" : "border-line bg-warm/40"}`}>
        <p className={`font-serif text-2xl font-bold ${a.tone === "ink" ? "text-[#171717]" : "text-[#A61B2B]"}`}>
          {a.headline.trim() || "68% atau Pernyataan Utama"}
        </p>
        {a.description.trim() && <p className="mt-1 font-serif text-sm text-[#252525]">{a.description}</p>}
      </div>
      <BlockField
        label="Angka / pernyataan besar"
        value={a.headline}
        onChange={(headline) => updateAttributes({ headline })}
        max={120}
        warn={!a.headline.trim()}
        placeholder="mis. 68% atau Rp 2,4 Miliar"
      />
      <BlockField
        label="Penjelasan singkat"
        value={a.description}
        onChange={(description) => updateAttributes({ description })}
        max={400}
        multiline
        placeholder="Konteks singkat mengenai angka atau pernyataan di atas"
      />
      <BlockField
        label="Sumber / konteks (opsional)"
        value={a.source}
        onChange={(source) => updateAttributes({ source })}
        max={200}
        placeholder="mis. BPS Sumenep, 2026"
      />
      <ToneOptionRow label="Gaya" value={a.tone || "brand"} options={STATEMENT_TONES} onChange={(tone) => updateAttributes({ tone })} />
    </BlockFrame>
  );
}

// ─── Kotak Fakta ─────────────────────────────────────────────────────────────

const FACT_TONES: { value: FactBoxTone; label: string; swatch: string }[] = [
  { value: "cream", label: "Krem editorial", swatch: "#FAF6F0" },
  { value: "mist", label: "Abu-abu lembut", swatch: "#F4F5F6" },
  { value: "blush", label: "Merah lembut", swatch: "#F8EFEC" },
];

function FactBoxView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { title: string; items: string[]; source: string; tone: FactBoxTone };
  const items = Array.isArray(a.items) && a.items.length > 0 ? a.items : [""];
  const setItems = (next: string[]) => updateAttributes({ items: next });

  return (
    <BlockFrame selected={selected} label="Kotak fakta" icon={<ListChecks className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <BlockField
        label="Judul kotak fakta"
        value={a.title}
        onChange={(title) => updateAttributes({ title })}
        max={200}
        warn={!a.title.trim()}
        placeholder="mis. Fakta Singkat Garam Kalianget"
      />
      <div className="space-y-2">
        <span className="block text-xs font-semibold text-ink">Poin fakta</span>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-5 text-center text-xs font-bold text-[#A61B2B]">{idx + 1}.</span>
            <input
              type="text"
              value={item}
              maxLength={300}
              onChange={(e) => setItems(items.map((x, k) => (k === idx ? e.target.value : x)))}
              placeholder={`Tulis poin fakta ${idx + 1}`}
              aria-label={`Poin fakta ${idx + 1}`}
              className="admin-input min-h-9 flex-1 text-sm"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setItems(items.filter((_, k) => k !== idx))}
                aria-label={`Hapus poin fakta ${idx + 1}`}
                className="rounded border border-line p-2 text-muted hover:text-brand"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {items.length < 12 && (
          <button
            type="button"
            onClick={() => setItems([...items, ""])}
            className="inline-flex items-center gap-1 rounded border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-warm"
          >
            <Plus className="size-3.5" aria-hidden /> Tambah poin fakta
          </button>
        )}
      </div>
      <BlockField label="Sumber data (opsional)" value={a.source} onChange={(source) => updateAttributes({ source })} max={200} />
      <ToneOptionRow label="Latar" value={a.tone || "cream"} options={FACT_TONES} onChange={(tone) => updateAttributes({ tone })} />
    </BlockFrame>
  );
}

// ─── Callout Informasi ───────────────────────────────────────────────────────

const CALLOUT_TONES: { value: BoxTone; label: string; swatch: string }[] = [
  { value: "cream", label: "Krem editorial", swatch: "#FAF6F0" },
  { value: "blush", label: "Merah lembut", swatch: "#F8EFEC" },
  { value: "mist", label: "Abu-abu lembut", swatch: "#F4F5F6" },
  { value: "dark", label: "Gelap", swatch: "#171717" },
];

function CalloutView({ editor, getPos, node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const move = useBlockMove(editor, getPos);
  const a = node.attrs as { label: string; title: string; body: string; tone: BoxTone };
  return (
    <BlockFrame selected={selected} label="Callout informasi" icon={<Megaphone className="size-3.5" aria-hidden />} onDelete={deleteNode} move={move}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <BlockField label="Label (opsional)" value={a.label} onChange={(label) => updateAttributes({ label })} max={80} placeholder="mis. Catatan Redaksi" />
        <BlockField label="Judul (opsional)" value={a.title} onChange={(title) => updateAttributes({ title })} max={200} placeholder="Judul callout" />
      </div>
      <BlockField
        label="Isi callout"
        value={a.body}
        onChange={(body) => updateAttributes({ body })}
        max={1500}
        multiline
        rows={3}
        warn={!a.body.trim() && !a.title.trim()}
        placeholder="Tulis catatan editorial, latar kebijakan, atau informasi penting…"
      />
      <ToneOptionRow label="Warna kotak" value={a.tone || "cream"} options={CALLOUT_TONES} onChange={(tone) => updateAttributes({ tone })} />
    </BlockFrame>
  );
}

export const LargeStatementNode = atomBlock(
  NODE.largeStatement,
  { headline: "", description: "", source: "", tone: "brand" },
  LargeStatementView,
);

export const FactBoxNode = atomBlock(
  NODE.factBox,
  { title: "", items: [""], source: "", tone: "cream" },
  FactBoxView,
);

export const CalloutNode = atomBlock(
  NODE.callout,
  { label: "Catatan Redaksi", title: "", body: "", tone: "cream" },
  CalloutView,
);
