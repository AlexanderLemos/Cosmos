import { expect, test, vi } from 'vitest';
import { BrowserVaultFS } from './browser';

test('moves reject real folders, unknown revisions and reserved paths before touching files', async () => {
  const root = { getFileHandle: vi.fn(), getDirectoryHandle: vi.fn() };
  const folder = new BrowserVaultFS(
    root as unknown as FileSystemDirectoryHandle,
    true,
  );
  await expect(folder.move('a.md', 'b.md', 'known')).rejects.toThrow(
    'FOLDER_MOVE_UNAVAILABLE',
  );
  const vault = new BrowserVaultFS(
    root as unknown as FileSystemDirectoryHandle,
  );
  await expect(vault.move('a.md', 'b.md', '')).rejects.toThrow(
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
  }
  expect(root.getFileHandle).not.toHaveBeenCalled();
  expect(root.getDirectoryHandle).not.toHaveBeenCalled();
});
