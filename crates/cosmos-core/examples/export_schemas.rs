use cosmos_core::*;
use schemars::{JsonSchema, schema_for};
use std::{fs, path::Path};

fn export<T: JsonSchema>(name: &str, root: &Path) {
    fs::write(
        root.join(format!("{name}.json")),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&schema_for!(T)).unwrap()
        ),
    )
    .unwrap();
}
fn main() {
    let root = std::env::args_os()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/schemas/json")
        });
    fs::create_dir_all(&root).unwrap();
    export::<ProjectManifest>("ProjectManifest", &root);
    export::<PrivacyDefaults>("PrivacyDefaults", &root);
    export::<Project>("Project", &root);
    export::<Binding>("Binding", &root);
    export::<EventEnvelope>("EventEnvelope", &root);
    export::<RuntimeInfo>("RuntimeInfo", &root);
}
