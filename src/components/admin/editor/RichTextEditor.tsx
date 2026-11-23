"use client";

// Article body editor. Ported from Busacare components/admin/editor/
// rich-text-editor.tsx: TipTap 2 + StarterKit (no code block), Underline,
// Link (no autolink, no open-on-click), sticky wrapping toolbar, table tools
// row, and the plain-object copy before handing the JSON to Server Actions.
// SUMENEP additions: H4, divider, pull quote, gallery, infographic, video and
// map blocks, table caption/source, images chosen through the media picker.

import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  MapPin,
  Minus,
  PieChart,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  TextQuote,
  Underline as UnderlineIcon,
  Undo2,
  Video,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { NODE, toPlainDoc, type DocNode } from "@/lib/article-doc";

import { LinkDialog } from "./LinkDialog";
import { useMedia } from "./MediaContext";
import { ArticleImageNode, GalleryNode, InfographicNode, MapNode, PullQuoteNode, VideoNode } from "./nodes";
import { TableCellNode, TableHeaderNode, TableNode, TableRowNode } from "./TableNode";

function ToolButton({ active, onClick, label, children, disabled }: { active?: boolean; onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-md px-1.5 text-sm transition-colors disabled:opacity-40 lg:h-9 lg:min-w-9 ${active ? "bg-blush text-brand-deep" : "text-ink hover:bg-warm"}`}
    >
      {children}
    </button>
  );
}

const Divider = () => <div className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;

function TableTools({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("table") as { caption?: string; source?: string };
  const small = "rounded-md border border-line bg-paper px-2 py-1 text-xs font-medium hover:bg-warm";
  return (
    <div role="group" aria-label="Pengaturan tabel" className="space-y-2 border-t border-line bg-warm/70 px-2 py-2">
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
  const { pick } = useMedia();
  const [linkOpen, setLinkOpen] = useState(false);
  const insert = (type: string, attrs: Record<string, unknown>) => editor.chain().focus().insertArticleBlock(type, attrs).run();

  async function image() {
    const chosen = await pick({ title: "Sisipkan gambar" });
    if (chosen) insert(NODE.image, { mediaId: chosen[0].id, alt: chosen[0].alt, caption: chosen[0].caption, size: "column" });
  }
  async function gallery() {
    const chosen = await pick({ title: "Pilih foto galeri", multiple: true });
    if (chosen) insert(NODE.gallery, { title: "", items: chosen.map((m) => ({ mediaId: m.id, alt: m.alt, caption: m.caption })) });
  }
  async function infographic() {
    const chosen = await pick({ title: "Pilih gambar infografik" });
    if (chosen) insert(NODE.infographic, { mediaId: chosen[0].id, title: chosen[0].caption || "", source: "", dataDate: "", note: "" });
  }

  return (
    // Sticky under the editor's action bar; wraps instead of scrolling so no
    // button is ever hidden on a phone (Busacare: same reasoning).
    <div className="sticky top-[3.75rem] z-10 rounded-t-lg border-b border-line bg-paper">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5">
        <ToolButton label="Tebal" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolButton>
        <ToolButton label="Miring" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolButton>
        <ToolButton label="Garis bawah" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolButton>
        <ToolButton label="Coret" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></ToolButton>
        <ToolButton label="Kode" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="size-4" /></ToolButton>
        <Divider />
        <ToolButton label="Paragraf" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}><span className="text-xs font-bold">¶</span></ToolButton>
        {([2, 3, 4] as const).map((level) => (
          <ToolButton key={level} label={`Subjudul H${level}`} active={editor.isActive("heading", { level })} onClick={() => editor.chain().focus().toggleHeading({ level }).run()}>
            <span className="text-xs font-bold">H{level}</span>
          </ToolButton>
        ))}
        <Divider />
        <ToolButton label="Daftar berpoin" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolButton>
        <ToolButton label="Daftar bernomor" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolButton>
        <ToolButton label="Kutipan" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="size-4" /></ToolButton>
        <ToolButton label="Kutipan menonjol" onClick={() => insert(NODE.pullQuote, { text: "", attribution: "" })}><TextQuote className="size-4" /></ToolButton>
        <Divider />
        <ToolButton label="Tautan" active={editor.isActive("link")} onClick={() => setLinkOpen(true)}><Link2 className="size-4" /></ToolButton>
        <ToolButton label="Gambar" onClick={image}><ImageIcon className="size-4" /></ToolButton>
        <ToolButton label="Galeri" onClick={gallery}><GalleryHorizontalEnd className="size-4" /></ToolButton>
        <ToolButton label="Infografik" onClick={infographic}><PieChart className="size-4" /></ToolButton>
        <ToolButton label="Tabel" active={editor.isActive("table")} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="size-4" /></ToolButton>
        <ToolButton label="Video YouTube/Vimeo" onClick={() => insert(NODE.video, { provider: "youtube", videoId: "", title: "", caption: "", url: "" })}><Video className="size-4" /></ToolButton>
        <ToolButton label="Peta" onClick={() => insert(NODE.map, { title: "", latitude: null, longitude: null, zoom: 13, marker: true, caption: "", input: "" })}><MapPin className="size-4" /></ToolButton>
        <ToolButton label="Garis pemisah" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="size-4" /></ToolButton>
        <Divider />
        <ToolButton label="Urungkan" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label="Ulangi" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 className="size-4" /></ToolButton>
        {linkOpen && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      </div>
      {editor.isActive("table") && <TableTools editor={editor} />}
    </div>
  );
}

export function RichTextEditor({ content, onChange, editable = true }: { content: DocNode; onChange: (doc: DocNode) => void; editable?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
      ArticleImageNode,
      GalleryNode,
      InfographicNode,
      PullQuoteNode,
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
    // Only real document changes count: TipTap also emits "update" for
    // non-changes (e.g. setEditable), which would mark an untouched article as
    // edited and autosave it. Plain-object copy: ProseMirror attrs are
    // prototype-less and Server Actions refuse them.
    onUpdate: ({ editor, transaction }) => {
      if (transaction.docChanged) onChange(toPlainDoc(editor.getJSON()));
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) return <div className="cms-prose rounded-lg border border-line bg-paper text-muted">Memuat editor…</div>;

  return (
    // No overflow-hidden: it would make this box the sticky toolbar's scroll container.
    <div className="rounded-lg border border-line bg-paper">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
