//! Versioned vault operations shared by the desktop and daemon.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const VAULT_API_VERSION: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum VaultCommand {
    List,
    Watch,
    ListPdfs,
    ReadPdf {
        path: String,
    },
    ListImages,
    ReadImage {
        path: String,
    },
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
    Paths {
        paths: Vec<String>,
    },
    WatchState {
        revision: String,
        available: bool,
    },
    Note(Note),
    Pdf {
        path: String,
        media_type: String,
        data_base64: String,
    },
    Image {
        path: String,
        media_type: String,
        data_base64: String,
    },
    Saved {
        rev: String,
    },
    Project {
        path: String,
    },
    Moved {
        path: String,
    },
    Trashed {
        id: String,
    },
    TrashEntries {
        entries: Vec<TrashEntry>,
    },
}
