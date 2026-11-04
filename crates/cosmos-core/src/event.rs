//! Normalized event contract v1 (plan §14.2). Every harness adapter converges to [`Event`].

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ids::{ProjectId, SessionId};

/// Agent harnesses known to COSMOS. New harnesses get a new variant and a new adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Harness {
    ClaudeCode,
    Codex,
    HermesAgent,
    /// Any client that only speaks MCP (assisted integration).
    GenericMcp,
    /// The COSMOS Desktop/Web UI itself (human edits).
    CosmosUi,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AgentInfo {
    pub harness: Harness,
    /// Harness version as reported by the harness, when available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Model name, optional and informational only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Event types of contract v1.
///
/// Note the difference between [`EventType::TurnCompleted`] and [`EventType::SessionEnded`]
/// (requirement R16): finishing a turn never closes a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum EventType {
    #[serde(rename = "session.started")]
    SessionStarted,
    #[serde(rename = "prompt.submitted")]
    PromptSubmitted,
    #[serde(rename = "requirement.added")]
    RequirementAdded,
    #[serde(rename = "requirement.changed")]
    RequirementChanged,
    #[serde(rename = "decision.recorded")]
    DecisionRecorded,
    #[serde(rename = "decision.superseded")]
    DecisionSuperseded,
    #[serde(rename = "task.created")]
    TaskCreated,
    #[serde(rename = "task.updated")]
    TaskUpdated,
    #[serde(rename = "task.claimed")]
    TaskClaimed,
    #[serde(rename = "task.released")]
    TaskReleased,
    /// Paths and counts only, never file contents.
    #[serde(rename = "file.changed")]
    FileChanged,
    #[serde(rename = "test.run")]
    TestRun,
    #[serde(rename = "commit.created")]
    CommitCreated,
    #[serde(rename = "checkpoint")]
    Checkpoint,
    #[serde(rename = "context.compacting")]
    ContextCompacting,
    /// End of a turn/response. Keeps the session active.
    #[serde(rename = "turn.completed")]
    TurnCompleted,
    /// Real end of session (harness confirmed or explicit `cosmos_close_session`).
    #[serde(rename = "session.ended")]
    SessionEnded,
    /// Ended without summary; recorded deterministically, nothing invented.
    #[serde(rename = "session.interrupted")]
    SessionInterrupted,
    #[serde(rename = "user.edited")]
    UserEdited,
}

impl EventType {
    pub const ALL: &'static [EventType] = &[
        Self::SessionStarted,
        Self::PromptSubmitted,
        Self::RequirementAdded,
        Self::RequirementChanged,
        Self::DecisionRecorded,
        Self::DecisionSuperseded,
        Self::TaskCreated,
        Self::TaskUpdated,
        Self::TaskClaimed,
        Self::TaskReleased,
        Self::FileChanged,
        Self::TestRun,
        Self::CommitCreated,
        Self::Checkpoint,
        Self::ContextCompacting,
        Self::TurnCompleted,
        Self::SessionEnded,
        Self::SessionInterrupted,
        Self::UserEdited,
    ];

    /// Whether this event, on its own, closes the session.
    pub fn closes_session(self) -> bool {
        matches!(self, Self::SessionEnded | Self::SessionInterrupted)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    File,
    Commit,
    Command,
    Url,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    pub kind: EvidenceKind,
    /// Relative path, commit hash, command line or URL.
    #[serde(rename = "ref")]
    pub reference: String,
}

/// A normalized event, as stored in the event log.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Event {
    /// ULID of the event.
    #[schemars(regex(pattern = r"^[0-9A-HJKMNP-TV-Z]{26}$"))]
    pub id: String,
    /// Deduplication key. Built from stable fields only (never wall-clock time), so a
    /// replay from the client spool is recognized as a duplicate.
    pub idempotency_key: String,
    /// Absent while the project is still being resolved (ambiguity, plan §15.2).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<ProjectId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,
    pub agent: AgentInfo,
    #[serde(rename = "type")]
    pub event_type: EventType,
    #[serde(default)]
    pub payload: Value,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence: Vec<Evidence>,
    /// Document revision the producer saw (`b3:<hex>`), for optimistic concurrency.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_rev: Option<String>,
    /// RFC 3339 timestamp.
    #[schemars(with = "String", regex(pattern = r"^\d{4}-\d{2}-\d{2}T"))]
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_type_uses_dotted_names() {
        let json = serde_json::to_string(&EventType::TurnCompleted).unwrap();
        assert_eq!(json, "\"turn.completed\"");
    }

    #[test]
    fn only_real_end_events_close_sessions() {
        let closing: Vec<_> = EventType::ALL
            .iter()
            .filter(|t| t.closes_session())
            .collect();
        assert_eq!(
            closing,
            [&EventType::SessionEnded, &EventType::SessionInterrupted]
        );
        assert!(!EventType::TurnCompleted.closes_session());
    }

    #[test]
    fn parses_plan_example() {
        let json = r#"{
          "id": "01JB7K9Q4ZP3ABCDEFGHJKMNPQ",
          "idempotency_key": "cc:3f9a:PostToolUse:42",
          "project_id": "prj_01JB7K2XABCDEFGHJKMNPQRSTV",
          "session_id": "ses_01JB7K3AABCDEFGHJKMNPQRSTV",
          "agent": { "harness": "claude-code", "version": "x.y" },
          "type": "test.run",
          "payload": { "command": "./gradlew test", "exit_code": 0, "summary": "48 passed" },
          "evidence": [{ "kind": "command", "ref": "./gradlew test" }],
          "base_rev": "b3:9c1e",
          "created_at": "2026-10-22T14:05:11Z"
        }"#;
        let ev: Event = serde_json::from_str(json).unwrap();
        assert_eq!(ev.event_type, EventType::TestRun);
        assert_eq!(ev.agent.harness, Harness::ClaudeCode);
    }

    #[test]
    fn rejects_unknown_fields() {
        let json = r#"{"id":"01JB7K9Q4ZP3ABCDEFGHJKMNPQ","idempotency_key":"k",
          "agent":{"harness":"codex"},"type":"checkpoint","created_at":"2026-10-22T14:05:11Z",
          "surprise":true}"#;
        assert!(serde_json::from_str::<Event>(json).is_err());
    }
}
