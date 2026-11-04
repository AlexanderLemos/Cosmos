//! Structured session summary sent by agents through `cosmos_close_session` (plan §16.7.2).
//!
//! Unknown fields are rejected so the agent gets a useful error and can fix its call.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::event::Harness;
use crate::ids::{ProjectId, SessionId};

pub const SUMMARY_SCHEMA_VERSION: u32 = 1;

/// Planned ≠ implemented ≠ tested. `tested` is only accepted with a matching `test.run`
/// event (exit 0); otherwise COSMOS downgrades it to `implemented` (unverified).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Planned,
    InProgress,
    Implemented,
    Tested,
    Validated,
    Blocked,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Closed,
    Interrupted,
    PendingConsolidation,
}

/// Where the semantic content of a session record came from (D6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SummarySource {
    Agent,
    Rules,
    LocalAi,
    User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImplementedItem {
    pub item: String,
    pub status: ItemStatus,
    /// `file:<path>`, `commit:<hash>`, `command:<cmd>`.
    #[serde(default)]
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DecisionEntry {
    /// Stable topic used to detect conflicting decisions (plan §19.3), e.g. `persistence`.
    pub topic: String,
    pub title: String,
    pub rationale: String,
    /// Decision id this one replaces (`N-003`), if any.
    #[serde(default)]
    pub supersedes: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ClaimedResult {
    Passed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TestClaim {
    pub command: String,
    /// What the agent claims; verified against `test.run` events by COSMOS.
    pub claimed_result: ClaimedResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SessionSummary {
    pub schema_version: u32,
    pub project_id: ProjectId,
    pub session_id: SessionId,
    pub agent: Harness,
    pub objective: String,
    #[serde(default)]
    pub requests: Vec<String>,
    #[serde(default)]
    pub activities: Vec<String>,
    #[serde(default)]
    pub implemented: Vec<ImplementedItem>,
    #[serde(default)]
    pub decisions: Vec<DecisionEntry>,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub tests: Vec<TestClaim>,
    #[serde(default)]
    pub problems: Vec<String>,
    #[serde(default)]
    pub pending: Vec<String>,
    #[serde(default)]
    pub next_tasks: Vec<String>,
    /// Caveats the agent wants the next agent to know ("fallback PIN not tested").
    #[serde(default)]
    pub confidence_notes: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_summary() {
        let json = format!(
            r#"{{"schema_version":1,"project_id":"{}","session_id":"{}",
                "agent":"hermes-agent","objective":"Implement T-007"}}"#,
            ProjectId::new(),
            SessionId::new()
        );
        let s: SessionSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(s.agent, Harness::HermesAgent);
        assert!(s.implemented.is_empty());
    }

    #[test]
    fn rejects_unknown_status() {
        let json = r#"{"item":"x","status":"done"}"#;
        assert!(serde_json::from_str::<ImplementedItem>(json).is_err());
    }
}
