export interface TrashItem {
  id: string;
  path: string;
  rev: string;
}

/** UI capabilities, not a second domain model. Native commands use generated Rust DTOs. */
export interface OpenVault {
  name: string;
  paths(): Promise<string[]>;
  read(
    path: string,
  ): Promise<{ content: string; rev: string; canOrganize?: boolean }>;
  write(
    path: string,
    content: string,
    opts: { expectedRev: string },
  ): Promise<{ rev: string }>;
  isReadOnly(path: string): Promise<boolean>;
  search(query: string): Promise<string[]>;
  move?(from: string, to: string, expectedRev: string): Promise<void>;
  trash?(path: string, expectedRev: string): Promise<void>;
  listTrash?(): Promise<TrashItem[]>;
  restore?(id: string, to: string, expectedRev: string): Promise<void>;
  createProject?(name: string, universe: string): Promise<string>;
  importFiles?(files: File[]): Promise<void>;
  importZip?(file: File): Promise<void>;
  exportZip?(): Promise<Uint8Array>;
}
export interface VaultPlatform {
  open(): Promise<OpenVault | null>;
  openFolder?(): Promise<OpenVault | null>;
  kind: 'web' | 'desktop';
}
