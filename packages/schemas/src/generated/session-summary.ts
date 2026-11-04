/* eslint-disable */
// GENERATED from contracts/v1 by packages/schemas/scripts/generate.mjs.
// Do not edit by hand: change the Rust types and run `pnpm schemas`.

/**
 * Agent harnesses known to COSMOS. New harnesses get a new variant and a new adapter.
 */
export type Harness = ("claude-code" | "codex" | "hermes-agent") | "generic-mcp" | "cosmos-ui";
/**
 * Planned ≠ implemented ≠ tested. `tested` is only accepted with a matching `test.run` event (exit 0); otherwise COSMOS downgrades it to `implemented` (unverified).
 */
export type ItemStatus = "planned" | "in_progress" | "implemented" | "tested" | "validated" | "blocked" | "failed";
export type ProjectId = string;
export type SessionId = string;
export type ClaimedResult = "passed" | "failed" | "skipped";

export interface SessionSummary {
  activities?: string[];
  agent: Harness;
  /**
   * Caveats the agent wants the next agent to know ("fallback PIN not tested").
   */
  confidence_notes?: string[];
  decisions?: DecisionEntry[];
  files?: string[];
  implemented?: ImplementedItem[];
  next_tasks?: string[];
  objective: string;
  pending?: string[];
  problems?: string[];
  project_id: ProjectId;
  requests?: string[];
  schema_version: number;
  session_id: SessionId;
  tests?: TestClaim[];
}
export interface DecisionEntry {
  rationale: string;
  /**
   * Decision id this one replaces (`N-003`), if any.
   */
  supersedes?: string | null;
  title: string;
  /**
   * Stable topic used to detect conflicting decisions (plan §19.3), e.g. `persistence`.
   */
  topic: string;
}
export interface ImplementedItem {
  /**
   * `file:<path>`, `commit:<hash>`, `command:<cmd>`.
   */
  evidence?: string[];
  item: string;
  status: ItemStatus;
}
export interface TestClaim {
  /**
   * What the agent claims; verified against `test.run` events by COSMOS.
   */
  claimed_result: ClaimedResult;
  command: string;
}
