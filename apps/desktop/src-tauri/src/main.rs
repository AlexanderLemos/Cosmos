//! COSMOS Desktop. A thin shell: every read and write goes through `cosmosd` over IPC
//! (single-writer principle, plan §10.3). Tauri commands here only translate.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cosmos_ipc::{ClientKind, Endpoint, IpcError};
use serde::Serialize;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
enum DaemonStatus {
    Running {
        daemon_version: String,
        protocol_version: u32,
        schema_version: u32,
        pid: u32,
        uptime_secs: u64,
    },
    Stopped {
        endpoint: String,
    },
    Error {
        message: String,
    },
}

#[tauri::command]
async fn daemon_status() -> DaemonStatus {
    let data_dir = match std::env::var_os("COSMOS_DATA_DIR") {
        Some(d) => d.into(),
        None => match cosmos_storage::paths::app_data_dir() {
            Ok(d) => d,
            Err(e) => {
                return DaemonStatus::Error {
                    message: e.to_string(),
                }
            }
        },
    };
    let endpoint = Endpoint::default_for(&data_dir);
    match cosmos_ipc::connect_and_hello(&endpoint, ClientKind::Desktop, VERSION).await {
        Ok((_, h)) => DaemonStatus::Running {
            daemon_version: h.daemon_version,
            protocol_version: h.protocol_version,
            schema_version: h.schema_version,
            pid: h.pid,
            uptime_secs: h.uptime_secs,
        },
        Err(IpcError::Io(_)) => DaemonStatus::Stopped {
            endpoint: endpoint.to_string(),
        },
        Err(e) => DaemonStatus::Error {
            message: e.to_string(),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![daemon_status])
        .run(tauri::generate_context!())
        .expect("error while running COSMOS Desktop");
}
