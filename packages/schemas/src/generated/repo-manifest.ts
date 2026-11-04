/* eslint-disable */
// GENERATED from contracts/v1 by packages/schemas/scripts/generate.mjs.
// Do not edit by hand: change the Rust types and run `pnpm schemas`.

export type ProjectId = string;

export interface RepoManifest {
  /**
   * Informational only. COSMOS never identifies a project by name.
   */
  name?: string | null;
  project_id: ProjectId;
  schema_version: number;
}
