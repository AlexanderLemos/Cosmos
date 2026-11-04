//! `cosmosd`, the COSMOS Daímōn: one process per OS user (not a Windows service, plan §13).
//!
//! Phase 0 scope: single-instance lock, internal database migration, IPC endpoint with the
//! versioned `hello` handshake, `ping` and `shutdown`. Memory processing arrives in F1.

use std::fs::{File, OpenOptions, TryLockError};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use clap::Parser;
use cosmos_ipc::{method, Endpoint, Handler, Hello, HelloResult, RpcError, PROTOCOL_VERSION};
use cosmos_storage::{atomic, db, paths};
use serde_json::{json, Value};
use tokio::sync::Notify;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser, Debug)]
#[command(name = "cosmosd", version, about = "COSMOS local memory daemon")]
struct Args {
    /// Override the app data directory (also `COSMOS_DATA_DIR`).
    #[arg(long, env = "COSMOS_DATA_DIR")]
    data_dir: Option<PathBuf>,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("COSMOS_LOG")
                .unwrap_or_else(|_| "info".into()),
        )
        .with_writer(std::io::stderr)
        .init();

    let args = Args::parse();
    let data_dir = match args.data_dir {
        Some(d) => d,
        None => paths::app_data_dir()?,
    };
    std::fs::create_dir_all(&data_dir)
        .with_context(|| format!("creating {}", data_dir.display()))?;

    let _lock = acquire_lock(&data_dir.join("cosmosd.lock"))?;

    let removed = atomic::clean_orphans(&data_dir).unwrap_or(0);
    if removed > 0 {
        tracing::warn!(removed, "removed orphaned temporary files");
    }

    let conn = db::open(&data_dir.join("cosmos.db")).context("opening internal database")?;
    let schema_version: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    drop(conn);

    let endpoint = Endpoint::default_for(&data_dir);
    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(run(endpoint, schema_version))
}

/// Exclusive per-user lock. A second daemon exits instead of becoming a second writer.
fn acquire_lock(path: &std::path::Path) -> Result<File> {
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .with_context(|| format!("opening {}", path.display()))?;
    match file.try_lock() {
        Ok(()) => Ok(file),
        Err(TryLockError::WouldBlock) => bail!("another cosmosd is already running"),
        Err(TryLockError::Error(e)) => Err(e).context("locking cosmosd.lock"),
    }
}

async fn run(endpoint: Endpoint, schema_version: u32) -> Result<()> {
    let listener = cosmos_ipc::bind(&endpoint).with_context(|| format!("binding {endpoint}"))?;
    tracing::info!(%endpoint, version = VERSION, protocol = PROTOCOL_VERSION, "cosmosd listening");

    let shutdown = Arc::new(Notify::new());
    let started = Instant::now();
    let handler: Arc<dyn Handler> = {
        let shutdown = shutdown.clone();
        Arc::new(move |m: &str, params: Value| -> Result<Value, RpcError> {
            match m {
                method::HELLO => {
                    let hello: Hello = serde_json::from_value(params)
                        .map_err(|e| RpcError::new(RpcError::INVALID_PARAMS, e.to_string()))?;
                    tracing::debug!(client = ?hello.client, version = %hello.client_version, "hello");
                    let result = HelloResult {
                        daemon_version: VERSION.into(),
                        protocol_version: PROTOCOL_VERSION,
                        schema_version,
                        pid: std::process::id(),
                        uptime_secs: started.elapsed().as_secs(),
                        capabilities: vec![],
                    };
                    Ok(serde_json::to_value(result).expect("serializable"))
                }
                method::PING => Ok(json!("pong")),
                method::SHUTDOWN => {
                    shutdown.notify_one();
                    Ok(json!("bye"))
                }
                other => Err(RpcError::new(
                    RpcError::METHOD_NOT_FOUND,
                    format!("unknown method `{other}`"),
                )),
            }
        })
    };

    tokio::select! {
        r = cosmos_ipc::serve(listener, handler) => r.context("ipc server")?,
        _ = shutdown.notified() => tracing::info!("shutdown requested"),
        _ = tokio::signal::ctrl_c() => tracing::info!("interrupted"),
    }

    if let Endpoint::UnixSocket(path) = &endpoint {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
