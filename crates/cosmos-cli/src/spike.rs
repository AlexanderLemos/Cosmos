//! Phase 0 spikes (plan §25), run on the user's machine. See `scripts/spikes/README.md`.
//!
//! - S2: capture the real hook payloads of each harness before writing the adapters.
//!   Payloads may contain prompts, so they are written only to a local folder chosen by the
//!   user and never sent anywhere.
//! - S4: atomic write against a file locked by another program (Windows).

use std::io::Read;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result};
use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum SpikeAction {
    /// Read a hook payload from stdin and save it as JSON. Prints nothing to stdout, so it
    /// never injects context into the agent.
    CaptureHook {
        /// Harness name, e.g. `claude-code`, `codex`, `hermes-agent`.
        #[arg(long)]
        harness: String,
        /// Hook event name as configured, e.g. `SessionStart`.
        #[arg(long)]
        event: String,
        /// Output folder (also `COSMOS_SPIKE_DIR`). Default: `./spikes-output`.
        #[arg(long, env = "COSMOS_SPIKE_DIR", default_value = "spikes-output")]
        out: PathBuf,
    },
    /// Write `--content` to `path` atomically, retrying while the file is locked (S4).
    AtomicWrite {
        path: PathBuf,
        #[arg(long, default_value = "written by cosmos spike atomic-write\n")]
        content: String,
    },
}

pub fn run(action: SpikeAction) -> Result<ExitCode> {
    match action {
        SpikeAction::CaptureHook {
            harness,
            event,
            out,
        } => {
            let mut raw = String::new();
            std::io::stdin().read_to_string(&mut raw)?;
            let path = capture(&harness, &event, &out, &raw)?;
            eprintln!("cosmos spike: saved {}", path.display());
            Ok(ExitCode::SUCCESS)
        }
        SpikeAction::AtomicWrite { path, content } => {
            let started = std::time::Instant::now();
            match cosmos_storage::write_atomic(&path, content.as_bytes()) {
                Ok(rev) => {
                    println!("ok in {:?} · {rev}", started.elapsed());
                    Ok(ExitCode::SUCCESS)
                }
                Err(e) => {
                    println!("failed after {:?}: {e}", started.elapsed());
                    Ok(ExitCode::FAILURE)
                }
            }
        }
    }
}

fn capture(harness: &str, event: &str, out: &std::path::Path, raw: &str) -> Result<PathBuf> {
    let payload = serde_json::from_str::<serde_json::Value>(raw)
        .unwrap_or_else(|_| serde_json::Value::String(raw.to_string()));
    let record = serde_json::json!({
        "harness": harness,
        "event": event,
        "captured_at_ms": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        "cosmos_version": env!("CARGO_PKG_VERSION"),
        "payload": payload,
    });
    let dir = out.join(sanitize(harness));
    std::fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
    let path = dir.join(format!("{}-{}.json", sanitize(event), ulid::Ulid::new()));
    std::fs::write(&path, serde_json::to_string_pretty(&record)? + "\n")?;
    Ok(path)
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_json_and_raw_text() {
        let dir = tempfile::tempdir().unwrap();
        let p = capture("claude-code", "SessionStart", dir.path(), r#"{"a":1}"#).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["payload"]["a"], 1);
        let p = capture("codex", "../evil", dir.path(), "not json").unwrap();
        assert!(p.starts_with(dir.path().join("codex")));
        assert!(p
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("___evil-"));
    }
}
