import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

export const LIVE_PREVIEW_LIMIT = 256 * 1024;

/** Display-only decorations. All edits still go through the original document. */
function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  if (state.doc.length > LIVE_PREVIEW_LIMIT || view.composing)
    return Decoration.none;
  let frontmatterEnd = 0;
  if (state.doc.line(1).text.replace(/^\ufeff/, '') === '---') {
    frontmatterEnd = state.doc.length;
    for (let i = 2; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      if (/^(---|\.\.\.)\s*$/.test(line.text)) {
        frontmatterEnd = line.to;
        break;
      }
    }
  }
  const selected = state.selection.ranges.map((range) => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.to).to,
  }));
  const active = (from: number, to: number) =>
    selected.some((range) => from <= range.to && to >= range.from);
  const ranges: Range<Decoration>[] = [];
  const seen = new Set<string>();
  const add = (
    from: number,
    to: number,
    kind: string,
    decoration: Decoration,
  ) => {
    const key = `${from}:${to}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    ranges.push(decoration.range(from, to));
  };
  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        if (node.to <= frontmatterEnd) return false;
        if (['FencedCode', 'CodeBlock', 'HTMLBlock'].includes(node.name))
          return false;
        const heading = /^ATXHeading([1-6])$/.exec(node.name);
        const kind = heading
          ? `heading-${heading[1]}`
          : (
              {
                StrongEmphasis: 'strong',
                Emphasis: 'emphasis',
                InlineCode: 'code',
              } as Record<string, string>
            )[node.name];
        if (
          !kind ||
          state.doc.lineAt(node.from).number !==
            state.doc.lineAt(node.to).number
        )
          return;
        if (heading) {
          const start = state.doc.lineAt(node.from).from;
          add(
            start,
            start,
            kind,
            Decoration.line({ class: `cm-live-${kind}` }),
          );
        } else {
          add(
            node.from,
            node.to,
            kind,
            Decoration.mark({ class: `cm-live-${kind}` }),
          );
        }
        if (active(node.from, node.to)) return;
        for (
          let child = node.node.firstChild;
          child;
          child = child.nextSibling
        ) {
          if (!['HeaderMark', 'EmphasisMark', 'CodeMark'].includes(child.name))
            continue;
          let end = child.to;
          if (heading && child.from === node.from) {
            const space = /^[ \t]+/.exec(state.sliceDoc(end, node.to));
            end += space?.[0].length ?? 0;
          }
          add(child.from, end, 'marker', Decoration.replace({}));
        }
      },
    });
  }
  return Decoration.set(ranges, true);
}

export const livePreview = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          update.focusChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        )
          this.decorations = decorate(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
  EditorView.theme({
    '.cm-live-heading-1': { fontSize: '1.8em', fontWeight: '700' },
    '.cm-live-heading-2': { fontSize: '1.5em', fontWeight: '700' },
    '.cm-live-heading-3': { fontSize: '1.3em', fontWeight: '700' },
    '.cm-live-heading-4, .cm-live-heading-5, .cm-live-heading-6': {
      fontSize: '1.1em',
      fontWeight: '700',
    },
    '.cm-live-strong': { fontWeight: '700' },
    '.cm-live-emphasis': { fontStyle: 'italic' },
    '.cm-live-code': {
      backgroundColor: 'var(--surface)',
      borderRadius: '0.2em',
      color: 'var(--syntax-link)',
    },
  }),
];
