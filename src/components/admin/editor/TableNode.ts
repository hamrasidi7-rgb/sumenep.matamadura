"use client";

// Table nodes for the article editor. Ported from Busacare
// components/admin/editor/article-table-node.ts (custom table node on
// prosemirror-tables: insert/add/delete rows and columns, header row, Tab
// navigation, fixTables, and turning pasted "| a | b |" lines into a table).
// SUMENEP additions: `caption` and `source` attributes on the table, which the
// public table block shows above and below the grid.

import { Node, callOrReturn, getExtensionField, mergeAttributes, type CommandProps } from "@tiptap/core";
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  tableEditing,
  toggleHeaderRow,
} from "@tiptap/pm/tables";

import { isPipeRow, tableFromPipeRows } from "./pipe-table";

declare module "@tiptap/core" {
  interface NodeConfig<Options, Storage> {
    /** prosemirror-tables role of the node ("table", "row", "cell", "header_cell"). */
    tableRole?: string | ((this: { name: string; options: Options; storage: Storage }) => string);
  }
  interface Commands<ReturnType> {
    articleTable: {
      insertTable: (options?: { rows?: number; cols?: number; withHeaderRow?: boolean }) => ReturnType;
      addColumnBefore: () => ReturnType;
      addColumnAfter: () => ReturnType;
      deleteColumn: () => ReturnType;
      addRowBefore: () => ReturnType;
      addRowAfter: () => ReturnType;
      deleteRow: () => ReturnType;
      deleteTable: () => ReturnType;
      toggleHeaderRow: () => ReturnType;
    };
  }
}

function emptyTable(schema: Schema, rows = 3, cols = 3, withHeaderRow = true): PMNode | null {
  const { table, tableRow, tableHeader, tableCell, paragraph } = schema.nodes;
  if (!table || !tableRow || !tableHeader || !tableCell || !paragraph) return null;
  const rowNodes: PMNode[] = [];
  for (let r = 0; r < rows; r++) {
    const type = withHeaderRow && r === 0 ? tableHeader : tableCell;
    const cells: PMNode[] = [];
    for (let c = 0; c < cols; c++) {
      const p = paragraph.createAndFill();
      cells.push(type.create(null, p ? [p] : []));
    }
    rowNodes.push(tableRow.create(null, cells));
  }
  return table.create({ caption: "", source: "" }, rowNodes);
}

/** Lines of one paragraph, split at hard breaks and newlines (pasted text). */
function paragraphLines(node: PMNode): string[] {
  const lines: string[] = [""];
  node.forEach((child) => {
    if (child.type.name === "hardBreak") lines.push("");
    else if (child.isText && child.text) {
      const parts = child.text.split(/\r?\n/);
      lines[lines.length - 1] += parts[0];
      for (let i = 1; i < parts.length; i++) lines.push(parts[i]);
    } else lines[lines.length - 1] += child.textContent;
  });
  return lines.map((l) => l.trim()).filter(Boolean);
}

function mixedLinesToNodes(schema: Schema, lines: string[]): PMNode[] {
  const out: PMNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isPipeRow(lines[i])) {
      const group = [lines[i]];
      while (i + 1 < lines.length && isPipeRow(lines[i + 1])) group.push(lines[++i]);
      const json = tableFromPipeRows(group);
      if (json) {
        out.push(schema.nodeFromJSON(json));
        i++;
        continue;
      }
    }
    out.push(schema.nodes.paragraph.create(null, lines[i] ? [schema.text(lines[i])] : []));
    i++;
  }
  return out;
}

const pipePasteKey = new PluginKey("pipeTablePaste");

function pipeTablePastePlugin(): Plugin {
  return new Plugin({
    key: pipePasteKey,
    props: {
      // Keep line breaks between pasted "|…|" rows (the HTML parser would merge them).
      transformPastedHTML: (html) => html.replace(/\|\s*\r?\n\s*\|/g, "|<br>|"),
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const blocks: { node: PMNode; pos: number }[] = [];
      state.doc.forEach((node, offset) => blocks.push({ node, pos: offset }));
      const replacements: { from: number; to: number; nodes: PMNode[] }[] = [];
      let i = 0;
      while (i < blocks.length) {
        const item = blocks[i];
        if (item.node.type.name === "paragraph") {
          const lines = paragraphLines(item.node);
          if (lines.length === 1 && isPipeRow(lines[0])) {
            const group = [lines[0]];
            let end = i;
            while (end + 1 < blocks.length && blocks[end + 1].node.type.name === "paragraph") {
              const next = paragraphLines(blocks[end + 1].node);
              if (next.length !== 1 || !isPipeRow(next[0])) break;
              group.push(next[0]);
              end++;
            }
            const json = tableFromPipeRows(group);
            if (json) {
              replacements.push({ from: item.pos, to: blocks[end].pos + blocks[end].node.nodeSize, nodes: [state.schema.nodeFromJSON(json)] });
              i = end + 1;
              continue;
            }
          } else if (lines.length >= 2 && lines.filter(isPipeRow).length >= 2) {
            const nodes = mixedLinesToNodes(state.schema, lines);
            if (nodes.some((n) => n.type.name === "table")) {
              replacements.push({ from: item.pos, to: item.pos + item.node.nodeSize, nodes });
              i++;
              continue;
            }
          }
        }
        i++;
      }
      if (!replacements.length) return null;
      const tr = state.tr;
      for (let k = replacements.length - 1; k >= 0; k--) tr.replaceWith(replacements[k].from, replacements[k].to, Fragment.fromArray(replacements[k].nodes));
      return tr.docChanged ? tr : null;
    },
  });
}

function cellAttributes() {
  return {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  };
}

export const TableNode = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  tableRole: "table",
  isolating: true,

  extendNodeSchema(extension) {
    const context = { name: extension.name, options: extension.options, storage: extension.storage };
    return { tableRole: callOrReturn(getExtensionField(extension, "tableRole", context)) };
  },

  addAttributes() {
    return { caption: { default: "" }, source: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]];
  },

  addCommands() {
    return {
      insertTable:
        ({ rows = 3, cols = 3, withHeaderRow = true } = {}) =>
        ({ tr, dispatch, editor }: CommandProps) => {
          const node = emptyTable(editor.schema, rows, cols, withHeaderRow);
          if (!node) return false;
          if (dispatch) {
            const offset = tr.selection.from + 1;
            tr.replaceSelectionWith(node).scrollIntoView();
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(offset, tr.doc.content.size))));
            dispatch(tr);
          }
          return true;
        },
      addColumnBefore: () => ({ state, dispatch }: CommandProps) => addColumnBefore(state, dispatch),
      addColumnAfter: () => ({ state, dispatch }: CommandProps) => addColumnAfter(state, dispatch),
      deleteColumn: () => ({ state, dispatch }: CommandProps) => deleteColumn(state, dispatch),
      addRowBefore: () => ({ state, dispatch }: CommandProps) => addRowBefore(state, dispatch),
      addRowAfter: () => ({ state, dispatch }: CommandProps) => addRowAfter(state, dispatch),
      deleteRow: () => ({ state, dispatch }: CommandProps) => deleteRow(state, dispatch),
      deleteTable: () => ({ state, dispatch }: CommandProps) => deleteTable(state, dispatch),
      toggleHeaderRow: () => ({ state, dispatch }: CommandProps) => toggleHeaderRow(state, dispatch),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.command(({ state, dispatch }) => goToNextCell(1)(state, dispatch)),
      "Shift-Tab": () => this.editor.commands.command(({ state, dispatch }) => goToNextCell(-1)(state, dispatch)),
    };
  },

  addProseMirrorPlugins() {
    return [
      tableEditing(),
      pipeTablePastePlugin(),
      new Plugin({ appendTransaction: (_trs, oldState, newState) => fixTables(newState, oldState) }),
    ];
  },
});

export const TableRowNode = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)*",
  tableRole: "row",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", mergeAttributes(HTMLAttributes), 0],
});

export const TableHeaderNode = Node.create({
  name: "tableHeader",
  content: "paragraph+",
  tableRole: "header_cell",
  isolating: true,
  addAttributes: cellAttributes,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", mergeAttributes(HTMLAttributes), 0],
});

export const TableCellNode = Node.create({
  name: "tableCell",
  content: "paragraph+",
  tableRole: "cell",
  isolating: true,
  addAttributes: cellAttributes,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", mergeAttributes(HTMLAttributes), 0],
});
