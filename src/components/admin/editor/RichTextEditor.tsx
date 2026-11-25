"use client";

// Editorial Block Editor built on TipTap 2 for SUMENEP – Mata Madura.
// Unifies prose formatting (bold, italic, underline, drop cap, controlled
// editorial color/highlight/size) and structured journalistic blocks inside
// one canvas without writing raw HTML or CSS.

import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Code,
  GalleryHorizontalEnd,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MapPin,
  Megaphone,
  Minus,
  Palette,
  PieChart,
  Plus,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Table as TableIcon,
  TextQuote,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { NODE, toPlainDoc, type DocNode } from "@/lib/article-doc";
import {
  EDITORIAL_FONT_SIZES,
  EDITORIAL_HIGHLIGHTS,
  EDITORIAL_TEXT_COLORS,
  type EditorialFontSize,
} from "@/lib/editorial-tokens";

import { BlockMenuPanel, useEditorialBlockInserter } from "./BlockMenu";
import { LinkDialog } from "./LinkDialog";
import {
  activeTopLevelIndex,
  canMoveTopLevelIndex,
  EditorialDividerExtension,
  EditorialDropCapExtension,
  EditorialHighlightMark,
  EditorialTextStyleMark,
  moveTopLevelBlock,
} from "./marks";
import {
  ArticleImageNode,
  CalloutNode,
  FactBoxNode,
  GalleryNode,
  InfographicNode,
  LargeStatementNode,
  MapNode,
  PullQuoteNode,
  VideoNode,
} from "./nodes";
import { TableCellNode, TableHeaderNode, TableNode, TableRowNode } from "./TableNode";

type PopoverKind = "blocks" | "color" | "highlight" | "size" | null;

function ToolButton({
  active,
  onClick,
  label,
  children,
  disabled,
  expanded,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      title={label}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-sm transition-colors disabled:opacity-35 lg:h-8 lg:min-w-8 ${
        active ? "bg-blush text-brand-deep" : "text-ink hover:bg-warm"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden />;

function TableTools({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("table") as { caption?: string; source?: string };
  const small = "rounded-md border border-line bg-paper px-2 py-1 text-xs font-medium hover:bg-warm";
  return (
    <div role="group" aria-label="Pengaturan tabel" className="space-y-2 border-t border-line bg-warm/70 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 font-semibold text-muted">Tabel:</span>
        <button type="button" className={small} onClick={() => editor.chain().focus().addRowBefore().run()}>+ Baris atas</button>
        <button type="button" className={small} onClick={() => editor.chain().focus().addRowAfter().run()}>+ Baris bawah</button>
        <button type="button" className={small} onClick={() => editor.chain().focus().deleteRow().run()}>Hapus baris</button>
        <Divider />
        <button type="button" className={small} onClick={() => editor.chain().focus().addColumnBefore().run()}>+ Kolom kiri</button>
        <button type="button" className={small} onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Kolom kanan</button>
        <button type="button" className={small} onClick={() => editor.chain().focus().deleteColumn().run()}>Hapus kolom</button>
        <Divider />
        <button type="button" className={small} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Baris judul</button>
        <button type="button" className={`${small} font-semibold text-brand`} onClick={() => editor.chain().focus().deleteTable().run()}>Hapus tabel</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold">
          Keterangan tabel
          <input value={attrs.caption ?? ""} maxLength={500} onChange={(e) => editor.chain().updateAttributes("table", { caption: e.target.value }).run()} className="admin-input mt-1 min-h-9 text-sm" />
        </label>
        <label className="text-xs font-semibold">
          Sumber data
          <input value={attrs.source ?? ""} maxLength={500} onChange={(e) => editor.chain().updateAttributes("table", { source: e.target.value }).run()} className="admin-input mt-1 min-h-9 text-sm" />
        </label>
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [popover, setPopover] = useState<PopoverKind>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const insertBlock = useEditorialBlockInserter(editor);

  useEffect(() => {
    if (!popover) return;
    const closeOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setPopover(null);
    };
    const closeEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEsc);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEsc);
    };
  }, [popover]);

  const togglePopover = (next: PopoverKind) => setPopover((cur) => (cur === next ? null : next));
  const act = (fn: () => void) => () => {
    setPopover(null);
    fn();
  };
  const textStyleAttrs = editor.getAttributes("textStyle") as { color?: string | null; fontSize?: string | null };
  const highlightAttrs = editor.getAttributes("highlight") as { color?: string | null };
  const dropCapActive = editor.isActive("paragraph", { dropCap: true });
  const activeIndex = activeTopLevelIndex(editor);
  const canUp = canMoveTopLevelIndex(editor.state.doc, activeIndex, -1);
  const canDown = canMoveTopLevelIndex(editor.state.doc, activeIndex, 1);

  return (
    <div ref={barRef} className="sticky top-[3.75rem] z-10 rounded-t-lg border-b border-line bg-paper font-sans">
      {/* Row 1: Inline formatting, typography, headings, lists, block move */}
      <div className="relative flex flex-wrap items-center gap-0.5 p-1.5">
        <ToolButton label="Tebal" active={editor.isActive("bold")} onClick={act(() => editor.chain().focus().toggleBold().run())}><Bold className="size-4" /></ToolButton>
        <ToolButton label="Miring" active={editor.isActive("italic")} onClick={act(() => editor.chain().focus().toggleItalic().run())}><Italic className="size-4" /></ToolButton>
        <ToolButton label="Garis bawah" active={editor.isActive("underline")} onClick={act(() => editor.chain().focus().toggleUnderline().run())}><UnderlineIcon className="size-4" /></ToolButton>
        <ToolButton label="Coret" active={editor.isActive("strike")} onClick={act(() => editor.chain().focus().toggleStrike().run())}><Strikethrough className="size-4" /></ToolButton>
        <ToolButton label="Kode" active={editor.isActive("code")} onClick={act(() => editor.chain().focus().toggleCode().run())}><Code className="size-4" /></ToolButton>
        <Divider />

        <ToolButton label="Drop Cap" active={dropCapActive} onClick={act(() => editor.chain().focus().toggleDropCap().run())}>
          <span className="flex items-center gap-1 px-0.5 text-xs font-bold">
            <span className="font-serif text-sm text-[#A61B2B]">A</span>
            <span className="hidden sm:inline">Drop Cap</span>
          </span>
        </ToolButton>

        <ToolButton label="Ukuran teks" active={Boolean(textStyleAttrs.fontSize)} expanded={popover === "size"} onClick={() => togglePopover("size")}>
          <Type className="size-4" />
        </ToolButton>

        <ToolButton label="Warna teks" active={Boolean(textStyleAttrs.color)} expanded={popover === "color"} onClick={() => togglePopover("color")}>
          <span className="flex items-center gap-1">
            <Palette className="size-4" />
            {textStyleAttrs.color && <span aria-hidden className="size-2.5 rounded-full border border-black/20" style={{ backgroundColor: textStyleAttrs.color }} />}
          </span>
        </ToolButton>

        <ToolButton label="Sorotan teks" active={Boolean(highlightAttrs.color)} expanded={popover === "highlight"} onClick={() => togglePopover("highlight")}>
          <span className="flex items-center gap-1">
            <Highlighter className="size-4" />
            {highlightAttrs.color && <span aria-hidden className="size-2.5 rounded-full border border-black/20" style={{ backgroundColor: highlightAttrs.color }} />}
          </span>
        </ToolButton>
        <Divider />

        <ToolButton label="Paragraf" active={editor.isActive("paragraph")} onClick={act(() => editor.chain().focus().setParagraph().run())}><span className="text-xs font-bold">¶</span></ToolButton>
        {([2, 3, 4] as const).map((level) => (
          <ToolButton key={level} label={`Subjudul H${level}`} active={editor.isActive("heading", { level })} onClick={act(() => editor.chain().focus().toggleHeading({ level }).run())}>
            <span className="text-xs font-bold">H{level}</span>
          </ToolButton>
        ))}
        <Divider />

        <ToolButton label="Daftar berpoin" active={editor.isActive("bulletList")} onClick={act(() => editor.chain().focus().toggleBulletList().run())}><List className="size-4" /></ToolButton>
        <ToolButton label="Daftar bernomor" active={editor.isActive("orderedList")} onClick={act(() => editor.chain().focus().toggleOrderedList().run())}><ListOrdered className="size-4" /></ToolButton>
        <ToolButton label="Kutipan" active={editor.isActive("blockquote")} onClick={act(() => editor.chain().focus().toggleBlockquote().run())}><Quote className="size-4" /></ToolButton>
        <ToolButton label="Tautan" active={editor.isActive("link")} onClick={act(() => setLinkOpen(true))}><Link2 className="size-4" /></ToolButton>
        <Divider />

        <ToolButton label="Naikkan blok aktif" disabled={!canUp} onClick={act(() => moveTopLevelBlock(editor, activeIndex, -1))}><ArrowUp className="size-4" /></ToolButton>
        <ToolButton label="Turunkan blok aktif" disabled={!canDown} onClick={act(() => moveTopLevelBlock(editor, activeIndex, 1))}><ArrowDown className="size-4" /></ToolButton>
        <Divider />

        <ToolButton label="Urungkan" onClick={act(() => editor.chain().focus().undo().run())} disabled={!editor.can().undo()}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label="Ulangi" onClick={act(() => editor.chain().focus().redo().run())} disabled={!editor.can().redo()}><Redo2 className="size-4" /></ToolButton>

        {linkOpen && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      </div>

      {/* Row 2: Block inserter menu + quick single-click editorial blocks */}
      <div className="flex flex-wrap items-center gap-1 border-t border-line bg-warm/45 px-2 py-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => togglePopover("blocks")}
          aria-expanded={popover === "blocks"}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
            popover === "blocks" ? "border-brand bg-blush text-brand-deep" : "border-brand/35 bg-paper text-brand hover:bg-blush/50"
          }`}
        >
          <Plus className="size-3.5" aria-hidden /> Tambah blok
        </button>
        <Divider />
        <ToolButton label="Gambar" onClick={act(() => void insertBlock("imageColumn"))}><ImageIcon className="size-4" /></ToolButton>
        <ToolButton label="Galeri" onClick={act(() => void insertBlock("gallery"))}><GalleryHorizontalEnd className="size-4" /></ToolButton>
        <ToolButton label="Kutipan menonjol" onClick={act(() => void insertBlock("pullQuote"))}><TextQuote className="size-4" /></ToolButton>
        <ToolButton label="Pernyataan besar" onClick={act(() => void insertBlock("largeStatement"))}><Sparkles className="size-4" /></ToolButton>
        <ToolButton label="Kotak fakta" onClick={act(() => void insertBlock("factBox"))}><ListChecks className="size-4" /></ToolButton>
        <ToolButton label="Callout informasi" onClick={act(() => void insertBlock("callout"))}><Megaphone className="size-4" /></ToolButton>
        <ToolButton label="Tabel" active={editor.isActive("table")} onClick={act(() => void insertBlock("table"))}><TableIcon className="size-4" /></ToolButton>
        <ToolButton label="Infografik" onClick={act(() => void insertBlock("infographic"))}><PieChart className="size-4" /></ToolButton>
        <ToolButton label="Video YouTube/Vimeo" onClick={act(() => void insertBlock("video"))}><Video className="size-4" /></ToolButton>
        <ToolButton label="Peta" onClick={act(() => void insertBlock("map"))}><MapPin className="size-4" /></ToolButton>
        <ToolButton label="Garis pemisah" onClick={act(() => void insertBlock("dividerEditorial"))}><Minus className="size-4" /></ToolButton>
      </div>

      {/* Popovers render below Row 2 so neither Row 1 nor Row 2 controls are covered */}
      {popover === "size" && (
        <div role="dialog" aria-label="Pilih ukuran teks" className="absolute top-full left-2 right-2 z-20 mt-1 rounded-lg border border-line bg-paper p-2 shadow-lg sm:right-auto sm:left-4 sm:w-56">
          <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-muted uppercase">Ukuran teks terpilih</p>
          <div className="grid gap-1">
            {EDITORIAL_FONT_SIZES.map((sz) => {
              const isSelected = sz.id === "md" ? !textStyleAttrs.fontSize : textStyleAttrs.fontSize === sz.id;
              return (
                <button
                  key={sz.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setEditorialFontSize(sz.id === "md" ? null : (sz.id as EditorialFontSize)).run();
                    setPopover(null);
                  }}
                  className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium ${isSelected ? "bg-blush font-semibold text-brand-deep" : "text-ink hover:bg-warm"}`}
                >
                  <span>{sz.label}</span>
                  <span className="font-serif text-muted" style={{ fontSize: sz.scale }}>Aa</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {popover === "color" && (
        <div role="dialog" aria-label="Pilih warna teks editorial" className="absolute top-full left-2 right-2 z-20 mt-1 rounded-lg border border-line bg-paper p-2.5 shadow-lg sm:right-auto sm:left-16 sm:w-60">
          <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-muted uppercase">Warna teks editorial</p>
          <div className="grid gap-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().setEditorialColor(null).run();
                setPopover(null);
              }}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${!textStyleAttrs.color ? "bg-blush font-semibold text-brand-deep" : "hover:bg-warm"}`}
            >
              <span aria-hidden className="size-3.5 rounded-full border border-black/20 bg-[#252525]" /> Standar (#252525)
            </button>
            {EDITORIAL_TEXT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setEditorialColor(c.hex).run();
                  setPopover(null);
                }}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${textStyleAttrs.color === c.hex ? "bg-blush font-semibold text-brand-deep" : "hover:bg-warm"}`}
              >
                <span aria-hidden className="size-3.5 rounded-full border border-black/20" style={{ backgroundColor: c.hex }} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {popover === "highlight" && (
        <div role="dialog" aria-label="Pilih sorotan teks editorial" className="absolute top-full left-2 right-2 z-20 mt-1 rounded-lg border border-line bg-paper p-2.5 shadow-lg sm:right-auto sm:left-24 sm:w-64">
          <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-muted uppercase">Sorotan latar teks</p>
          <div className="grid gap-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetEditorialHighlight().run();
                setPopover(null);
              }}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${!highlightAttrs.color ? "bg-blush font-semibold text-brand-deep" : "hover:bg-warm"}`}
            >
              <span aria-hidden className="size-3.5 rounded border border-dashed border-muted bg-paper" /> Tanpa sorotan
            </button>
            {EDITORIAL_HIGHLIGHTS.map((h) => (
              <button
                key={h.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setEditorialHighlight(h.hex).run();
                  setPopover(null);
                }}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${highlightAttrs.color === h.hex ? "bg-blush font-semibold text-brand-deep" : "hover:bg-warm"}`}
              >
                <span aria-hidden className="size-3.5 rounded border border-black/15" style={{ backgroundColor: h.hex }} />
                <span>{h.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {popover === "blocks" && (
        <div className="absolute top-full left-2 right-2 z-20 mt-1 sm:w-[34rem] sm:max-w-[calc(100vw-3rem)]">
          <BlockMenuPanel onClose={() => setPopover(null)} onSelect={(id) => void insertBlock(id, false)} />
        </div>
      )}

      {editor.isActive("table") && <TableTools editor={editor} />}
    </div>
  );
}

function BottomBlockBar({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const insertBlock = useEditorialBlockInserter(editor);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative border-t border-line bg-warm/40 px-3 py-2 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand"
        >
          <Plus className="size-3.5 text-[#A61B2B]" aria-hidden /> Sisipkan blok editorial
        </button>
        <span className="text-[11px] text-muted">Seret handle ⋮⋮ atau pakai ↑ / ↓ untuk memindahkan urutan blok.</span>
      </div>
      {open && (
        <div className="mt-2">
          <BlockMenuPanel onClose={() => setOpen(false)} onSelect={(id) => void insertBlock(id, true)} />
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({ content, onChange, editable = true }: { content: DocNode; onChange: (doc: DocNode) => void; editable?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        dropcursor: { color: "#A61B2B", width: 3 },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
      EditorialDropCapExtension,
      EditorialDividerExtension,
      EditorialTextStyleMark,
      EditorialHighlightMark,
      ArticleImageNode,
      GalleryNode,
      InfographicNode,
      PullQuoteNode,
      LargeStatementNode,
      FactBoxNode,
      CalloutNode,
      VideoNode,
      MapNode,
      TableNode,
      TableRowNode,
      TableHeaderNode,
      TableCellNode,
    ],
    content: content as object,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "cms-prose", "aria-label": "Isi artikel", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor, transaction }) => {
      if (transaction.docChanged) onChange(toPlainDoc(editor.getJSON()));
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) return <div className="cms-prose rounded-lg border border-line bg-paper text-muted">Memuat editor…</div>;

  return (
    <div className="rounded-lg border border-line bg-paper">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {editable && <BottomBlockBar editor={editor} />}
    </div>
  );
}
