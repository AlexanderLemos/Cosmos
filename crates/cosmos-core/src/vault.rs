//! Versioned vault operations shared by the desktop and daemon.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum VaultCommand {
    List,
    Read {
        path: String,
    },
    Write {
        path: String,
        content: String,
        expected_rev: String,
    },
    Move {
        from: String,
        to: String,
        expected_rev: String,
    },
    Trash {
        path: String,
        expected_rev: String,
    },
    ListTrash,
    Restore {
        id: String,
        to: String,
        expected_rev: String,
    },
    Search {
        query: String,
    },
    CreateProject {
        name: String,
        universe: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Note {
    pub path: String,
    pub content: String,
    pub rev: String,
    pub can_organize: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TrashEntry {
    pub id: String,
    pub path: String,
    pub rev: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum VaultReply {
    Paths { paths: Vec<String> },
    Note(Note),
    Saved { rev: String },
    Project { path: String },
    Moved { path: String },
    Trashed { id: String },
    TrashEntries { entries: Vec<TrashEntry> },
}
