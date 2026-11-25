"use client";

import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState, type ReactNode } from "react";

import { canMoveTopLevelIndex, moveTopLevelBlock, topLevelIndexFromPos } from "./marks";
import { useMedia } from "./MediaContext";

export function useBlockMove(editor: NodeViewProps["editor"], getPos: NodeViewProps["getPos"]) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    editor.on("transaction", bump);
    return () => {
      editor.off("transaction", bump);
    };
  }, [editor]);

  const currentIndex = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    return typeof pos === "number" ? topLevelIndexFromPos(editor.state.doc, pos) : null;
  };
  const index = currentIndex();
  const canMoveUp = canMoveTopLevelIndex(editor.state.doc, index, -1);
  const canMoveDown = canMoveTopLevelIndex(editor.state.doc, index, 1);
  return {
    canMoveUp,
    canMoveDown,
    onMoveUp: () => moveTopLevelBlock(editor, currentIndex(), -1),
    onMoveDown: () => moveTopLevelBlock(editor, currentIndex(), 1),
  };
}

export function BlockFrame({
  selected,
  label,
  icon,
  children,
  onDelete,
  move,
}: {
  selected: boolean;
  label: string;
  icon: ReactNode;
  children: ReactNode;
  onDelete: () => void;
  move?: { canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void };
}) {
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-block={label}
      className={`my-5 rounded-lg border bg-paper font-sans shadow-xs ${selected ? "border-brand ring-2 ring-brand/20" : "border-line"}`}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-warm/60 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
        data-drag-handle
      >
        <span className="flex items-center gap-1.5">
          <GripVertical className="size-3.5 cursor-grab text-muted/70" aria-hidden />
          {icon}
          {label}
        </span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          {move && (
            <>
              <button
                type="button"
                onClick={move.onMoveUp}
                disabled={!move.canMoveUp}
                className="rounded p-1 text-muted hover:bg-paper hover:text-ink disabled:opacity-35"
                aria-label={`Geser ${label.toLowerCase()} ke atas`}
                title="Naikkan posisi blok"
              >
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={move.onMoveDown}
                disabled={!move.canMoveDown}
                className="rounded p-1 text-muted hover:bg-paper hover:text-ink disabled:opacity-35"
                aria-label={`Geser ${label.toLowerCase()} ke bawah`}
                title="Turunkan posisi blok"
              >
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded px-2 py-1 text-brand hover:bg-blush"
            aria-label={`Hapus ${label.toLowerCase()}`}
          >
            <Trash2 className="size-3.5" aria-hidden /> Hapus
          </button>
        </span>
      </div>
      <div className="space-y-3 p-3.5">{children}</div>
    </NodeViewWrapper>
  );
}

export function BlockField({
  label,
  value,
  onChange,
  max = 500,
  placeholder,
  multiline,
  warn,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  multiline?: boolean;
  warn?: boolean;
  rows?: number;
}) {
  const cls = `admin-input mt-1 text-sm ${warn ? "border-amber-500 bg-amber-50" : ""}`;
  return (
    <label className="block text-xs font-semibold text-ink">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder} className={`${cls} py-2`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} className={cls} />
      )}
    </label>
  );
}

export function BlockThumb({ mediaId, alt, className = "" }: { mediaId: string; alt: string; className?: string }) {
  const { media } = useMedia();
  const m = media[mediaId];
  if (!m) return <div className="flex h-36 items-center justify-center rounded bg-warm text-xs text-muted">Gambar tidak ditemukan</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.src} alt={alt || m.alt} className={`max-h-72 w-full rounded bg-warm object-contain ${className}`} loading="lazy" />;
}

export function ToneOptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; swatch?: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-semibold text-ink">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors ${
            value === opt.value ? "border-brand bg-blush text-brand-deep" : "border-line bg-paper text-ink hover:bg-warm"
          }`}
        >
          {opt.swatch && <span aria-hidden className="size-3 rounded-full border border-black/15" style={{ backgroundColor: opt.swatch }} />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
