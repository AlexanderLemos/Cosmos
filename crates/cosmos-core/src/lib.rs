//! F0 domain contracts. Transports and persistence are deliberately outside this crate.
use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

pub mod markdown;
pub mod vault;

/// The wire version is a literal, not an arbitrary number accepted by deserialization.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "u32", into = "u32")]
pub struct Version1;
impl TryFrom<u32> for Version1 {
    type Error = &'static str;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        if value == 1 {
            Ok(Self)
        } else {
            Err("unsupported contract version")
        }
    }
}
impl From<Version1> for u32 {
    fn from(_: Version1) -> Self {
        1
    }
}
impl JsonSchema for Version1 {
    fn schema_name() -> Cow<'static, str> {
        "Version1".into()
    }
    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        json_schema!({"type": "integer", "const": 1})
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProjectManifest {
    pub schema_version: Version1,
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// These defaults are configuration only. No grant is conferred by deserializing them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct PrivacyDefaults {
    pub repo_manifest_enabled: bool,
    pub mirror_enabled: bool,
    pub capture_authorized: bool,
    pub capture_full_transcript: bool,
    pub local_ai_enabled: bool,
    pub http_enabled: bool,
    pub autostart_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Closed,
    Interrupted,
    PendingConsolidation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    Read,
    Write,
    Admin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Harness {
    ClaudeCode,
    Codex,
    HermesAgent,
    GenericMcp,
    User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Binding {
    Path(String),
    GitRootCommit(String),
    GitRemote(String),
    Marker(String),
    Workspace(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub format_version: Version1,
    pub id: String,
    pub display_name: String,
    pub universe: String,
    pub archived: bool,
    pub privacy: PrivacyDefaults,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Agent {
    pub harness: Harness,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    pub kind: EvidenceKind,
    #[serde(rename = "ref")]
    pub reference: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    File,
    Command,
    Commit,
    Event,
}

/// First contract slice. Further event types from §14.2 are added with fixtures in F1/F2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", content = "payload", deny_unknown_fields)]
pub enum Event {
    #[serde(rename = "session.started")]
    SessionStarted { harness_session_id: String },
    #[serde(rename = "prompt.submitted")]
    PromptSubmitted {
        redacted_text: String,
        initial: bool,
    },
    #[serde(rename = "file.changed")]
    FileChanged { paths: Vec<String> },
    #[serde(rename = "test.run")]
    TestRun {
        command: String,
        exit_code: i32,
        summary: String,
    },
    #[serde(rename = "checkpoint")]
    Checkpoint { summary: String },
    #[serde(rename = "turn.completed")]
    TurnCompleted {},
    #[serde(rename = "session.ended")]
    SessionEnded {},
    #[serde(rename = "session.interrupted")]
    SessionInterrupted { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct EventEnvelope {
    pub schema_version: Version1,
    pub id: String,
    pub idempotency_key: String,
    pub project_id: String,
    pub session_id: String,
    pub agent: Agent,
    pub event: Event,
    pub evidence: Vec<Evidence>,
    pub base_rev: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RuntimeInfo {
    pub protocol_version: Version1,
    pub application_version: String,
    pub capabilities: Vec<String>,
}
impl RuntimeInfo {
    pub fn desktop() -> Self {
        Self {
            protocol_version: Version1,
            application_version: env!("CARGO_PKG_VERSION").into(),
            capabilities: [
                "vault.read",
                "vault.write",
                "vault.search",
                "vault.move",
                "vault.trash",
                "vault.restore",
                "projects.create",
            ]
            .map(String::from)
            .to_vec(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn version_mismatch_is_rejected() {
        assert!(serde_json::from_value::<Version1>(json!(2)).is_err());
        assert!(serde_json::from_value::<Version1>(json!(0)).is_err());
        assert_eq!(serde_json::to_value(Version1).unwrap(), json!(1));
    }

    #[test]
    fn fresh_configuration_grants_nothing() {
        let defaults: PrivacyDefaults = serde_json::from_value(json!({})).unwrap();
        let value = serde_json::to_value(defaults).unwrap();
        assert!(
            value
                .as_object()
                .unwrap()
                .values()
                .all(|v| v == &json!(false))
        );
    }

    #[test]
    fn manifest_rejects_unexpected_sensitive_fields() {
        for field in ["token", "absolute_path", "session", "credentials"] {
            let mut value = json!({"schema_version": 1, "project_id": "prj_fixture"});
            value[field] = json!("synthetic-fixture");
            assert!(serde_json::from_value::<ProjectManifest>(value).is_err());
        }
    }

    #[test]
    fn turn_and_session_end_have_distinct_contracts() {
        let turn: Event =
            serde_json::from_value(json!({"type":"turn.completed", "payload":{}})).unwrap();
        let end: Event =
            serde_json::from_value(json!({"type":"session.ended", "payload":{}})).unwrap();
        assert_ne!(turn, end);
        assert!(
            serde_json::from_value::<Event>(
                json!({"type":"turn.completed", "payload":{"close":true}})
            )
            .is_err()
        );
    }

    #[test]
    fn file_events_reject_contents() {
        let value = json!({"type":"file.changed", "payload":{"paths":["src/main.rs"], "content":"do not capture"}});
        assert!(serde_json::from_value::<Event>(value).is_err());
    }
}
