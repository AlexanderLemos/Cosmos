/// <reference path="./browser-types.d.ts" />
import { unzipSync, zipSync } from 'fflate';
import {
  excludedImagePath,
  imageExtension,
  imageMediaType,
  MAX_IMAGE_BYTES,
} from './images';
import {
  type Entry,
  type FsEvent,
  ImportConflict,
  type ImportOptions,
  type ImportResult,
  RevisionConflict,
  type VaultFS,
} from './index';

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
  private lock<T>(action: () => Promise<T>) {
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
  async imagePaths(): Promise<string[]> {
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
        else if (imageExtension(entry.path)) paths.push(entry.path);
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
  async move(from: string, to: string) {
    return this.lock(async () => {
      await this.writable(from);
      await this.writable(to);
      try {
        await this.file(to);
        throw new Error('DESTINATION_EXISTS');
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const bytes = new Uint8Array(await (await this.file(from)).arrayBuffer());
      await this.put(to, bytes);
      const { dir, name } = await this.parent(from);
      await dir.removeEntry(name);
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
      // Read the complete selected source before writing. No Markdown reserialization,
      // journal ownership guess or deletion of files from an earlier attempt.
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
      }
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
        imported++;
      }
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
