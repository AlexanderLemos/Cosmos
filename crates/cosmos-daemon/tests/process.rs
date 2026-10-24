use cosmos_core::vault::{VaultCommand, VaultReply};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    thread,
    time::Duration,
};
struct Daemon(Child);
impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn start(root: &Path, data: &Path) -> Daemon {
    let mut child = Command::new(env!("CARGO_BIN_EXE_cosmosd"))
        .arg(root)
        .arg(data)
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    for _ in 0..200 {
        if cosmos_daemon::handshake(data).is_ok() {
            return Daemon(child);
        }
        assert!(
            child.try_wait().unwrap().is_none(),
            "daemon exited during startup"
        );
        thread::sleep(Duration::from_millis(10));
    }
    let _ = child.kill();
    let _ = child.wait();
    panic!("daemon did not start");
}
#[test]
fn real_process_serializes_writes_rejects_versions_and_survives_kill() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("v");
    let data = temp.path().join("d");
    let daemon = start(&root, &data);
    let write = |content: &str, rev: &str| VaultCommand::Write {
        path: "note.md".into(),
        content: content.into(),
        expected_rev: rev.into(),
    };
    let VaultReply::Saved { rev } = cosmos_daemon::call(&data, write("original", "")).unwrap()
    else {
        panic!()
    };
    let outcomes = thread::scope(|scope| {
        let a = scope.spawn(|| cosmos_daemon::call(&data, write("one", &rev)));
        let b = scope.spawn(|| cosmos_daemon::call(&data, write("two", &rev)));
        vec![a.join().unwrap(), b.join().unwrap()]
    });
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    let mut stream = cosmos_daemon::connect(&data).unwrap();
    cosmos_daemon::send(&mut stream, &serde_json::json!({"jsonrpc":"2.0","id":9,"method":"handshake","params":{"protocol_version":99,"command":null}})).unwrap();
    assert!(
        cosmos_daemon::receive(&mut stream)
            .unwrap()
            .get("error")
            .is_some()
    );
    let before = std::fs::read(root.join("note.md")).unwrap();
    drop(daemon); // SIGKILL / TerminateProcess, not a graceful shutdown.
    let _daemon = start(&root, &data);
    assert_eq!(std::fs::read(root.join("note.md")).unwrap(), before);
    assert!(
        cosmos_daemon::call(
            &data,
            VaultCommand::Read {
                path: "note.md".into()
            }
        )
        .is_ok()
    );
    let second = Command::new(env!("CARGO_BIN_EXE_cosmosd"))
        .arg(&root)
        .arg(&data)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert!(!second.success());
}

#[cfg(feature = "fault-injection")]
#[test]
fn kill_during_projection_replays_the_durable_journal() {
    for stage in ["after_journal", "after_rename"] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("v");
        let data = temp.path().join("d");
        let marker = temp.path().join("paused");
        let daemon = Daemon(
            Command::new(env!("CARGO_BIN_EXE_cosmosd"))
                .arg(&root)
                .arg(&data)
                .env("COSMOS_TEST_PAUSE", stage)
                .env("COSMOS_TEST_MARKER", &marker)
                .spawn()
                .unwrap(),
        );
        for _ in 0..200 {
            if cosmos_daemon::handshake(&data).is_ok() {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        cosmos_daemon::handshake(&data).unwrap();
        thread::scope(|scope| {
            let client = scope.spawn(|| {
                cosmos_daemon::call(
                    &data,
                    VaultCommand::Write {
                        path: "recover.md".into(),
                        content: "não perder\r\n".into(),
                        expected_rev: String::new(),
                    },
                )
            });
            for _ in 0..500 {
                if marker.exists() {
                    break;
                }
                thread::sleep(Duration::from_millis(10));
            }
            assert!(marker.exists(), "fault point not reached: {stage}");
            drop(daemon); // kill -9 (Unix) / TerminateProcess (Windows), exactly at the fault point.
            assert!(client.join().unwrap().is_err());
        });
        let _daemon = start(&root, &data);
        assert_eq!(
            std::fs::read_to_string(root.join("recover.md")).unwrap(),
            "não perder\r\n"
        );
    }
}
