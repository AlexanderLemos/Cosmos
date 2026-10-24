import { BrowserVaultFS, openBrowserVault } from '@cosmos/fs/browser';
import { searchNotes } from '@cosmos/fs/search';
import type { OpenVault, VaultPlatform } from '@cosmos/ui';

function adapt(fs: BrowserVaultFS): OpenVault {
  return {
    name: fs.realFolder ? fs.root.name : 'COSMOS',
    paths: () => fs.paths(),
    read: (path) => fs.read(path),
    write: (path, content, opts) => fs.write(path, content, opts),
    isReadOnly: (path) => fs.isReadOnly(path),
    search: async (query) => {
      const paths = await fs.paths();
      if (!query.trim()) return paths;
      const notes = [];
      for (const path of paths)
        notes.push({ path, content: (await fs.read(path)).content });
      return searchNotes(notes, query);
    },
    importFiles: (files) =>
      fs.importFiles(
        files.map((file) => ({
          path: file.webkitRelativePath || file.name,
          file,
        })),
      ),
    importZip: (file) => fs.importZip(file),
    exportZip: () => fs.exportZip(),
  };
}
const picker = (
  window as unknown as {
    showDirectoryPicker?: (opts: {
      mode: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
).showDirectoryPicker;
export const platform: VaultPlatform = {
  kind: 'web',
  open: async () => adapt(await openBrowserVault()),
  openFolder: picker
    ? async () => {
        try {
          return adapt(
            new BrowserVaultFS(await picker({ mode: 'readwrite' }), true),
          );
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return null;
          throw e;
        }
      }
    : undefined,
};
