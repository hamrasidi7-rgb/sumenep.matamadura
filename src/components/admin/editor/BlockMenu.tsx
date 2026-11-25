"use client";

import type { Editor } from "@tiptap/react";
import {
  AlignLeft,
  AlignRight,
  Columns2,
  GalleryHorizontalEnd,
  Heading2,
  Heading3,
  Image as ImageIcon,
  ListChecks,
  MapPin,
  Maximize2,
  Megaphone,
  Minus,
  MoreHorizontal,
  PieChart,
  Quote,
  Sparkles,
  Table as TableIcon,
  TextQuote,
  Type,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";

import { NODE } from "@/lib/article-doc";

import { useMedia } from "./MediaContext";

export type BlockActionId =
  | "paragraph"
  | "dropCapParagraph"
  | "h2"
  | "h3"
  | "blockquote"
  | "pullQuote"
  | "largeStatement"
  | "imageColumn"
  | "imageWide"
  | "imageFull"
  | "imageLeft"
  | "imageRight"
  | "imagePair"
  | "gallery"
  | "factBox"
  | "callout"
  | "table"
  | "infographic"
  | "video"
  | "map"
  | "dividerEditorial"
  | "dividerDots";

interface MenuItem {
  id: BlockActionId;
  label: string;
  hint: string;
  icon: ReactNode;
}

const GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    title: "Teks & Tipografi",
    items: [
      { id: "paragraph", label: "Paragraf", hint: "Paragraf teks Lora biasa", icon: <span className="text-xs font-bold">¶</span> },
      { id: "dropCapParagraph", label: "Paragraf Drop Cap", hint: "Huruf pertama besar editorial", icon: <Type className="size-4" /> },
      { id: "h2", label: "Subjudul H2", hint: "Kepala bagian utama artikel", icon: <Heading2 className="size-4" /> },
      { id: "h3", label: "Subjudul H3", hint: "Sub-bagian di bawah H2", icon: <Heading3 className="size-4" /> },
      { id: "blockquote", label: "Kutipan paragraf", hint: "Kutipan bergaris kiri dalam aliran teks", icon: <Quote className="size-4" /> },
      { id: "pullQuote", label: "Kutipan menonjol (Pull Quote)", hint: "Kutipan besar beserta narasumber", icon: <TextQuote className="size-4" /> },
      { id: "largeStatement", label: "Pernyataan besar", hint: "Angka penting atau sorotan statistik", icon: <Sparkles className="size-4" /> },
    ],
  },
  {
    title: "Gambar & Galeri",
    items: [
      { id: "imageColumn", label: "Gambar standar", hint: "Selebar kolom bacaan", icon: <ImageIcon className="size-4" /> },
      { id: "imageWide", label: "Gambar editorial besar", hint: "Melebar melebihi kolom teks", icon: <Maximize2 className="size-4" /> },
      { id: "imageFull", label: "Gambar full-width", hint: "Lebar penuh mengikuti layar", icon: <Maximize2 className="size-4 text-[#A61B2B]" /> },
      { id: "imageLeft", label: "Gambar rata kiri + teks", hint: "Teks mengalir di kanan pada desktop", icon: <AlignLeft className="size-4" /> },
      { id: "imageRight", label: "Gambar rata kanan + teks", hint: "Teks mengalir di kiri pada desktop", icon: <AlignRight className="size-4" /> },
      { id: "imagePair", label: "Dua gambar berdampingan", hint: "Dua foto sejajar dalam satu baris", icon: <Columns2 className="size-4" /> },
      { id: "gallery", label: "Galeri foto", hint: "Kumpulan foto dengan lightbox", icon: <GalleryHorizontalEnd className="size-4" /> },
    ],
  },
  {
    title: "Data, Kotak Info & Media",
    items: [
      { id: "factBox", label: "Kotak fakta", hint: "Daftar fakta ringkas berbingkai", icon: <ListChecks className="size-4" /> },
      { id: "callout", label: "Callout informasi", hint: "Catatan editorial / kotak info", icon: <Megaphone className="size-4" /> },
      { id: "table", label: "Tabel data", hint: "Baris dan kolom berstruktur", icon: <TableIcon className="size-4" /> },
      { id: "infographic", label: "Infografik", hint: "Grafik visual beserta sumber & tanggal", icon: <PieChart className="size-4" /> },
      { id: "video", label: "Video YouTube / Vimeo", hint: "Putar aman saat diklik", icon: <Video className="size-4" /> },
      { id: "map", label: "Peta lokasi", hint: "Peta OpenStreetMap dari koordinat", icon: <MapPin className="size-4" /> },
      { id: "dividerEditorial", label: "Garis pemisah", hint: "Pemisah bagian bergaris merah", icon: <Minus className="size-4" /> },
      { id: "dividerDots", label: "Pemisah tiga titik (•••)", hint: "Ornamen jeda baca majalah", icon: <MoreHorizontal className="size-4" /> },
    ],
  },
];

export function useEditorialBlockInserter(editor: Editor | null) {
  const { pick } = useMedia();

  return async function insertBlock(id: BlockActionId, atEnd = false) {
    if (!editor) return;
    const focusChain = () => (atEnd ? editor.chain().focus("end") : editor.chain().focus());
    const insertNode = (type: string, attrs: Record<string, unknown>) => focusChain().insertArticleBlock(type, attrs).run();

    switch (id) {
      case "paragraph":
        focusChain().insertContent({ type: "paragraph" }).run();
        return;
      case "dropCapParagraph":
        focusChain().insertContent({ type: "paragraph", attrs: { dropCap: true } }).run();
        return;
      case "h2":
        focusChain().insertContent({ type: "heading", attrs: { level: 2 } }).run();
        return;
      case "h3":
        focusChain().insertContent({ type: "heading", attrs: { level: 3 } }).run();
        return;
      case "blockquote":
        focusChain().toggleBlockquote().run();
        return;
      case "pullQuote":
        insertNode(NODE.pullQuote, { text: "", attribution: "", variant: "editorial" });
        return;
      case "largeStatement":
        insertNode(NODE.largeStatement, { headline: "", description: "", source: "", tone: "brand" });
        return;
      case "factBox":
        insertNode(NODE.factBox, { title: "", items: [""], source: "", tone: "cream" });
        return;
      case "callout":
        insertNode(NODE.callout, { label: "Catatan Redaksi", title: "", body: "", tone: "cream" });
        return;
      case "table":
        focusChain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        return;
      case "video":
        insertNode(NODE.video, { provider: "youtube", videoId: "", title: "", caption: "", url: "" });
        return;
      case "map":
        insertNode(NODE.map, { title: "", latitude: null, longitude: null, zoom: 13, marker: true, caption: "", input: "" });
        return;
      case "dividerEditorial":
        focusChain().insertDividerVariant("editorial").run();
        return;
      case "dividerDots":
        focusChain().insertDividerVariant("dots").run();
        return;
      case "gallery": {
        const chosen = await pick({ title: "Pilih foto galeri", multiple: true });
        if (chosen) insertNode(NODE.gallery, { title: "", items: chosen.map((m) => ({ mediaId: m.id, alt: m.alt, caption: m.caption, credit: m.credit })) });
        return;
      }
      case "infographic": {
        const chosen = await pick({ title: "Pilih gambar infografik" });
        if (chosen) insertNode(NODE.infographic, { mediaId: chosen[0].id, title: chosen[0].caption || "", source: "", dataDate: "", note: "" });
        return;
      }
      case "imagePair": {
        const chosen = await pick({ title: "Pilih foto untuk dua gambar berdampingan", multiple: true });
        if (!chosen?.length) return;
        const first = chosen[0];
        const second = chosen[1];
        insertNode(NODE.image, {
          mediaId: first.id,
          alt: first.alt,
          caption: first.caption,
          credit: first.credit,
          size: "column",
          align: "center",
          ratio: "4/3",
          layout: "pair",
          pairMediaId: second?.id ?? null,
          pairAlt: second?.alt ?? "",
          pairCaption: second?.caption ?? "",
          pairCredit: second?.credit ?? "",
        });
        return;
      }
      case "imageColumn":
      case "imageWide":
      case "imageFull":
      case "imageLeft":
      case "imageRight": {
        const titles: Record<string, string> = {
          imageColumn: "Sisipkan gambar selebar teks",
          imageWide: "Sisipkan gambar editorial besar",
          imageFull: "Sisipkan gambar full-width",
          imageLeft: "Sisipkan gambar rata kiri + teks mengalir",
          imageRight: "Sisipkan gambar rata kanan + teks mengalir",
        };
        const chosen = await pick({ title: titles[id] });
        if (!chosen) return;
        const m = chosen[0];
        insertNode(NODE.image, {
          mediaId: m.id,
          alt: m.alt,
          caption: m.caption,
          credit: m.credit,
          size: id === "imageFull" ? "full" : id === "imageWide" ? "wide" : "column",
          align: id === "imageLeft" ? "left" : id === "imageRight" ? "right" : "center",
          ratio: "auto",
          layout: "single",
        });
      }
    }
  };
}

export function BlockMenuPanel({
  onSelect,
  onClose,
}: {
  onSelect: (id: BlockActionId) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Pilih jenis blok editorial"
      className="max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-paper p-3 shadow-xl"
    >
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-1 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">{group.title}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onClose();
                    onSelect(item.id);
                  }}
                  className="flex items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-warm"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded border border-line bg-warm/60 text-ink">
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-ink">{item.label}</span>
                    <span className="block text-[11px] leading-snug text-muted">{item.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
