import { expect, test, vi } from 'vitest';
import { BrowserVaultFS, decodeMoveRecord, decodeTrashRecord } from './browser';

test('moves reject real folders, unknown revisions and reserved paths before touching files', async () => {
  const root = { getFileHandle: vi.fn(), getDirectoryHandle: vi.fn() };
  const folder = new BrowserVaultFS(
    root as unknown as FileSystemDirectoryHandle,
    true,
  );
  await expect(folder.move('a.md', 'b.md', 'known')).rejects.toThrow(
    'FOLDER_MOVE_UNAVAILABLE',
  );
  await expect(folder.remove('a.md', 'known')).rejects.toThrow(
    'FOLDER_MOVE_UNAVAILABLE',
  );
  const vault = new BrowserVaultFS(
    root as unknown as FileSystemDirectoryHandle,
  );
  await expect(vault.move('a.md', 'b.md', '')).rejects.toThrow(
    'EXPECTED_REV_REQUIRED',
  );
  await expect(vault.remove('a.md', '')).rejects.toThrow(
    'EXPECTED_REV_REQUIRED',
  );
  for (const path of [
    '../a.md',
    '.COSMOS/a.md',
    '.Git/a.md',
    '.Obsidian/a.md',
  ]) {
    await expect(vault.move(path, 'b.md', 'known')).rejects.toThrow(
      'INVALID_PATH',
    );
    await expect(vault.move('a.md', path, 'known')).rejects.toThrow(
      'INVALID_PATH',
    );
    await expect(vault.remove(path, 'known')).rejects.toThrow('INVALID_PATH');
  }
  expect(root.getFileHandle).not.toHaveBeenCalled();
  expect(root.getDirectoryHandle).not.toHaveBeenCalled();
});

test('trash metadata accepts only portable notes and a fixed backup, never move destinations', () => {
  const valid = {
    format: 1,
    from: 'Folder/a.md',
    rev: `sha256:${'a'.repeat(64)}`,
    backup: 'note.md',
  };
  expect(decodeTrashRecord(JSON.stringify(valid))).toEqual({
    from: valid.from,
    rev: valid.rev,
  });
  for (const replacement of [
    { from: '../escape.md' },
    { from: '.COSMOS/note.md' },
    { from: 'a.png' },
    { rev: '' },
    { backup: '../a.md' },
    { to: 'b.md' },
    { to: null },
    { format: 2 },
  ])
    expect(() =>
      decodeTrashRecord(JSON.stringify({ ...valid, ...replacement })),
    ).toThrow('RECOVERY_RECORD_INVALID');
});

test('move records reject unsafe paths, redirected backups and malformed revisions before inspection', () => {
  const valid = {
    format: 1,
    from: 'Origem.md',
    to: 'Pasta/Destino.md',
    rev: `sha256:${'a'.repeat(64)}`,
    backup: 'note.md',
  };
  expect(decodeMoveRecord(JSON.stringify(valid))).toEqual({
    from: valid.from,
    to: valid.to,
    rev: valid.rev,
  });
  for (const replacement of [
    { format: 2 },
    { backup: '../../secret.md' },
    { from: '../escape.md' },
    { to: '/outside.md' },
    { to: '.CoSmOs/moves/a.md' },
    { from: '.git/a.md' },
    { to: '.obsidian/a.md' },
    { to: 'image.png' },
    { to: 'origem.MD' },
    { rev: 'unchecked' },
    { from: 3 },
    { to: null },
  ])
    expect(() =>
      decodeMoveRecord(JSON.stringify({ ...valid, ...replacement })),
    ).toThrow('RECOVERY_RECORD_INVALID');
  for (const raw of ['null', '[1]', '{', '{}'])
    expect(() => decodeMoveRecord(raw)).toThrow('RECOVERY_RECORD_INVALID');
});
