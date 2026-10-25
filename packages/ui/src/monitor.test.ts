import { describe, expect, it } from 'vitest';
import {
  type DocumentState,
  type ExternalNote,
  observeVault,
  reconcileDocument,
} from './monitor';
import type { OpenVault } from './vault';

const opened: DocumentState = {
  path: 'a.md',
  content: 'original',
  saved: 'original',
  rev: 'one',
  readOnly: false,
  canOrganize: true,
  generation: 1,
};
const changed: ExternalNote = {
  state: 'available',
  note: { content: 'external', rev: 'two', canOrganize: true },
  readOnly: false,
};

describe('external note reconciliation', () => {
  it('reloads a clean note but does not remount after its own save', () => {
    const next = reconcileDocument(opened, opened, changed);
    expect(next).toMatchObject({
      content: 'external',
      saved: 'external',
      rev: 'two',
      generation: 2,
    });
    expect(reconcileDocument(next, next, changed)).toBe(next);
  });
  it('preserves keystrokes entered while the background read was in flight', () => {
    const typing = { ...opened, content: 'my unsaved edit' };
    expect(reconcileDocument(typing, opened, changed)).toMatchObject({
      content: 'my unsaved edit',
      saved: 'original',
      rev: 'one',
      generation: 1,
      external: 'changed',
    });
  });
  it('discards responses from before a save or a navigation', () => {
    for (const current of [
      { ...opened, rev: 'saved-new' },
      { ...opened, path: 'b.md' },
      { ...opened, generation: 2 },
    ]) {
      expect(reconcileDocument(current, opened, changed)).toBe(current);
    }
    expect(reconcileDocument(null, opened, changed)).toBeNull();
  });
  it('keeps the text and original revision if the file disappeared or became unreadable', () => {
    for (const state of ['missing', 'unreadable'] as const) {
      expect(reconcileDocument(opened, opened, { state })).toEqual({
        ...opened,
        external: state,
      });
    }
  });
  it('updates protection without accepting an external revision over a draft', () => {
    const draft = { ...opened, content: 'draft' };
    const result = reconcileDocument(draft, opened, {
      state: 'available',
      note: { content: 'external', rev: 'two', canOrganize: false },
      readOnly: true,
    });
    expect(result).toMatchObject({
      content: 'draft',
      rev: 'one',
      readOnly: true,
      canOrganize: false,
      external: 'changed',
    });
  });
});

it('refreshes paths and backlinks while isolating unreadable files', async () => {
  const files: Record<string, string> = {
    'a.md': 'external',
    'map.md': '[[a]]',
    'other.md': '[[missing]]',
  };
  const vault: OpenVault = {
    name: 'fixture',
    paths: async () => [...Object.keys(files), 'broken.md'],
    read: async (path) => {
      if (!(path in files)) throw new Error('unreadable');
      return { content: files[path] ?? '', rev: 'two' };
    },
    write: async () => {
      throw new Error('background observation must not write');
    },
    isReadOnly: async () => false,
    search: async (query) => (query === 'external' ? ['a.md'] : []),
  };
  const result = await observeVault(vault, opened, 'external', false);
  expect(result.backlinks).toEqual(['map.md']);
  expect(result.incoming).toMatchObject({
    state: 'available',
    note: { content: 'external' },
  });
  expect(result.incomplete).toBe(true);
  expect(result.results).toEqual(['a.md']);
  delete files['a.md'];
  expect((await observeVault(vault, opened, null, false)).incoming).toEqual({
    state: 'missing',
  });
});
