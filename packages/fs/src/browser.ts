/// <reference path="./browser-types.d.ts" />
import { zipSync } from 'fflate';
import {
  type Entry,
  type FsEvent,
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
  async importFiles(files: { path: string; file: File }[]) {
    return this.lock(async () => {
      const unique = new Set<string>();
      for (const { path } of files) {
        validatePath(path);
        if (path.split('/').includes('.git'))
          throw new Error('GIT_IMPORT_EXCLUDED');
        if (unique.has(path.toLowerCase()))
          throw new Error('DESTINATION_EXISTS');
        unique.add(path.toLowerCase());
        if (await this.isReadOnly(path)) throw new Error('MEMORY_READ_ONLY');
        try {
          await this.file(path);
          throw new Error('DESTINATION_EXISTS');
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      // Never reserialize Markdown, attachments, .canvas or Obsidian configuration.
      for (const { path, file } of files)
        await this.put(path, new Uint8Array(await file.arrayBuffer()));
    });
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
  return new BrowserVaultFS(
    await (await navigator.storage.getDirectory()).getDirectoryHandle(
      'cosmos-vault',
      { create: true },
    ),
  );
}
