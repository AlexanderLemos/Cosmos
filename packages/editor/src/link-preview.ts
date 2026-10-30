import type { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { inspectMarkdown, pdfTarget, previewLink } from '@cosmos/core';
import { calloutMarker } from '@cosmos/core/callout-marker';

type Node = ReturnType<typeof syntaxTree>['topNode'];
export type LinkContext = {
  path: string;
  paths: string[];
  busy: boolean;
  sourceLabel: string;
  unresolvedLabel: string;
  pdfLabel: string;
  pdfAvailable: boolean;
};
export type OpenVisualLink = (url: string, restoreFocus: () => void) => void;
type ParsedLink = { from: number; to: number; url: string; text: string };
const referenceKey = (value: string) =>
  value.replace(/\s+/g, ' ').toLowerCase();

/** Inline destinations and simple wiki aliases only; all other syntax stays raw. */
export function visualLink(
  state: EditorState,
  node: Node,
  references: Set<string>,
  allowEmbed = false,
): ParsedLink | undefined {
  if (node.name === 'Image') {
    const inner = node.getChild('Link');
    const link = inner ? visualLink(state, inner, references, true) : undefined;
    // Only replace a complete PDF embed, never a link inside an image label.
    return link?.url.startsWith('cosmos-pdf:') &&
      link.from === node.from &&
      link.to === node.to
      ? link
      : undefined;
  }
  let from = node.from;
  let to = node.to;
  if (state.doc.lineAt(from).number !== state.doc.lineAt(to).number) return;
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name !== 'Blockquote') continue;
    const paragraph = ancestor.getChild('Paragraph');
    if (!paragraph) continue;
    const header = state.doc.lineAt(paragraph.from);
    if (
      from <= header.to &&
      calloutMarker.test(state.sliceDoc(paragraph.from, header.to))
    )
      return;
  }
  if (node.getChild('URL')) {
    const parsed = inspectMarkdown(state.sliceDoc(from, to)).links[0];
    if (parsed?.text)
      return { from, to, url: parsed.destination, text: parsed.text };
    return;
  }
  if (
    from < 1 ||
    to >= state.doc.length ||
    state.sliceDoc(from - 1, from) !== '[' ||
    state.sliceDoc(to, to + 1) !== ']' ||
    node.getChild('LinkLabel')
  )
    return;
  for (let child = node.firstChild; child; child = child.nextSibling)
    if (child.name !== 'LinkMark') return;
  from--;
  to++;
  const embed = state.sliceDoc(Math.max(0, from - 1), from) === '!';
  if (embed && !allowEmbed) return;
  let escapes = 0;
  for (let i = from - 1; i >= 0 && state.sliceDoc(i, i + 1) === '\\'; i--)
    escapes++;
  if (escapes % 2 || /^[([]/.test(state.sliceDoc(to, to + 1))) return;
  const raw = state.sliceDoc(from, to);
  const match = /^\[\[([^[\]\\\n]+)\]\]$/.exec(raw);
  if (!match) return;
  const label = state.sliceDoc(node.from, node.to);
  if (
    [...references].some(
      (reference) => referenceKey(reference) === referenceKey(label),
    )
  )
    return;
  const [target, ...alias] = (match[1] ?? '').split('|');
  if (!target?.trim()) return;
  const pdf = `cosmos-pdf:${encodeURIComponent(target.trim())}`;
  const isPdf = !!pdfTarget(pdf);
  if (embed) {
    if (!isPdf) return;
    from--;
  }
  return {
    from,
    to,
    url: isPdf ? pdf : `cosmos-note:${encodeURIComponent(target.trim())}`,
    text: alias.join('|') || target,
  };
}

class NoteLink extends WidgetType {
  constructor(
    readonly link: ParsedLink,
    readonly source: string,
    readonly context: LinkContext,
    readonly open: OpenVisualLink,
    readonly unresolved: boolean,
    readonly pdf: boolean,
  ) {
    super();
  }
  eq(other: NoteLink) {
    return (
      this.link.from === other.link.from &&
      this.source === other.source &&
      this.context === other.context &&
      this.open === other.open &&
      this.pdf === other.pdf &&
      this.unresolved === other.unresolved
    );
  }
  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-live-link';
    for (let i = 0; i < 2; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      span.append(button);
    }
    this.updateDOM(span, view);
    return span;
  }
  updateDOM(dom: HTMLElement, view: EditorView) {
    const [link, source] = Array.from(dom.children) as HTMLButtonElement[];
    if (!link || !source) return false;
    link.className = 'cm-live-link-open';
    link.textContent = this.pdf
      ? `${this.context.pdfLabel}: ${this.link.text}`
      : this.link.text;
    link.disabled =
      this.context.busy ||
      this.unresolved ||
      (this.pdf && !this.context.pdfAvailable);
    link.title = this.unresolved
      ? this.context.unresolvedLabel
      : this.link.text;
    if (this.unresolved)
      link.textContent += ` · ${this.context.unresolvedLabel}`;
    const current = () =>
      view.state.sliceDoc(this.link.from, this.link.to) === this.source;
    link.onclick = () => {
      if (!link.disabled && current())
        this.open(this.link.url, () => {
          if (link.isConnected) link.focus();
          else if (view.dom.isConnected) view.focus();
        });
    };
    source.className = 'cm-live-link-source';
    source.textContent = '✎';
    source.setAttribute(
      'aria-label',
      `${this.context.sourceLabel}: ${this.link.text}`,
    );
    source.title = this.context.sourceLabel;
    source.onclick = () => {
      if (!current()) return;
      view.dispatch({
        selection: { anchor: this.link.from },
        scrollIntoView: true,
      });
      view.focus();
    };
    return true;
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

export function linkDecoration(
  state: EditorState,
  link: ParsedLink,
  context: LinkContext,
  open: OpenVisualLink,
): Decoration | undefined {
  const pdf = !!pdfTarget(link.url);
  const target = previewLink(link.url, context.path, context.paths);
  if (!pdf && target.kind === 'external') return;
  // Other attachments and protocols retain their source. PDFs load only on click.
  try {
    const raw = link.url.startsWith('cosmos-note:')
      ? decodeURIComponent(link.url.slice(12))
      : decodeURIComponent(link.url);
    const path = raw.split('#')[0] ?? '';
    if (
      !pdf &&
      (/^[a-z][a-z\d+.-]*:|^\/\//i.test(path) ||
        (target.kind !== 'note' && /\.(?!md$)[^./]+$/i.test(path)))
    )
      return;
  } catch {
    return;
  }
  return Decoration.replace({
    widget: new NoteLink(
      link,
      state.sliceDoc(link.from, link.to),
      context,
      open,
      !pdf && target.kind !== 'note',
      pdf,
    ),
  });
}

export const linkTheme = EditorView.theme({
  '.cm-live-link button': {
    font: 'inherit',
    padding: '0 0.15em',
    border: 'none',
    background: 'transparent',
    color: 'var(--syntax-link)',
    cursor: 'pointer',
  },
  '.cm-live-link-open': { textDecoration: 'underline' },
  '.cm-live-link button:disabled': { cursor: 'default', color: 'var(--muted)' },
  '.cm-live-link button:focus-visible': {
    outline: '2px solid var(--text)',
    outlineOffset: '2px',
  },
});
