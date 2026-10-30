/// <reference path="./browser-types.d.ts" />
import { unzipSync, zipSync } from 'fflate';
import { directoryDraftScope } from './drafts';
import {
  excludedImagePath,
  imageExtension,
  imageMediaType,
  MAX_IMAGE_BYTES,
} from './images';
import { importJournal } from './import-journal';
import {
  type Entry,
  type FsEvent,
  ImportConflict,
  type ImportEntry,
  type ImportInspection,
  type ImportOptions,
  type ImportResult,
  MoveIncomplete,
  RevisionConflict,
  type VaultFS,
} from './index';
import { MAX_PDF_BYTES, validatePdf } from './pdfs';

export const MAX_NOTE_BYTES = 8 * 1024 * 1024;
export function validatePath(path: string) {
  if (
    !path ||
    /[\\:<>"|?*]/.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32) ||
    path
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part) ||
          part.startsWith('.cosmos-write-'),
      )
  ) {
    throw new Error('INVALID_PATH');
  }
  return path.split('/');
}
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
export function decodeVaultZip(bytes: Uint8Array) {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('IMPORT_TOO_LARGE');
  let total = 0;
  let count = 0;
  const names = new Set<string>();
  return unzipSync(bytes, {
    filter: (entry) => {
      if (++count > 10_000) throw new Error('TOO_MANY_FILES');
      const directory = entry.name.endsWith('/');
      const path = directory ? entry.name.slice(0, -1) : entry.name;
      validatePath(path);
      if (path.split('/').includes('.git'))
        throw new Error('GIT_IMPORT_EXCLUDED');
      const key = path.toLowerCase();
      if (names.has(key)) throw new Error('DESTINATION_EXISTS');
      names.add(key);
      total += entry.originalSize;
      if (total > MAX_ARCHIVE_BYTES) throw new Error('IMPORT_TOO_LARGE');
      return !directory;
    },
  });
}
async function rev(bytes: Uint8Array<ArrayBuffer>) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
function importSource(entries: ImportEntry[]) {
  return rev(
    new TextEncoder().encode(
      JSON.stringify(
        entries
          .map(({ path, size, rev }) => [path, size, rev])
          .sort((a, b) =>
            String(a[0]) < String(b[0])
              ? -1
              : String(a[0]) > String(b[0])
                ? 1
                : 0,
          ),
      ),
    ),
  );
}
const missing = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotFoundError';
export class BrowserVaultFS implements VaultFS {
  private listeners = new Set<(event: FsEvent) => void>();
  constructor(
    readonly root: FileSystemDirectoryHandle,
    readonly realFolder = false,
  ) {}
  capabilities() {
    return { realFolder: this.realFolder, memoryWritable: false, git: false };
  }
  private async lock<T>(action: () => Promise<T>): Promise<T> {
    if (!navigator.locks) throw new Error('WEB_LOCKS_UNAVAILABLE');
    return navigator.locks.request(`cosmos-vault:${this.root.name}`, action);
  }
  private async parent(path: string, create = false) {
    const parts = validatePath(path);
    const name = parts.pop();
    if (!name) throw new Error('INVALID_PATH');
    let dir = this.root;
    for (const part of parts)
      dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name };
  }
  private async file(path: string) {
    const { dir, name } = await this.parent(path);
    return (await dir.getFileHandle(name)).getFile();
  }
  async list(dir = ''): Promise<Entry[]> {
    let handle = this.root;
    if (dir)
      for (const part of validatePath(dir))
        handle = await handle.getDirectoryHandle(part);
    const result: Entry[] = [];
    for await (const [name, entry] of handle.entries()) {
      result.push({ path: dir ? `${dir}/${name}` : name, kind: entry.kind });
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }
  async paths(): Promise<string[]> {
    const paths: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await this.list(dir)) {
        if (
          ['.cosmos', '.git', '.obsidian'].includes(
            entry.path.split('/').at(-1) ?? '',
          )
        )
          continue;
        if (entry.kind === 'directory') await walk(entry.path);
        else if (/\.md$/i.test(entry.path)) paths.push(entry.path);
      }
    };
    await walk('');
    return paths.sort();
  }
  async read(path: string) {
    const file = await this.file(path);
    if (file.size > MAX_NOTE_BYTES) throw new Error('NOTE_TOO_LARGE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Fatal decoding avoids silently replacing invalid UTF-8. Preserve an existing BOM.
    return {
      content: new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes),
      rev: await rev(bytes),
    };
  }
  async pdfPaths(): Promise<string[]> {
    return this.binaryPaths((path) => /\.pdf$/i.test(path));
  }
  async readPdf(path: string): Promise<Uint8Array<ArrayBuffer>> {
    validatePath(path);
    if (excludedImagePath(path)) throw new Error('INVALID_PATH');
    if (!/\.pdf$/i.test(path)) throw new Error('UNSUPPORTED_PDF');
    const file = await this.file(path);
    if (file.size > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    validatePdf(path, bytes);
    return bytes;
  }
  async imagePaths(): Promise<string[]> {
    return this.binaryPaths((path) => !!imageExtension(path));
  }
  private async binaryPaths(
    accept: (path: string) => boolean,
  ): Promise<string[]> {
    const paths: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await this.list(dir)) {
        if (excludedImagePath(entry.path)) continue;
        try {
          validatePath(entry.path);
        } catch {
          continue;
        }
        if (entry.kind === 'directory') await walk(entry.path);
        else if (accept(entry.path)) paths.push(entry.path);
      }
    };
    await walk('');
    return paths.sort();
  }
  async readImage(path: string): Promise<Uint8Array<ArrayBuffer>> {
    validatePath(path);
    if (excludedImagePath(path)) throw new Error('INVALID_PATH');
    if (!imageExtension(path)) throw new Error('UNSUPPORTED_IMAGE');
    const file = await this.file(path);
    if (file.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    imageMediaType(path, bytes);
    return bytes;
  }
  async isReadOnly(path: string) {
    let dir = this.root;
    const parts = validatePath(path);
    parts.pop();
    for (let index = 0; index <= parts.length; index++) {
      try {
        await dir.getFileHandle('project.cosmos.json');
        return true;
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const part = parts[index];
      if (part) {
        try {
          dir = await dir.getDirectoryHandle(part);
        } catch (error) {
          if (missing(error)) return false;
          throw error;
        }
      }
    }
    return false;
  }
  private async writable(path: string) {
    if (
      path
        .split('/')
        .some((p) => ['.cosmos', '.git', '.obsidian'].includes(p)) ||
      !/\.md$/i.test(path)
    )
      throw new Error('INVALID_PATH');
    if (await this.isReadOnly(path)) throw new Error('MEMORY_READ_ONLY');
  }
  private async put(path: string, bytes: Uint8Array<ArrayBuffer>) {
    const { dir, name } = await this.parent(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }
  }
  async write(path: string, content: string, opts?: { expectedRev?: string }) {
    return this.lock(async () => {
      await this.writable(path);
      if (opts?.expectedRev === undefined)
        throw new Error('EXPECTED_REV_REQUIRED');
      const bytes = new TextEncoder().encode(content);
      if (bytes.length > MAX_NOTE_BYTES) throw new Error('NOTE_TOO_LARGE');
      let actual = '';
      try {
        actual = (await this.read(path)).rev;
      } catch (error) {
        if (!missing(error)) throw error;
      }
      if (actual !== opts.expectedRev)
        throw new RevisionConflict(path, opts.expectedRev, actual);
      await this.put(path, bytes);
      this.emit({ path, kind: actual ? 'changed' : 'created' });
      return { rev: await rev(bytes) };
    });
  }
  private async vacantDestination(path: string) {
    const parts = validatePath(path);
    let dir = this.root;
    for (const [index, part] of parts.entries()) {
      let next: FileSystemDirectoryHandle | undefined;
      for await (const [name, entry] of dir.entries()) {
        if (name.toLowerCase() !== part.toLowerCase()) continue;
        if (
          name !== part ||
          index === parts.length - 1 ||
          entry.kind !== 'directory'
        )
          throw new Error('DESTINATION_EXISTS');
        next = entry as FileSystemDirectoryHandle;
      }
      if (!next) return;
      dir = next;
    }
  }
  private async atRevision(path: string, expectedRev: string) {
    let note: Awaited<ReturnType<BrowserVaultFS['read']>> | undefined;
    try {
      note = await this.read(path);
    } catch (error) {
      if (!missing(error)) throw error;
    }
    if (!note || note.rev !== expectedRev)
      throw new RevisionConflict(path, expectedRev, note?.rev ?? '');
    return note;
  }
  async move(from: string, to: string, expectedRev: string) {
    // External editors cannot join Web Locks or an atomic compare-and-delete.
    if (this.realFolder) throw new Error('FOLDER_MOVE_UNAVAILABLE');
    if (!expectedRev) throw new Error('EXPECTED_REV_REQUIRED');
    for (const path of [from, to]) {
      if (
        validatePath(path).some((part) =>
          ['.cosmos', '.git', '.obsidian'].includes(part.toLowerCase()),
        )
      )
        throw new Error('INVALID_PATH');
    }
    return this.lock(async () => {
      await this.writable(from);
      const note = await this.atRevision(from, expectedRev);
      await this.vacantDestination(to);
      await this.writable(to);
      const bytes = new TextEncoder().encode(note.content);
      const operation = `.cosmos/moves/${crypto.randomUUID()}`;
      const backupPath = `${operation}/note.md`;
      // Keep both the intent and exact source bytes in the portable vault. A
      // failed/interrupted operation never automatically deletes either copy.
      await this.put(
        `${operation}/operation.json`,
        new TextEncoder().encode(
          JSON.stringify({
            format: 1,
            from,
            to,
            rev: note.rev,
            backup: 'note.md',
          }),
        ),
      );
      await this.put(backupPath, bytes);
      await this.atRevision(backupPath, expectedRev);
      try {
        await this.writable(to);
        await this.vacantDestination(to);
        await this.put(to, bytes);
        await this.atRevision(to, expectedRev);
        await this.writable(from);
        await this.atRevision(from, expectedRev);
        const { dir, name } = await this.parent(from);
        await dir.removeEntry(name);
      } catch (error) {
        throw new MoveIncomplete(backupPath, error);
      }
      this.emit({ path: to, kind: 'moved' });
    });
  }
  async remove(path: string) {
    return this.lock(async () => {
      await this.writable(path);
      const bytes = new Uint8Array(await (await this.file(path)).arrayBuffer());
      await this.put(`.cosmos/trash/${crypto.randomUUID()}/${path}`, bytes);
      const { dir, name } = await this.parent(path);
      await dir.removeEntry(name);
      this.emit({ path, kind: 'trashed' });
    });
  }
  watch(cb: (event: FsEvent) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  private emit(event: FsEvent) {
    for (const cb of this.listeners) cb(event);
  }
  private async importScope() {
    try {
      return this.realFolder
        ? await directoryDraftScope(this.root)
        : 'web:browser-vault';
    } catch (error) {
      throw new Error('IMPORT_RECORD_UNAVAILABLE', { cause: error });
    }
  }
  listImports() {
    return this.lock(async () => importJournal.list(await this.importScope()));
  }
  readImport(id: string, version: string) {
    return this.lock(async () =>
      importJournal.read(await this.importScope(), id, version),
    );
  }
  forgetImport(id: string, version: string) {
    return this.lock(async () =>
      importJournal.forget(await this.importScope(), id, version),
    );
  }
  inspectImport(id: string, version: string): Promise<ImportInspection> {
    return this.lock(async () => {
      const report = await importJournal.read(
        await this.importScope(),
        id,
        version,
      );
      // Validate all persisted metadata before using any recorded path to read files.
      // A report is evidence only; this inspection never mutates files or the journal.
      try {
        let total = 0;
        const names = new Set<string>();
        for (const entry of report.entries) {
          if (
            typeof entry.path !== 'string' ||
            typeof entry.rev !== 'string' ||
            !/^sha256:[a-f0-9]{64}$/.test(entry.rev) ||
            !Number.isSafeInteger(entry.size) ||
            entry.size < 0 ||
            !['pending', 'kept', 'writing', 'written'].includes(entry.state)
          )
            throw new Error();
          if (
            validatePath(entry.path).some(
              (part) => part.toLowerCase() === '.git',
            )
          )
            throw new Error();
          const key = entry.path.toLowerCase();
          if (names.has(key)) throw new Error();
          names.add(key);
          total += entry.size;
          if (total > MAX_ARCHIVE_BYTES) throw new Error();
        }
        const writing = report.entries.filter(
          (entry) => entry.state === 'writing',
        );
        if (
          writing.length > 1 ||
          writing[0]?.path !== report.header.current ||
          report.entries.filter((entry) => entry.state === 'written').length !==
            report.header.imported ||
          report.entries.filter((entry) => entry.state === 'kept').length !==
            report.header.skipped
        )
          throw new Error();
      } catch (error) {
        throw new Error('IMPORT_RECORD_INVALID', { cause: error });
      }
      if ((await importSource(report.entries)) !== report.header.source)
        throw new Error('IMPORT_RECORD_INVALID');
      const startedAt = Date.now();
      const entries: ImportInspection['entries'] = [];
      for (const entry of report.entries) {
        let current: ImportInspection['entries'][number]['current'];
        try {
          const file = await this.file(entry.path);
          // Do not read an unexpectedly large replacement just to classify a mismatch.
          if (file.size !== entry.size)
            current = { state: 'different', size: file.size };
          else {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const actualRev = await rev(bytes);
            current = {
              state:
                bytes.length === entry.size && actualRev === entry.rev
                  ? 'matching'
                  : 'different',
              size: bytes.length,
              rev: actualRev,
            };
          }
        } catch (error) {
          current = {
            state: missing(error)
              ? 'missing'
              : error instanceof DOMException &&
                  error.name === 'TypeMismatchError'
                ? 'incompatible'
                : 'unreadable',
          };
        }
        entries.push({ ...entry, current });
      }
      return {
        format: 1,
        header: report.header,
        startedAt,
        checkedAt: Date.now(),
        entries,
      };
    });
  }
  async importFiles(
    files: { path: string; file: File }[],
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    return this.lock(async () => {
      if (files.length > 10_000) throw new Error('TOO_MANY_FILES');
      const unique = new Set<string>();
      let total = 0;
      for (const { path, file } of files) {
        validatePath(path);
        if (path.split('/').includes('.git'))
          throw new Error('GIT_IMPORT_EXCLUDED');
        const key = path.toLowerCase();
        if (unique.has(key)) throw new Error('DESTINATION_EXISTS');
        unique.add(key);
        total += file.size;
        if (total > MAX_ARCHIVE_BYTES) throw new Error('IMPORT_TOO_LARGE');
      }
      // File/directory collisions must be rejected before any destination is created.
      for (const path of unique) {
        const parts = path.split('/');
        parts.pop();
        while (parts.length) {
          if (unique.has(parts.join('/')))
            throw new Error('DESTINATION_EXISTS');
          parts.pop();
        }
      }
      const existing = async (path: string) => {
        try {
          return await this.file(path);
        } catch (error) {
          if (missing(error)) return undefined;
          if (
            error instanceof DOMException &&
            error.name === 'TypeMismatchError'
          ) {
            if (options.resume) throw new ImportConflict(path);
            throw new Error('DESTINATION_EXISTS');
          }
          throw error;
        }
      };
      const planned: { path: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
      let skipped = 0;
      const entries: ImportEntry[] = [];
      // Read the complete selected source before writing. Progress evidence never
      // grants ownership or permits deleting files from an earlier attempt.
      for (const { path, file } of files) {
        const destination = await existing(path);
        if (destination && !options.resume)
          throw new Error('DESTINATION_EXISTS');
        if (!destination && (await this.isReadOnly(path)))
          throw new Error('MEMORY_READ_ONLY');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (destination) {
          if (destination.size !== bytes.length) throw new ImportConflict(path);
          const current = new Uint8Array(await destination.arrayBuffer());
          if (
            current.length !== bytes.length ||
            !current.every((byte, i) => byte === bytes[i])
          )
            throw new ImportConflict(path);
          skipped++;
        } else planned.push({ path, bytes });
        entries.push({
          path,
          size: bytes.length,
          rev: await rev(bytes),
          state: destination ? 'kept' : 'pending',
        });
      }
      if (!entries.length) return { imported: 0, skipped: 0 };
      const scope = await this.importScope();
      const source = await importSource(entries);
      // Strict local transactions precede writes; failures leave conservative progress.
      const operation = planned.length
        ? await importJournal.start(scope, source, entries)
        : undefined;
      // A project manifest makes its directory read-only in the Web UI. Publish
      // all content first, then manifests from deepest to shallowest, so an
      // interruption cannot lock still-missing content inside an imported project.
      const manifestDepth = (path: string) => {
        const parts = path.split('/');
        return /^project\.cosmos\.json$/i.test(parts.at(-1) ?? '')
          ? parts.length
          : 0;
      };
      planned.sort((a, b) => {
        const left = manifestDepth(a.path);
        const right = manifestDepth(b.path);
        if (!left || !right)
          return Number(Boolean(left)) - Number(Boolean(right));
        return right - left;
      });
      let imported = 0;
      for (const { path, bytes } of planned) {
        if (!operation) throw new Error('IMPORT_RECORD_UNAVAILABLE');
        await importJournal.mark(scope, operation, path, false);
        // Check again after source reads. Web Locks serialize COSMOS tabs; an
        // external native editor still cannot participate in an atomic create-only CAS.
        if (await existing(path)) {
          if (options.resume) throw new ImportConflict(path);
          throw new Error('DESTINATION_EXISTS');
        }
        // A project may have appeared since preflight (for example in a native
        // editor). The delayed manifests above keep this check valid for new imports.
        if (await this.isReadOnly(path)) throw new Error('MEMORY_READ_ONLY');
        await this.put(path, bytes);
        await importJournal.mark(scope, operation, path, true);
        imported++;
      }
      // Clear earlier attempts only after the entire same source was verified/imported.
      await importJournal.finish(scope, source);
      return { imported, skipped };
    });
  }
  async importZip(
    file: File,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    if (file.size > MAX_ARCHIVE_BYTES) throw new Error('IMPORT_TOO_LARGE');
    const entries = decodeVaultZip(new Uint8Array(await file.arrayBuffer()));
    return this.importFiles(
      Object.entries(entries).map(([path, bytes]) => ({
        path,
        file: new File([new Uint8Array(bytes)], path),
      })),
      options,
    );
  }
  async exportZip() {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};
    let size = 0;
    const walk = async (dir: string) => {
      for (const entry of await this.list(dir)) {
        if (entry.path.split('/').includes('.git')) continue;
        if (entry.kind === 'directory') await walk(entry.path);
        else {
          const file = await this.file(entry.path);
          size += file.size;
          if (size > 256 * 1024 * 1024) throw new Error('EXPORT_TOO_LARGE');
          files[entry.path] = new Uint8Array(await file.arrayBuffer());
        }
      }
    };
    await walk('');
    return zipSync(files);
  }
}
export async function openBrowserVault() {
  if (!navigator.storage?.getDirectory)
    throw new Error('PERSISTENT_STORAGE_UNAVAILABLE');
  return new BrowserVaultFS(
    await (await navigator.storage.getDirectory()).getDirectoryHandle(
      'cosmos-vault',
      { create: true },
    ),
  );
}
