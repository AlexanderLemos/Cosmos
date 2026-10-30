import type { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import {
  type ImageSize,
  imageSize,
  imageTarget,
  inspectInlineImage,
} from '@cosmos/core';
import { inCalloutTitle } from './link-preview';

type Node = ReturnType<typeof syntaxTree>['topNode'];
type Image = { src: string; alt: string; size?: ImageSize };
export type ImageLabel =
  | 'showImage'
  | 'hideImage'
  | 'cancelImage'
  | 'imageLoading'
  | 'imageFailed'
  | 'imageUnresolved'
  | 'imageTooLarge'
  | 'imageSource';
export type ImageContext = {
  load: (src: string, current: () => boolean) => Promise<Blob | undefined>;
  available: boolean;
  busy: boolean;
  label: (key: ImageLabel, name: string) => string;
};

function parseImage(
  state: EditorState,
  node: Node,
  references: Set<string>,
): Image | undefined {
  if (
    state.doc.lineAt(node.from).number !== state.doc.lineAt(node.to).number ||
    inCalloutTitle(state, node)
  )
    return;
  const source = state.sliceDoc(node.from, node.to);
  if (node.getChild('URL')) {
    const image = inspectInlineImage(source);
    if (!image || !imageTarget(image.src)) return;
    const separator = image.alt.lastIndexOf('|');
    const size =
      separator < 0 ? undefined : imageSize(image.alt.slice(separator + 1));
    return {
      ...image,
      alt: size ? image.alt.slice(0, separator) : image.alt,
      size,
    };
  }
  const inner = node.getChild('Link');
  if (!inner || inner.getChild('LinkLabel')) return;
  for (let child = inner.firstChild; child; child = child.nextSibling)
    if (child.name !== 'LinkMark') return;
  const label = state
    .sliceDoc(inner.from, inner.to)
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (
    [...references].some(
      (value) => value.replace(/\s+/g, ' ').toLowerCase() === label,
    )
  )
    return;
  const match = /^!\[\[([^[\]\\\n]+)\]\]$/.exec(source);
  if (!match) return;
  const [target, ...suffix] = (match[1] ?? '').split('|');
  if (!target?.trim()) return;
  const src = `cosmos-image:${encodeURIComponent(target.trim())}`;
  if (!imageTarget(src)) return;
  return {
    src,
    alt: target.trim(),
    size: suffix.length === 1 ? imageSize(suffix[0] ?? '') : undefined,
  };
}

const controllers = new WeakMap<HTMLElement, ImageControl>();
class ImageWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly source: string,
    readonly image: Image,
    readonly context: ImageContext,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return (
      this.from === other.from &&
      this.source === other.source &&
      this.context === other.context
    );
  }
  toDOM(view: EditorView) {
    const control = new ImageControl(this, view);
    controllers.set(control.dom, control);
    return control.dom;
  }
  updateDOM(dom: HTMLElement) {
    const control = controllers.get(dom);
    if (!control) return false;
    control.update(this);
    return true;
  }
  destroy(dom: HTMLElement) {
    controllers.get(dom)?.dispose();
    controllers.delete(dom);
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

class ImageControl {
  readonly dom = document.createElement('span');
  readonly image = document.createElement('img');
  readonly toggle = document.createElement('button');
  readonly source = document.createElement('button');
  readonly status = document.createElement('span');
  private generation = 0;
  private disposed = false;
  private url: string | undefined;
  private loading = false;
  private error: ImageLabel | undefined;
  constructor(
    private widget: ImageWidget,
    private view: EditorView,
  ) {
    this.dom.className = 'cm-live-image';
    this.toggle.type = this.source.type = 'button';
    this.source.textContent = '✎';
    this.status.setAttribute('role', 'status');
    const controls = document.createElement('span');
    controls.append(this.toggle, this.source);
    this.dom.append(this.image, controls, this.status);
    this.toggle.onclick = () => {
      if (this.url || this.loading) {
        this.clear();
        this.render();
      } else void this.show();
    };
    this.source.onclick = () => {
      if (!this.currentSource()) return;
      this.view.dispatch({
        selection: { anchor: this.widget.from },
        scrollIntoView: true,
      });
      this.view.focus();
    };
    this.image.onload = () => this.measure();
    this.image.onerror = () => {
      if (!this.url || this.disposed) return;
      this.clear();
      this.error = 'imageFailed';
      this.render();
    };
    this.render();
  }
  private currentSource() {
    return (
      !this.disposed &&
      this.view.state.sliceDoc(this.widget.from, this.widget.to) ===
        this.widget.source
    );
  }
  private measure() {
    if (!this.disposed && this.view.dom.isConnected) this.view.requestMeasure();
  }
  private clear() {
    this.generation++;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    this.loading = false;
    this.error = undefined;
  }
  update(widget: ImageWidget) {
    if (
      widget.image.src !== this.widget.image.src ||
      widget.context.load !== this.widget.context.load
    )
      this.clear();
    this.widget = widget;
    this.render();
  }
  dispose() {
    this.disposed = true;
    this.clear();
    this.image.onload = this.image.onerror = null;
  }
  private render() {
    const { image, context } = this.widget;
    const name = image.alt || imageTarget(image.src)?.path || '';
    this.image.alt = name;
    for (const dimension of ['width', 'height'] as const) {
      const value = image.size?.[dimension];
      if (value === undefined) this.image.removeAttribute(dimension);
      else this.image.setAttribute(dimension, String(value));
    }
    this.image.hidden = !this.url;
    if (this.url) {
      if (this.image.getAttribute('src') !== this.url)
        this.image.src = this.url;
    } else this.image.removeAttribute('src');
    this.toggle.textContent = context.label(
      this.url ? 'hideImage' : this.loading ? 'cancelImage' : 'showImage',
      name,
    );
    this.toggle.disabled =
      !this.url && !this.loading && (context.busy || !context.available);
    this.source.setAttribute('aria-label', context.label('imageSource', name));
    this.source.title = context.label('imageSource', name);
    this.status.textContent = this.error
      ? context.label(this.error, name)
      : this.loading
        ? context.label('imageLoading', name)
        : '';
    this.measure();
  }
  private async show() {
    if (
      !this.currentSource() ||
      this.widget.context.busy ||
      !this.widget.context.available
    )
      return;
    const generation = ++this.generation;
    const current = () => !this.disposed && this.generation === generation;
    this.loading = true;
    this.error = undefined;
    this.render();
    try {
      const blob = await this.widget.context.load(
        this.widget.image.src,
        current,
      );
      if (!blob || !current()) return;
      this.url = URL.createObjectURL(blob);
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : String(error);
      this.error = message.includes('IMAGE_TOO_LARGE')
        ? 'imageTooLarge'
        : message.includes('IMAGE_UNRESOLVED')
          ? 'imageUnresolved'
          : 'imageFailed';
    } finally {
      if (current()) {
        this.loading = false;
        this.render();
      }
    }
  }
}

export function imageDecoration(
  state: EditorState,
  node: Node,
  references: Set<string>,
  context: ImageContext,
): Decoration | undefined {
  const image = parseImage(state, node, references);
  return image
    ? Decoration.replace({
        widget: new ImageWidget(
          node.from,
          node.to,
          state.sliceDoc(node.from, node.to),
          image,
          context,
        ),
      })
    : undefined;
}
export const imageTheme = EditorView.theme({
  '.cm-live-image': {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: '100%',
    gap: '0.4rem',
    verticalAlign: 'middle',
  },
  '.cm-live-image img': {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
  },
  '.cm-live-image button': {
    font: 'inherit',
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--muted)',
    borderRadius: '0.25rem',
    padding: '0.1rem 0.4rem',
    cursor: 'pointer',
  },
  '.cm-live-image button:focus-visible': {
    outline: '2px solid var(--text)',
    outlineOffset: '2px',
  },
});
