import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { calloutMarker, calloutType } from '@cosmos/core/callout-marker';

type Node = ReturnType<typeof syntaxTree>['topNode'];
export type CalloutLabels = { source: string; types: Record<string, string> };

class CalloutSource extends WidgetType {
  constructor(
    readonly from: number,
    readonly marker: string,
    readonly type: string,
    readonly label: string,
  ) {
    super();
  }
  eq(other: CalloutSource) {
    return (
      this.from === other.from &&
      this.marker === other.marker &&
      this.type === other.type &&
      this.label === other.label
    );
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-live-callout-source';
    button.textContent = this.type;
    button.setAttribute('aria-label', `${this.label}: ${this.type}`);
    button.title = this.label;
    button.onclick = () => {
      if (
        view.state.sliceDoc(this.from, this.from + this.marker.length) !==
        this.marker
      )
        return;
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    };
    return button;
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

/** Only flat, explicitly quoted blocks; complex layouts retain their Markdown. */
export function decorateCallout(
  state: EditorState,
  node: Node,
  active: (from: number, to: number) => boolean,
  labels: CalloutLabels,
  references: Set<string>,
  add: (from: number, to: number, kind: string, decoration: Decoration) => void,
): boolean {
  if (node.parent?.name !== 'Document') return false;
  const paragraph = node.getChild('Paragraph');
  const first = node.firstChild?.nextSibling;
  if (!paragraph || first?.from !== paragraph.from) return false;
  const header = state.doc.lineAt(paragraph.from);
  const marker = calloutMarker.exec(state.sliceDoc(paragraph.from, header.to));
  if (!marker) return false;
  const last = state.doc.lineAt(node.to);
  if (last.number - header.number >= 200) return false;
  const marks: Node[] = [];
  const stack: Node[] = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    if (
      current !== node &&
      ['Blockquote', 'FencedCode', 'CodeBlock', 'HTMLBlock', 'Table'].includes(
        current.name,
      )
    )
      return false;
    if (
      current.from <= header.to &&
      current.to > header.to &&
      ['InlineCode', 'Link', 'Image'].includes(current.name)
    )
      return false;
    if (current.name === 'QuoteMark') marks.push(current);
    for (let child = current.firstChild; child; child = child.nextSibling)
      stack.push(child);
  }
  // Lazy continuation and reference-defined markers remain literal.
  if (marks.length !== last.number - header.number + 1) return false;
  if (references.has(`[!${marker[1]?.toLowerCase()}]`)) return false;
  // Keep the entire source visible while any line in this callout is selected.
  if (active(node.from, node.to)) return true;
  for (let line = header.number; line <= last.number; line++) {
    const start = state.doc.line(line).from;
    add(
      start,
      start,
      'callout-line',
      Decoration.line({
        class:
          line === header.number
            ? 'cm-live-callout cm-live-callout-title'
            : 'cm-live-callout',
      }),
    );
  }
  for (const mark of marks) {
    const end =
      state.doc.sliceString(mark.to, mark.to + 1) === ' '
        ? mark.to + 1
        : mark.to;
    add(mark.from, end, 'callout-quote', Decoration.replace({}));
  }
  const type = calloutType(marker[1] ?? 'note');
  add(
    paragraph.from,
    paragraph.from + marker[0].length,
    'callout-source',
    Decoration.replace({
      widget: new CalloutSource(
        paragraph.from,
        marker[0],
        labels.types[type] ?? type,
        labels.source,
      ),
    }),
  );
  return false;
}

export const calloutTheme = EditorView.theme({
  '.cm-live-callout': {
    borderLeft: '3px solid var(--orichalcum)',
    backgroundColor: 'var(--surface)',
    paddingLeft: '0.75rem',
    paddingRight: '0.75rem',
  },
  '.cm-live-callout-title': {
    fontWeight: '700',
    paddingTop: '0.4rem',
    paddingBottom: '0.4rem',
  },
  '.cm-live-callout-source': {
    font: 'inherit',
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--muted)',
    borderRadius: '0.25rem',
    padding: '0.1rem 0.4rem',
    cursor: 'pointer',
  },
  '.cm-live-callout-source:focus-visible': {
    outline: '2px solid var(--text)',
    outlineOffset: '2px',
  },
});

export function calloutReferences(
  state: EditorState,
  excluded: number,
): Set<string> {
  const references = new Set<string>();
  syntaxTree(state).iterate({
    enter(node) {
      if (node.to <= excluded) return false;
      if (node.name !== 'LinkReference') return;
      const label = node.node.getChild('LinkLabel');
      if (label)
        references.add(state.sliceDoc(label.from, label.to).toLowerCase());
      return false;
    },
  });
  return references;
}
