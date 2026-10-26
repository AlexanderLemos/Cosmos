fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "runtime_info",
            "vault_open",
            "vault_execute",
            "vault_identity",
        ]),
    ))
    .expect("failed to build Tauri manifest");
}
