import { BrowserVaultFS, openBrowserVault } from '@cosmos/fs/browser';
import { directoryDraftScope } from '@cosmos/fs/drafts';
import { searchNotes } from '@cosmos/fs/search';
import type { OpenVault, VaultPlatform } from '@cosmos/ui';

function adapt(fs: BrowserVaultFS): OpenVault {
  return {
    name: fs.realFolder ? fs.root.name : 'COSMOS',
    draftScope: () =>
      fs.realFolder
        ? directoryDraftScope(fs.root)
        : Promise.resolve('web:browser-vault'),
    paths: () => fs.paths(),
    pdfPaths: () => fs.pdfPaths(),
    readPdf: (path) => fs.readPdf(path),
    imagePaths: () => fs.imagePaths(),
    readImage: (path) => fs.readImage(path),
    read: async (path) => ({
      ...(await fs.read(path)),
      canOrganize: !fs.realFolder && !(await fs.isReadOnly(path)),
    }),
    ...(!fs.realFolder && {
      move: (from: string, to: string, expectedRev: string) =>
        fs.move(from, to, expectedRev),
      moveHistory: {
        list: (after?: string) => fs.listMoves(after),
        inspect: (id: string, version: string) => fs.inspectMove(id, version),
        restore: (id: string, version: string, to: string) =>
          fs.restoreMove(id, version, to),
      },
    }),
    write: (path, content, opts) => fs.write(path, content, opts),
    isReadOnly: (path) => fs.isReadOnly(path),
    search: async (query) => {
      const paths = await fs.paths();
      if (!query.trim()) return paths;
      const notes = [];
      for (const path of paths) notes.push({ path, ...(await fs.read(path)) });
      return searchNotes(notes, query);
    },
    importFiles: (files, options) =>
      fs.importFiles(
        files.map((file) => ({
          path: file.webkitRelativePath || file.name,
          file,
        })),
        options,
      ),
    importZip: (file, options) => fs.importZip(file, options),
    exportZip: () => fs.exportZip(),
    importHistory: {
      list: () => fs.listImports(),
      read: (id, version) => fs.readImport(id, version),
      forget: (id, version) => fs.forgetImport(id, version),
      inspect: (id, version) => fs.inspectImport(id, version),
    },
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
