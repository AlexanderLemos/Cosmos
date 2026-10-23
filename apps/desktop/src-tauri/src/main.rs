#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn runtime_info() -> cosmos_core::RuntimeInfo {
    cosmos_core::RuntimeInfo::foundation()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_info])
        .run(tauri::generate_context!())
        .expect("failed to start COSMOS Desktop");
}
