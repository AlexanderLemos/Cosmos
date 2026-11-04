//! COSMOS storage primitives: where data lives, how it is written safely, and the internal
//! SQLite schema. Only `cosmosd` writes through this crate (single-writer principle, §10.3).

pub mod atomic;
pub mod db;
pub mod paths;
pub mod rev;

use std::path::PathBuf;

pub use atomic::{write_atomic, write_if_rev};
pub use rev::{rev_of, Rev};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("could not resolve the user's Documents folder")]
    NoDocumentsDir,
    #[error("could not resolve the user's data folder")]
    NoDataDir,
    #[error("invalid path: {0}")]
    InvalidPath(PathBuf),
    #[error("target is locked by another program: {0}")]
    Locked(PathBuf),
    #[error("revision conflict on {path}")]
    Conflict {
        path: PathBuf,
        expected: Option<Rev>,
        actual: Option<Rev>,
    },
    #[error("database schema v{found} is newer than this build (v{supported}); update COSMOS")]
    SchemaTooNew { found: u32, supported: u32 },
}
