//! `cosmos schema export|check <dir>`: contracts as versioned JSON Schema files.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result};
use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum SchemaAction {
    /// Write `<dir>/<version>/*.schema.json`.
    Export { dir: PathBuf },
    /// Fail if the files in `<dir>` differ from the Rust definitions (used by CI).
    Check { dir: PathBuf },
}

pub fn run(action: SchemaAction) -> Result<ExitCode> {
    match action {
        SchemaAction::Export { dir } => {
            for (path, content) in rendered(&dir)? {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&path, content)
                    .with_context(|| format!("writing {}", path.display()))?;
                println!("wrote {}", path.display());
            }
            Ok(ExitCode::SUCCESS)
        }
        SchemaAction::Check { dir } => {
            let mut stale = Vec::new();
            for (path, content) in rendered(&dir)? {
                if std::fs::read_to_string(&path).ok().as_deref() != Some(content.as_str()) {
                    stale.push(path);
                }
            }
            if stale.is_empty() {
                println!("contracts up to date");
                Ok(ExitCode::SUCCESS)
            } else {
                for p in &stale {
                    eprintln!("stale: {}", p.display());
                }
                eprintln!(
                    "run `cargo run -p cosmos-cli -- schema export {}`",
                    dir.display()
                );
                Ok(ExitCode::FAILURE)
            }
        }
    }
}

fn rendered(dir: &Path) -> Result<Vec<(PathBuf, String)>> {
    let version_dir = dir.join(cosmos_core::CONTRACTS_VERSION);
    cosmos_core::contract_schemas()
        .into_iter()
        .map(|(name, schema)| {
            let mut json = serde_json::to_string_pretty(&schema)?;
            json.push('\n');
            Ok((version_dir.join(format!("{name}.schema.json")), json))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_then_check_passes() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path().to_path_buf();
        assert_eq!(
            run(SchemaAction::Export { dir: d.clone() }).unwrap(),
            ExitCode::SUCCESS
        );
        assert_eq!(
            run(SchemaAction::Check { dir: d.clone() }).unwrap(),
            ExitCode::SUCCESS
        );
        std::fs::write(d.join("v1/event.schema.json"), "{}").unwrap();
        assert_eq!(
            run(SchemaAction::Check { dir: d }).unwrap(),
            ExitCode::FAILURE
        );
    }
}
