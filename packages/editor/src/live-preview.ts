import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

import {
  frontmatterEnd,
  LIVE_PREVIEW_LIMIT,
  selectedLines,
} from './preview-state';

export { LIVE_PREVIEW_LIMIT } from './preview-state';

class TaskCheckbox extends WidgetType {
  constructor(
    readonly from: number,
    readonly marker: string,
    readonly label: string,
    readonly disabled: boolean,
  ) {
    super();
  }
  eq(other: TaskCheckbox) {
    return (
      this.from === other.from &&
      this.marker === other.marker &&
      this.label === other.label &&
      this.disabled === other.disabled
    );
  }
  toDOM(view: EditorView) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-live-task';
    this.updateDOM(input, view);
    return input;
  }
  updateDOM(dom: HTMLElement, view: EditorView) {
    const input = dom as HTMLInputElement;
    input.checked = this.marker !== '[ ]';
    input.disabled = this.disabled;
    input.setAttribute('aria-label', this.label);
    input.onchange = () => {
      // Recheck access and source at activation, including during a save/refresh.
      if (
        view.state.readOnly ||
        !view.state.facet(EditorView.editable) ||
        view.state.sliceDoc(this.from, this.from + 3) !== this.marker
      ) {
        input.checked = this.marker !== '[ ]';
        return;
      }
      view.dispatch({
        changes: {
          from: this.from + 1,
          to: this.from + 2,
          insert: input.checked ? 'x' : ' ',
        },
        annotations: isolateHistory.of('full'),
        userEvent: 'input.task',
      });
    };
    return true;
  }
  ignoreEvent(event: Event) {
    // Keep native checkbox interaction, but retain editor save/undo shortcuts.
    return !(
      event instanceof KeyboardEvent &&
      event.type === 'keydown' &&
      (event.ctrlKey || event.metaKey) &&
      ['s', 'z', 'y'].includes(event.key.toLowerCase())
    );
  }
}

/** Decorations and task widgets. All edits go through the original document. */
function decorate(view: EditorView, taskLabel: string): DecorationSet {
  const { state } = view;
  if (state.doc.length > LIVE_PREVIEW_LIMIT || view.composing)
    return Decoration.none;
  const excluded = frontmatterEnd(state);
  const active = selectedLines(state);
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
        if (node.to <= excluded) return false;
        if (
          ['FencedCode', 'CodeBlock', 'HTMLBlock', 'Table'].includes(node.name)
        )
          return false;
        if (node.name === 'TaskMarker' && !active(node.from, node.to)) {
          const line = state.doc.lineAt(node.to);
          const text = state.sliceDoc(node.to, line.to).trim();
          add(
            node.from,
            node.to,
            'task',
            Decoration.replace({
              widget: new TaskCheckbox(
                node.from,
                state.sliceDoc(node.from, node.to),
                text ? `${taskLabel}: ${text}` : taskLabel,
                state.readOnly || !state.facet(EditorView.editable),
              ),
            }),
          );
          return false;
        }
        const heading = /^ATXHeading([1-6])$/.exec(node.name);
        const kind = heading
          ? `heading-${heading[1]}`
          : (
              {
                StrongEmphasis: 'strong',
                Emphasis: 'emphasis',
                InlineCode: 'code',
                Strikethrough: 'strike',
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
          if (
            ![
              'HeaderMark',
              'EmphasisMark',
              'CodeMark',
              'StrikethroughMark',
            ].includes(child.name)
          )
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

export const livePreview = (taskLabel: string) => [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view, taskLabel);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          update.focusChanged ||
          update.startState.readOnly !== update.state.readOnly ||
          update.startState.facet(EditorView.editable) !==
            update.state.facet(EditorView.editable) ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        )
          this.decorations = decorate(update.view, taskLabel);
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
    '.cm-live-strike': { textDecoration: 'line-through' },
    '.cm-live-task': {
      margin: '0 0.2em',
      verticalAlign: 'middle',
      cursor: 'pointer',
    },
    '.cm-live-task:disabled': { cursor: 'default' },
    '.cm-live-task:focus-visible': {
      outline: '2px solid var(--text)',
      outlineOffset: '2px',
    },
    '.cm-live-code': {
      backgroundColor: 'var(--surface)',
      borderRadius: '0.2em',
      color: 'var(--syntax-link)',
    },
  }),
];
