import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { Strikethrough, TaskList } from '@lezer/markdown';
import { useEffect, useRef } from 'react';
import { livePreview } from './live-preview';

export { LIVE_PREVIEW_LIMIT } from './live-preview';

export function MarkdownEditor({
  initialValue,
  onChange,
  onSave,
  readOnly,
  label,
  taskLabel,
  visual = false,
}: {
  initialValue: string;
  onChange: (text: string) => void;
  onSave: () => void;
  readOnly: boolean;
  label: string;
  taskLabel: string;
  visual?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  const access = useRef(new Compartment());
  const initial = useRef(initialValue);
  const raw = useRef(initialValue);
  const attributes = useRef(new Compartment());
  const presentation = useRef(new Compartment());
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial document is mount-only; preferences reconfigure below.
  useEffect(() => {
    if (!parent.current) return;
    // Apply editor changes to the original bytes, preserving untouched mixed line endings.
    const separator = initial.current.includes('\r\n') ? '\r\n' : '\n';
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          markdown({ extensions: [TaskList, Strikethrough] }),
          presentation.current.of(visual ? livePreview(taskLabel) : []),
          history(),
          lineNumbers(),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: [tags.heading, tags.strong], fontWeight: 'bold' },
              { tag: tags.emphasis, fontStyle: 'italic' },
              {
                tag: [tags.link, tags.url],
                color: 'var(--syntax-link)',
                textDecoration: 'underline',
              },
              {
                tag: [tags.meta, tags.processingInstruction, tags.comment],
                color: 'var(--syntax-muted)',
              },
              {
                tag: [tags.keyword, tags.bool, tags.number],
                color: 'var(--syntax-accent)',
              },
              {
                tag: [tags.string, tags.special(tags.string)],
                color: 'var(--syntax-link)',
              },
            ]),
          ),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          access.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          attributes.current.of(
            EditorView.contentAttributes.of({ 'aria-label': label }),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const changes: { from: number; to: number; text: string }[] = [];
              update.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
                changes.push({
                  from,
                  to,
                  text: inserted.toString().replaceAll('\n', separator),
                });
              });
              const offset = (position: number) => {
                let rawOffset = 0;
                for (let count = 0; count < position; count++, rawOffset++) {
                  if (
                    raw.current[rawOffset] === '\r' &&
                    raw.current[rawOffset + 1] === '\n'
                  )
                    rawOffset++;
                }
                return rawOffset;
              };
              for (const change of changes.reverse()) {
                raw.current =
                  raw.current.slice(0, offset(change.from)) +
                  change.text +
                  raw.current.slice(offset(change.to));
              }
              callbacks.current.onChange(raw.current);
            }
          }),
          EditorView.theme({
            '&': { fontSize: '15px', minHeight: '420px' },
            '.cm-content': {
              fontFamily: 'var(--font-mono)',
              padding: '1.5rem 0',
              caretColor: 'var(--text)',
            },
            '.cm-gutters': {
              background: 'transparent',
              color: 'var(--muted)',
              border: 'none',
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              background: '#63537866 !important',
            },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        access.current.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        attributes.current.reconfigure(
          EditorView.contentAttributes.of({ 'aria-label': label }),
        ),
      ],
    });
  }, [label, readOnly]);
  useEffect(() => {
    view.current?.dispatch({
      effects: presentation.current.reconfigure(
        visual ? livePreview(taskLabel) : [],
      ),
    });
  }, [visual, taskLabel]);
  return <div ref={parent} />;
}
