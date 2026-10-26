import type { LocalDraft } from '@cosmos/fs/drafts';
import { expect, it, vi } from 'vitest';
import { DraftWriter } from './draft-writer';

const draft = (content: string, id = 'editor'): LocalDraft => ({
  format: 1,
  id,
  scope: 'vault',
  path: 'a.md',
  content,
  baseContent: 'original',
  baseRev: 'rev',
  version: content,
  updatedAt: 1,
});

it('coalesces pending keystrokes and never resurrects a draft after saving the note', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  const notify = vi.fn();
  const writer = new DraftWriter(
    {
      put: async (record) => {
        writes.push(record.content);
        if (record.content === 'first') await gate;
      },
      remove: async () => {
        writes.push('removed');
      },
    },
    notify,
  );
  writer.enqueue('editor', 'vault', draft('first'));
  writer.enqueue('editor', 'vault', draft('second'));
  writer.enqueue('editor', 'vault', draft('latest'));
  release();
  await writer.flush();
  expect(writes).toEqual(['first', 'latest']);
  expect(
    notify.mock.calls
      .filter((call) => call[1] === 'protected')
      .map((call) => call[3]?.content),
  ).toEqual(['latest']);
  writer.enqueue('editor', 'vault', draft('saving'));
  writer.enqueue('editor', 'vault', null);
  await writer.flush();
  expect(writes.at(-1)).toBe('removed');
  expect(notify.mock.calls.at(-1)?.[1]).toBe('clean');
});

it('retains a failed snapshot for explicit retry without overwriting a newer edit', async () => {
  let fail = true;
  const stored: LocalDraft[] = [];
  const notify = vi.fn();
  const writer = new DraftWriter(
    {
      put: async (record) => {
        if (fail) throw new Error('quota');
        stored.push(record);
      },
      remove: async () => {},
    },
    notify,
  );
  writer.enqueue('one', 'vault', draft('unsaved', 'one'));
  await writer.flush();
  expect(notify.mock.calls.at(-1)?.slice(0, 3)).toEqual(['one', 'failed', 1]);
  fail = false;
  writer.retry();
  writer.enqueue('one', 'vault', draft('newer', 'one'));
  writer.enqueue('two', 'vault', draft('other session', 'two'));
  await writer.flush();
  expect(stored.at(-2)?.content).toBe('newer');
  expect(stored.at(-1)?.id).toBe('two');
  expect(notify.mock.calls.at(-1)?.[2]).toBe(0);
});
