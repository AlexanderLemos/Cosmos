import type { EditorState } from '@codemirror/state';

export const LIVE_PREVIEW_LIMIT = 256 * 1024;

export function frontmatterEnd(state: EditorState): number {
  if (state.doc.line(1).text.replace(/^\ufeff/, '') !== '---') return 0;
  for (let i = 2; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (/^(---|\.\.\.)\s*$/.test(line.text)) return line.to;
  }
  return state.doc.length;
}

export function selectedLines(state: EditorState) {
  const selected = state.selection.ranges.map((range) => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.to).to,
  }));
  return (from: number, to: number) =>
    selected.some((range) => from <= range.to && to >= range.from);
}
