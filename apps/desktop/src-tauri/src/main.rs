#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use cosmos_core::vault::{VaultCommand, VaultReply};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct OpenVault(Mutex<Option<PathBuf>>);
#[tauri::command]
fn runtime_info() -> cosmos_core::RuntimeInfo {
    cosmos_core::RuntimeInfo::desktop()
}

fn start_daemon(root: &Path, data: &Path) -> Result<(), String> {
    if cosmos_daemon::connect(data).is_ok() {
        return cosmos_daemon::handshake(data).map_err(|e| e.to_string());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = executable.parent().ok_or("MISSING_EXECUTABLE_DIRECTORY")?;
    let binary = parent.join(if cfg!(windows) {
        "cosmosd.exe"
    } else {
        "cosmosd"
    });
    let mut command = Command::new(binary);
    command
        .arg(root)
        .arg(data)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW; daemon outlives the GUI.
    }
    let mut child = command.spawn().map_err(|e| format!("DAEMON_START: {e}"))?;
    for _ in 0..100 {
        if cosmos_daemon::connect(data).is_ok() {
            // Reap this child when it eventually exits, without tying it to the window's lifetime.
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return cosmos_daemon::handshake(data).map_err(|e| e.to_string());
        }
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            return Err("DAEMON_EXITED".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Err("DAEMON_START_TIMEOUT".into())
}
#[tauri::command]
async fn vault_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, OpenVault>,
) -> Result<Option<String>, String> {
    let selection = tauri::async_runtime::spawn_blocking(
        move || -> Result<Option<(String, PathBuf)>, String> {
            let documents = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir())
                .map_err(|e| e.to_string())?;
            let suggested = documents.join("COSMOS");
            let directory = if suggested.is_dir() {
                suggested
            } else {
                documents
            };
            let selected = app
                .dialog()
                .file()
                .set_directory(directory)
                .blocking_pick_folder();
            let Some(selected) = selected else {
                return Ok(None);
            };
            let root = selected
                .into_path()
                .map_err(|e| e.to_string())?
                .canonicalize()
                .map_err(|e| e.to_string())?;
            let id = blake3::hash(root.to_string_lossy().as_bytes()).to_hex();
            let data = app
                .path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?
                .join("vaults")
                .join(&id[..16]);
            std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
            start_daemon(&root, &data)?;
            Ok(Some((
                root.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                data,
            )))
        },
    )
    .await
    .map_err(|e| e.to_string())??;
    if let Some((name, data)) = selection {
        *state.0.lock().map_err(|e| e.to_string())? = Some(data);
        Ok(Some(name))
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn vault_execute(
    command: VaultCommand,
    state: tauri::State<'_, OpenVault>,
) -> Result<VaultReply, String> {
    let data = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("NO_OPEN_VAULT")?;
    tauri::async_runtime::spawn_blocking(move || {
        cosmos_daemon::call(&data, command).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn main() {
    tauri::Builder::default()
        .manage(OpenVault::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            vault_open,
            vault_execute
        ])
        .run(tauri::generate_context!())
        .expect("failed to start COSMOS Desktop");
}
