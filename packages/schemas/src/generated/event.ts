/* eslint-disable */
// GENERATED from contracts/v1 by packages/schemas/scripts/generate.mjs.
// Do not edit by hand: change the Rust types and run `pnpm schemas`.

/**
 * Agent harnesses known to COSMOS. New harnesses get a new variant and a new adapter.
 */
export type Harness = ("claude-code" | "codex" | "hermes-agent") | "generic-mcp" | "cosmos-ui";
export type EvidenceKind = "file" | "commit" | "command" | "url";
export type ProjectId = string;
export type SessionId = string;
/**
 * Event types of contract v1.
 *
 * Note the difference between [`EventType::TurnCompleted`] and [`EventType::SessionEnded`] (requirement R16): finishing a turn never closes a session.
 */
export type EventType =
  | (
      | "session.started"
      | "prompt.submitted"
      | "requirement.added"
      | "requirement.changed"
      | "decision.recorded"
      | "decision.superseded"
      | "task.created"
      | "task.updated"
      | "task.claimed"
      | "task.released"
      | "test.run"
      | "commit.created"
      | "checkpoint"
      | "context.compacting"
      | "user.edited"
    )
  | "file.changed"
  | "turn.completed"
  | "session.ended"
  | "session.interrupted";

/**
 * A normalized event, as stored in the event log.
 */
export interface Event {
  agent: AgentInfo;
  /**
   * Document revision the producer saw (`b3:<hex>`), for optimistic concurrency.
   */
  base_rev?: string | null;
  /**
   * RFC 3339 timestamp.
   */
  created_at: string;
  evidence?: Evidence[];
  /**
   * ULID of the event.
   */
  id: string;
  /**
   * Deduplication key. Built from stable fields only (never wall-clock time), so a replay from the client spool is recognized as a duplicate.
   */
  idempotency_key: string;
  payload?: {
    [k: string]: unknown;
  };
  /**
   * Absent while the project is still being resolved (ambiguity, plan §15.2).
   */
  project_id?: ProjectId | null;
  session_id?: SessionId | null;
  type: EventType;
}
export interface AgentInfo {
  harness: Harness;
  /**
   * Model name, optional and informational only.
   */
  model?: string | null;
  /**
   * Harness version as reported by the harness, when available.
   */
  version?: string | null;
}
export interface Evidence {
  kind: EvidenceKind;
  /**
   * Relative path, commit hash, command line or URL.
   */
  ref: string;
}
