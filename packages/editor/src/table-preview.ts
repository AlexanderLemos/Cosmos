import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import {
  frontmatterEnd,
  LIVE_PREVIEW_LIMIT,
  selectedLines,
} from './preview-state';

type Node = ReturnType<typeof syntaxTree>['topNode'];
type Inline =
  | string
  | { tag: 'strong' | 'em' | 'code' | 's'; children: Inline[] };
type Cell = { from: number; content: Inline[] };
type Alignment = 'left' | 'center' | 'right';

// Bound DOM work independently of the note's text limit. Larger tables stay Markdown.
const MAX_ROWS = 200;
const MAX_COLUMNS = 32;
const CELL_BUDGET = 2000;

function inline(state: EditorState, node: Node, depth = 0): Inline[] {
  if (depth >= 16) return [state.sliceDoc(node.from, node.to)];
  const parts: Inline[] = [];
  let position = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > position) parts.push(state.sliceDoc(position, child.from));
    const tag = (
      {
        StrongEmphasis: 'strong',
        Emphasis: 'em',
        InlineCode: 'code',
        Strikethrough: 's',
      } as Record<string, 'strong' | 'em' | 'code' | 's'>
    )[child.name];
    if (tag === 'code') {
      let text = state
        .sliceDoc(
          child.firstChild?.to ?? child.from,
          child.lastChild?.from ?? child.to,
        )
        .replaceAll('\\|', '|');
      if (text.startsWith(' ') && text.endsWith(' ') && /[^ ]/.test(text))
        text = text.slice(1, -1);
      parts.push({ tag, children: [text] });
    } else if (tag)
      parts.push({ tag, children: inline(state, child, depth + 1) });
    else if (child.name === 'Escape')
      parts.push(state.sliceDoc(child.from + 1, child.to));
    else if (!['EmphasisMark', 'StrikethroughMark'].includes(child.name))
      parts.push(state.sliceDoc(child.from, child.to));
    position = child.to;
  }
  if (position < node.to) parts.push(state.sliceDoc(position, node.to));
  return parts;
}

function appendInline(parent: HTMLElement, parts: Inline[]) {
  for (const part of parts) {
    if (typeof part === 'string') parent.append(document.createTextNode(part));
    else {
      const child = document.createElement(part.tag);
      appendInline(child, part.children);
      parent.append(child);
    }
  }
}

class TableWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly source: string,
    readonly rows: Cell[][],
    readonly alignments: Alignment[],
    readonly label: string,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return (
      this.from === other.from &&
      this.source === other.source &&
      this.label === other.label
    );
  }
  toDOM(view: EditorView) {
    const root = document.createElement('div');
    root.className = 'cm-live-table';
    root.contentEditable = 'false';
    const table = root.appendChild(document.createElement('table'));
    const caption = table.appendChild(document.createElement('caption'));
    const button = caption.appendChild(document.createElement('button'));
    button.type = 'button';
    button.textContent = this.label;
    const reveal = (position: number) => {
      if (
        view.state.sliceDoc(this.from, this.from + this.source.length) !==
        this.source
      )
        return;
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      view.focus();
    };
    button.onclick = () => reveal(this.rows[0]?.[0]?.from ?? this.from);
    const head = table.appendChild(document.createElement('thead'));
    const body = table.appendChild(document.createElement('tbody'));
    this.rows.forEach((cells, row) => {
      const tr = (row === 0 ? head : body).appendChild(
        document.createElement('tr'),
      );
      for (let column = 0; column < this.alignments.length; column++) {
        const cell = cells[column];
        const element = tr.appendChild(
          document.createElement(row === 0 ? 'th' : 'td'),
        );
        if (row === 0) {
          element.setAttribute('scope', 'col');
          if (!cell?.content.length)
            element.setAttribute('aria-label', String(column + 1));
        }
        element.style.textAlign = this.alignments[column] ?? 'left';
        appendInline(element, cell?.content ?? []);
        element.onclick = () =>
          reveal(cell?.from ?? cells.at(-1)?.from ?? this.from);
      }
    });
    return root;
  }
  ignoreEvent(event: Event) {
    return !(
      event instanceof KeyboardEvent &&
      event.type === 'keydown' &&
      (event.ctrlKey || event.metaKey) &&
      ['s', 'z', 'y'].includes(event.key.toLowerCase())
    );
  }
}

function tables(state: EditorState, label: string): DecorationSet {
  if (state.doc.length > LIVE_PREVIEW_LIMIT) return Decoration.none;
  const excluded = frontmatterEnd(state);
  const active = selectedLines(state);
  const ranges: Range<Decoration>[] = [];
  let remaining = CELL_BUDGET;
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.to <= excluded ||
        ['FencedCode', 'CodeBlock', 'HTMLBlock'].includes(node.name)
      )
        return false;
      if (node.name !== 'Table') return;
      // Nested lists/quotes retain their source indentation and enclosing block layout.
      if (node.node.parent?.name !== 'Document' || active(node.from, node.to))
        return false;
      const rows: Cell[][] = [];
      let alignments: Alignment[] = [];
      for (let row = node.node.firstChild; row; row = row.nextSibling) {
        if (row.name === 'TableDelimiter') {
          alignments = state
            .sliceDoc(row.from, row.to)
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => {
              const value = cell.trim();
              return value.endsWith(':')
                ? value.startsWith(':')
                  ? 'center'
                  : 'right'
                : 'left';
            });
        } else if (row.name === 'TableHeader' || row.name === 'TableRow') {
          const cells: Cell[] = [];
          let start = row.from;
          let first = true;
          let content: Node | null = null;
          for (let child = row.firstChild; child; child = child.nextSibling) {
            if (child.name === 'TableCell') content = child;
            if (child.name === 'TableDelimiter') {
              const leading =
                first && !state.sliceDoc(start, child.from).trim();
              if (!leading)
                cells.push({
                  from: content?.from ?? start,
                  content: content ? inline(state, content) : [],
                });
              start = child.to;
              content = null;
            }
            first = false;
            if (cells.length > MAX_COLUMNS) return false;
          }
          if (content)
            cells.push({ from: content.from, content: inline(state, content) });
          if (cells.length > MAX_COLUMNS) return false;
          rows.push(cells);
          if (rows.length > MAX_ROWS) return false;
        }
      }
      const count = rows.length * alignments.length;
      if (!count || alignments.length > MAX_COLUMNS || count > remaining)
        return false;
      remaining -= count;
      ranges.push(
        Decoration.replace({
          block: true,
          widget: new TableWidget(
            node.from,
            state.sliceDoc(node.from, node.to),
            rows,
            alignments,
            label,
          ),
        }).range(node.from, node.to),
      );
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

export function tablePreview(label: string) {
  return [
    StateField.define<DecorationSet>({
      create: (state) => tables(state, label),
      update(value, transaction) {
        return transaction.docChanged ||
          transaction.selection ||
          syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
          ? tables(transaction.state, label)
          : value;
      },
      provide: (field) => EditorView.decorations.from(field),
    }),
    EditorView.theme({
      '.cm-live-table': {
        overflowX: 'auto',
        padding: '0.5rem 1rem',
        fontFamily: 'var(--font-mono)',
      },
      '.cm-live-table table': {
        borderCollapse: 'collapse',
        width: '100%',
        color: 'var(--text)',
      },
      '.cm-live-table th, .cm-live-table td': {
        border: '1px solid var(--muted)',
        padding: '0.5rem 0.75rem',
        cursor: 'text',
      },
      '.cm-live-table th': { backgroundColor: 'var(--surface)' },
      '.cm-live-table caption': { textAlign: 'left', paddingBottom: '0.4rem' },
      '.cm-live-table button': {
        font: 'inherit',
        color: 'var(--text)',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--muted)',
        borderRadius: '0.25rem',
        padding: '0.25rem 0.5rem',
        cursor: 'pointer',
      },
      '.cm-live-table button:focus-visible': {
        outline: '2px solid var(--text)',
        outlineOffset: '2px',
      },
      '.cm-live-table code': {
        color: 'var(--syntax-link)',
        backgroundColor: 'var(--surface)',
      },
    }),
  ];
}
