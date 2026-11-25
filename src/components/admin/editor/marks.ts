"use client";

import { Extension, Mark, mergeAttributes, type CommandProps } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

import {
  EDITORIAL_FONT_SIZES,
  normalizeDividerVariant,
  normalizeFontSize,
  normalizeHighlightColor,
  normalizeTextColor,
  type DividerVariant,
  type EditorialFontSize,
} from "@/lib/editorial-tokens";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    editorialTypography: {
      toggleDropCap: () => ReturnType;
      setDropCap: (active: boolean) => ReturnType;
      insertDividerVariant: (variant?: DividerVariant) => ReturnType;
      setEditorialColor: (color: string | null) => ReturnType;
      setEditorialFontSize: (fontSize: EditorialFontSize | null) => ReturnType;
      setEditorialHighlight: (color: string | null) => ReturnType;
      unsetEditorialHighlight: () => ReturnType;
    };
  }
}

const FONT_SIZE_SCALE: Record<EditorialFontSize, string> = Object.fromEntries(
  EDITORIAL_FONT_SIZES.filter((x) => x.id !== "md").map((x) => [x.id, x.scale]),
) as Record<EditorialFontSize, string>;

export const EditorialDropCapExtension = Extension.create({
  name: "editorialDropCap",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          dropCap: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute("data-drop-cap") === "true",
            renderHTML: (attrs) => (attrs.dropCap ? { "data-drop-cap": "true" } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      toggleDropCap:
        () =>
        ({ editor, commands }: CommandProps) => {
          const active = Boolean(editor.getAttributes("paragraph").dropCap);
          return commands.updateAttributes("paragraph", { dropCap: !active });
        },
      setDropCap:
        (active: boolean) =>
        ({ commands }: CommandProps) =>
          commands.updateAttributes("paragraph", { dropCap: active }),
    };
  },
});

export const EditorialDividerExtension = Extension.create({
  name: "editorialDividerStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["horizontalRule"],
        attributes: {
          variant: {
            default: "editorial",
            parseHTML: (el) => normalizeDividerVariant(el.getAttribute("data-variant")),
            renderHTML: (attrs) => {
              const variant = normalizeDividerVariant(attrs.variant);
              return variant !== "editorial" ? { "data-variant": variant } : {};
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      insertDividerVariant:
        (variant: DividerVariant = "editorial") =>
        ({ commands }: CommandProps) =>
          commands.insertContent([
            { type: "horizontalRule", ...(variant !== "editorial" ? { attrs: { variant } } : {}) },
            { type: "paragraph" },
          ]),
    };
  },
});

export const EditorialTextStyleMark = Mark.create({
  name: "textStyle",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => normalizeTextColor(el.getAttribute("data-editorial-color") ?? el.style.color),
      },
      fontSize: {
        default: null,
        parseHTML: (el) => normalizeFontSize(el.getAttribute("data-font-size")),
      },
    };
  },
  parseHTML() {
    return [
      { tag: "span[data-editorial-color]" },
      { tag: "span[data-font-size]" },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const color = normalizeTextColor(HTMLAttributes.color);
    const fontSize = normalizeFontSize(HTMLAttributes.fontSize);
    const styles: string[] = [];
    if (color) styles.push(`color: ${color}`);
    if (fontSize) styles.push(`font-size: ${FONT_SIZE_SCALE[fontSize]}`);
    return [
      "span",
      mergeAttributes(
        color ? { "data-editorial-color": color } : {},
        fontSize ? { "data-font-size": fontSize } : {},
        styles.length ? { style: styles.join("; ") } : {},
      ),
      0,
    ];
  },
  addCommands() {
    return {
      setEditorialColor:
        (rawColor: string | null) =>
        ({ editor, chain }: CommandProps) => {
          const color = normalizeTextColor(rawColor);
          const current = editor.getAttributes("textStyle") as { color?: unknown; fontSize?: unknown };
          const fontSize = normalizeFontSize(current.fontSize);
          if (!color && !fontSize) return chain().focus().unsetMark("textStyle").run();
          return chain().focus().setMark("textStyle", { color, fontSize }).run();
        },
      setEditorialFontSize:
        (rawSize: EditorialFontSize | null) =>
        ({ editor, chain }: CommandProps) => {
          const fontSize = normalizeFontSize(rawSize);
          const current = editor.getAttributes("textStyle") as { color?: unknown };
          const color = normalizeTextColor(current.color);
          if (!color && !fontSize) return chain().focus().unsetMark("textStyle").run();
          return chain().focus().setMark("textStyle", { color, fontSize }).run();
        },
    };
  },
});

export const EditorialHighlightMark = Mark.create({
  name: "highlight",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => normalizeHighlightColor(el.getAttribute("data-editorial-highlight") ?? el.style.backgroundColor),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-editorial-highlight]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const color = normalizeHighlightColor(HTMLAttributes.color);
    if (!color) return ["span", 0];
    return [
      "mark",
      mergeAttributes({
        "data-editorial-highlight": color,
        style: `background-color: ${color}; color: #252525`,
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setEditorialHighlight:
        (rawColor: string | null) =>
        ({ chain }: CommandProps) => {
          const color = normalizeHighlightColor(rawColor);
          if (!color) return chain().focus().unsetMark("highlight").run();
          return chain().focus().setMark("highlight", { color }).run();
        },
      unsetEditorialHighlight:
        () =>
        ({ chain }: CommandProps) =>
          chain().focus().unsetMark("highlight").run(),
    };
  },
});

// ─── Top-level block reordering helpers ──────────────────────────────────────

export function topLevelIndexFromPos(doc: PMNode, pos: number): number | null {
  let found: number | null = null;
  doc.forEach((_child, offset, index) => {
    if (offset === pos) found = index;
  });
  if (found !== null) return found;
  if (pos >= 0 && pos <= doc.content.size) {
    const $pos = doc.resolve(pos);
    if ($pos.depth >= 1) return $pos.index(0);
  }
  return null;
}

export function activeTopLevelIndex(editor: Editor): number | null {
  const { selection, doc } = editor.state;
  if (selection instanceof NodeSelection && selection.node) {
    const idx = topLevelIndexFromPos(doc, selection.from);
    if (idx !== null) return idx;
  }
  const $from = selection.$from;
  return $from.depth >= 1 ? $from.index(0) : null;
}

export function canMoveTopLevelIndex(doc: PMNode, index: number | null, direction: -1 | 1): boolean {
  if (index === null) return false;
  const target = index + direction;
  return target >= 0 && target < doc.childCount;
}

export function moveTopLevelBlock(editor: Editor, index: number | null, direction: -1 | 1): boolean {
  const { state, view } = editor;
  const { doc } = state;
  if (!canMoveTopLevelIndex(doc, index, direction) || index === null) return false;

  const lo = Math.min(index, index + direction);
  const first = doc.child(lo);
  const second = doc.child(lo + 1);
  let start = 0;
  for (let i = 0; i < lo; i++) start += doc.child(i).nodeSize;
  const end = start + first.nodeSize + second.nodeSize;

  const tr = state.tr.replaceWith(start, end, [second, first]);
  const newNodePos = direction === -1 ? start : start + second.nodeSize;
  const movedNode = tr.doc.nodeAt(newNodePos);
  if (movedNode?.isAtom) {
    tr.setSelection(NodeSelection.create(tr.doc, newNodePos));
  } else {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(newNodePos + 1, tr.doc.content.size))));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}
