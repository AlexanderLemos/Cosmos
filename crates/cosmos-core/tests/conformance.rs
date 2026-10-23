use cosmos_core::markdown::{Inspection, inspect_markdown};
use std::{fs, path::Path};

#[test]
fn shared_markdown_fixtures() {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/conformance");
    let mut count = 0;
    for entry in fs::read_dir(fixtures).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|extension| extension == "md") {
            let input = fs::read_to_string(&path).unwrap();
            let expected: Inspection =
                serde_json::from_str(&fs::read_to_string(path.with_extension("json")).unwrap())
                    .unwrap();
            assert_eq!(
                inspect_markdown(&input),
                expected,
                "fixture {}",
                path.display()
            );
            count += 1;
        }
    }
    assert!(count >= 2, "conformance fixtures must actually execute");
}
