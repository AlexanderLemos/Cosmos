//! Optional repository manifest `.cosmos/project.json` (decision D1, plan §15.4).
//!
//! Off by default. Holds only the project id; never secrets, paths or session data.
//! Knowing a project id grants no access to its memory.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ids::ProjectId;

pub const REPO_MANIFEST_SCHEMA_VERSION: u32 = 1;
pub const REPO_MANIFEST_PATH: &str = ".cosmos/project.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RepoManifest {
    pub schema_version: u32,
    pub project_id: ProjectId,
    /// Informational only. COSMOS never identifies a project by name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_extra_fields() {
        let json = format!(
            r#"{{"schema_version":1,"project_id":"{}","path":"C:\\Users\\x"}}"#,
            ProjectId::new()
        );
        assert!(serde_json::from_str::<RepoManifest>(&json).is_err());
    }
}
