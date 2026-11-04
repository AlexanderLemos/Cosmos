//! COSMOS domain types and versioned contracts.
//!
//! Contracts defined here are exported as JSON Schema to `contracts/v1/` (ADR 0005) and
//! used to generate TypeScript types. Do not duplicate them by hand elsewhere.

pub mod event;
pub mod ids;
pub mod manifest;
pub mod summary;

use schemars::schema::RootSchema;

pub use event::{AgentInfo, Event, EventType, Evidence, EvidenceKind, Harness};
pub use ids::{IdError, ProfileId, ProjectId, SessionId};
pub use manifest::RepoManifest;
pub use summary::SessionSummary;

/// Version of the contract set in this crate (directory name under `contracts/`).
pub const CONTRACTS_VERSION: &str = "v1";

/// Every exported contract, as `(file stem, schema)`.
pub fn contract_schemas() -> Vec<(&'static str, RootSchema)> {
    vec![
        ("event", schemars::schema_for!(Event)),
        ("session-summary", schemars::schema_for!(SessionSummary)),
        ("repo-manifest", schemars::schema_for!(RepoManifest)),
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn schemas_have_titles() {
        for (name, schema) in super::contract_schemas() {
            let title = schema
                .schema
                .metadata
                .as_ref()
                .and_then(|m| m.title.clone());
            assert!(title.is_some(), "{name} has no title");
        }
    }
}
