//! The three places on disk (plan §12.1, §12.5). Never hard-coded: always resolved through
//! the OS (known folders on Windows, XDG on Linux), so OneDrive redirection and localized
//! folder names are respected.

use std::path::PathBuf;

use crate::Error;

/// Name of the vault folder created inside the user's Documents folder (D2).
pub const VAULT_DIR_NAME: &str = "COSMOS";

/// Default vault: `Documents/COSMOS/`. The user may choose another location.
pub fn default_vault_dir() -> Result<PathBuf, Error> {
    Ok(documents_dir()?.join(VAULT_DIR_NAME))
}

/// The user's Documents folder. On Linux without `xdg-user-dirs`, falls back to
/// `~/Documents` (plan §12.5).
fn documents_dir() -> Result<PathBuf, Error> {
    if let Some(docs) = dirs::document_dir() {
        return Ok(docs);
    }
    if cfg!(target_os = "linux") {
        if let Some(home) = dirs::home_dir() {
            return Ok(home.join("Documents"));
        }
    }
    Err(Error::NoDocumentsDir)
}

/// Internal app data (SQLite, spool, logs). Must not live inside a cloud-synced vault.
///
/// - Windows: `%APPDATA%\Cosmos`
/// - macOS: `~/Library/Application Support/Cosmos`
/// - Linux: `$XDG_DATA_HOME/cosmos` (usually `~/.local/share/cosmos`)
pub fn app_data_dir() -> Result<PathBuf, Error> {
    let base = dirs::data_dir().ok_or(Error::NoDataDir)?;
    let name = if cfg!(any(target_os = "windows", target_os = "macos")) {
        "Cosmos"
    } else {
        "cosmos"
    };
    Ok(base.join(name))
}

/// Folder for events the client could not deliver to the daemon (plan §13.5).
pub fn spool_dir() -> Result<PathBuf, Error> {
    Ok(app_data_dir()?.join("spool"))
}

pub fn logs_dir() -> Result<PathBuf, Error> {
    Ok(app_data_dir()?.join("logs"))
}

/// Exclusive lock file guaranteeing a single `cosmosd` per user.
pub fn daemon_lock_path() -> Result<PathBuf, Error> {
    Ok(app_data_dir()?.join("cosmosd.lock"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_ends_with_cosmos() {
        if let Ok(p) = default_vault_dir() {
            assert!(p.ends_with(VAULT_DIR_NAME));
        }
    }

    #[test]
    fn data_dir_is_outside_vault() {
        if let (Ok(vault), Ok(data)) = (default_vault_dir(), app_data_dir()) {
            assert!(!data.starts_with(&vault));
        }
    }
}
