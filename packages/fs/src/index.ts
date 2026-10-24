/** Vault capabilities. remove() means trash; native move/trash/watch remain pending in F1. */
export interface Entry {
  path: string;
  kind: 'file' | 'directory';
}
export interface FsCapabilities {
  realFolder: boolean;
  memoryWritable: boolean;
  git: boolean;
}
export interface FsEvent {
  path: string;
  kind: 'created' | 'changed' | 'moved' | 'trashed';
}
export type Unsubscribe = () => void;
export interface VaultFS {
  list(dir: string): Promise<Entry[]>;
  read(path: string): Promise<{ content: string; rev: string }>;
  write(
    path: string,
    content: string,
    opts?: { expectedRev?: string },
  ): Promise<{ rev: string }>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  watch(cb: (event: FsEvent) => void): Unsubscribe;
  capabilities(): FsCapabilities;
}
export class RevisionConflict extends Error {
  readonly code = 'CONFLICT';
  constructor(
    readonly path: string,
    readonly expectedRev: string,
    readonly actualRev: string,
  ) {
    super(`Revision conflict: ${path}`);
  }
}
