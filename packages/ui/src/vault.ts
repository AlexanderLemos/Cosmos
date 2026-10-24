/** UI capabilities, not a second domain model. Native commands use generated Rust DTOs. */
export interface OpenVault {
  name: string;
  paths(): Promise<string[]>;
  read(path: string): Promise<{ content: string; rev: string }>;
  write(
    path: string,
    content: string,
    opts: { expectedRev: string },
  ): Promise<{ rev: string }>;
  isReadOnly(path: string): Promise<boolean>;
  search(query: string): Promise<string[]>;
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
