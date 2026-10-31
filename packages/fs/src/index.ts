/** Vault capabilities. move() requires a revision; remove() means trash (legacy Web implementation is not exposed). Native organization uses typed IPC; the full watch adapter remains pending. */
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
  move(from: string, to: string, expectedRev: string): Promise<void>;
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

/** A move stopped after retaining a verified copy. Never implies rollback. */
export class MoveIncomplete extends Error {
  constructor(
    readonly backupPath: string,
    cause: unknown,
  ) {
    super('MOVE_INCOMPLETE', { cause });
  }
}

export interface MoveRecord {
  id: string;
  version: string;
  from: string;
  to: string;
  rev: string;
}
export type MoveEntry =
  | { id: string; record: MoveRecord }
  | { id: string; issue: 'invalid' | 'unreadable' };
export interface MovePage {
  entries: MoveEntry[];
  next?: string;
}
export type MoveFileState = ImportFileState | 'too-large';
export interface MoveInspection {
  record: MoveRecord;
  checkedAt: number;
  source: MoveFileState;
  destination: MoveFileState;
  backup: MoveFileState;
}
export interface MoveHistory {
  list(after?: string): Promise<MovePage>;
  inspect(id: string, version: string): Promise<MoveInspection>;
  restore(id: string, version: string, to: string): Promise<void>;
}

/** Explicit retry: existing files may only be kept when their bytes match. */
export interface ImportOptions {
  resume?: boolean;
}
export interface ImportResult {
  imported: number;
  skipped: number;
}
export class ImportConflict extends Error {
  readonly code = 'IMPORT_CONFLICT';
  constructor(readonly path: string) {
    super(`IMPORT_CONFLICT: ${path}`);
  }
}

export interface ImportHeader {
  format: 1;
  id: string;
  scope: string;
  source: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  total: number;
  imported: number;
  skipped: number;
  current?: string;
}
export interface ImportEntry {
  path: string;
  size: number;
  rev: string;
  state: 'pending' | 'kept' | 'writing' | 'written';
}
export interface ImportReport {
  header: ImportHeader;
  entries: ImportEntry[];
}
export interface ImportHistory {
  list(): Promise<ImportHeader[]>;
  read(id: string, version: string): Promise<ImportReport>;
  forget(id: string, version: string): Promise<void>;
  inspect(id: string, version: string): Promise<ImportInspection>;
}

export type ImportFileState =
  | 'matching'
  | 'different'
  | 'missing'
  | 'incompatible'
  | 'unreadable';
export interface ImportInspection {
  format: 1;
  header: ImportHeader;
  startedAt: number;
  checkedAt: number;
  entries: (ImportEntry & {
    current: { state: ImportFileState; size?: number; rev?: string };
  })[];
}
