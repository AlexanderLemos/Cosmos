import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserVaultFS } from './browser';

function emptyVault() {
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, action: () => unknown) => action() },
  });
  const root = {
    name: 'test-vault',
    getFileHandle: vi.fn(async () => {
      throw new DOMException('missing', 'NotFoundError');
    }),
    getDirectoryHandle: vi.fn(async () => root),
  };
  return {
    root,
    fs: new BrowserVaultFS(root as unknown as FileSystemDirectoryHandle),
  };
}
afterEach(() => vi.unstubAllGlobals());

describe('import preflight', () => {
  it('rejects file/directory and case collisions before accessing the destination', async () => {
    for (const paths of [
      ['A.md', 'a.MD'],
      ['Parent', 'parent/child.md'],
      ['../a.md'],
      ['.git/config'],
    ]) {
      const { root, fs } = emptyVault();
      await expect(
        fs.importFiles(
          paths.map((path) => ({ path, file: new File(['x'], path) })),
          { resume: true },
        ),
      ).rejects.toThrow();
      expect(root.getFileHandle).not.toHaveBeenCalled();
      expect(root.getDirectoryHandle).not.toHaveBeenCalled();
    }
  });
  it('bounds folder imports by total bytes and file count before reading source files', async () => {
    const { root, fs } = emptyVault();
    const read = vi.fn();
    await expect(
      fs.importFiles([
        {
          path: 'large.bin',
          file: {
            size: 257 * 1024 * 1024,
            arrayBuffer: read,
          } as unknown as File,
        },
      ]),
    ).rejects.toThrow('IMPORT_TOO_LARGE');
    await expect(
      fs.importFiles(
        Array.from({ length: 10_001 }, (_, i) => ({
          path: `${i}.md`,
          file: new File([], `${i}.md`),
        })),
      ),
    ).rejects.toThrow('TOO_MANY_FILES');
    expect(read).not.toHaveBeenCalled();
    expect(root.getFileHandle).not.toHaveBeenCalled();
  });
  it('reads the entire selected source before creating any destination', async () => {
    const { root, fs } = emptyVault();
    const broken = new File(['x'], 'broken.md');
    broken.arrayBuffer = async () => {
      throw new DOMException('source changed', 'NotReadableError');
    };
    await expect(
      fs.importFiles(
        [
          { path: 'first.md', file: new File(['first'], 'first.md') },
          { path: 'broken.md', file: broken },
        ],
        { resume: true },
      ),
    ).rejects.toThrow('source changed');
    expect(
      root.getFileHandle.mock.calls.every(
        (call: unknown[]) =>
          !(call[1] as { create?: boolean } | undefined)?.create,
      ),
    ).toBe(true);
  });
});
