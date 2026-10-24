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
    let mut last_error = String::new();
    for _ in 0..200 {
        match cosmos_daemon::handshake(data) {
            Ok(()) => return Daemon(child),
            Err(error) => last_error = error.to_string(),
        }
        assert!(
            child.try_wait().unwrap().is_none(),
            "daemon exited during startup"
        );
        thread::sleep(Duration::from_millis(10));
    }
    let _ = child.kill();
    let _ = child.wait();
    panic!("daemon did not start: {last_error}");
}
#[test]
fn real_process_serializes_writes_rejects_versions_and_survives_kill() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("v");
    let data = temp.path().join("d");
    let daemon = start(&root, &data);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&data).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            std::fs::metadata(cosmos_daemon::endpoint(&data))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
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

#[test]
fn transport_waits_for_delayed_peers_and_transfers_large_frames() {
    use interprocess::local_socket::prelude::*;
    let temp = tempfile::tempdir().unwrap();
    let listener = cosmos_daemon::listener(temp.path()).unwrap();
    let payload = serde_json::json!({"text": "órbita".repeat(200_000)});
    thread::scope(|scope| {
        let server = scope.spawn(|| {
            let mut stream = listener.accept().unwrap();
            let received = cosmos_daemon::receive(&mut stream).unwrap();
            assert_eq!(received, payload);
            thread::sleep(Duration::from_millis(100));
            cosmos_daemon::send(&mut stream, &received).unwrap();
        });
        let mut stream = cosmos_daemon::connect(temp.path()).unwrap();
        thread::sleep(Duration::from_millis(100));
        cosmos_daemon::send(&mut stream, &payload).unwrap();
        assert_eq!(cosmos_daemon::receive(&mut stream).unwrap(), payload);
        server.join().unwrap();
    });
}

#[cfg(feature = "fault-injection")]
#[test]
fn kill_during_move_recovers_without_losing_either_file() {
    for stage in [
        "relocation_journal",
        "relocation_published",
        "relocation_copied",
        "relocation_removed",
    ] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("v");
        let data = temp.path().join("d");
        let marker = temp.path().join("paused");
        std::fs::create_dir_all(&root).unwrap();
        let content = "\u{feff}recover\r\nexactly\n";
        std::fs::write(root.join("source.md"), content).unwrap();
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
                    VaultCommand::Move {
                        from: "source.md".into(),
                        to: "Folder/destination.md".into(),
                        expected_rev: cosmos_storage::revision(content.as_bytes()),
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
            drop(daemon);
            assert!(client.join().unwrap().is_err());
        });
        let _daemon = start(&root, &data);
        assert_eq!(
            std::fs::read(root.join("Folder/destination.md")).unwrap(),
            content.as_bytes()
        );
        assert_eq!(
            root.join("source.md").exists(),
            stage == "relocation_published"
        );
        if stage == "relocation_published" {
            assert_eq!(
                std::fs::read(root.join("source.md")).unwrap(),
                content.as_bytes()
            );
        }
        let VaultReply::Trashed { id } = cosmos_daemon::call(
            &data,
            VaultCommand::Trash {
                path: "Folder/destination.md".into(),
                expected_rev: cosmos_storage::revision(content.as_bytes()),
            },
        )
        .unwrap() else {
            panic!()
        };
        cosmos_daemon::call(
            &data,
            VaultCommand::Restore {
                id,
                to: "restored.md".into(),
                expected_rev: cosmos_storage::revision(content.as_bytes()),
            },
        )
        .unwrap();
        assert_eq!(
            std::fs::read(root.join("restored.md")).unwrap(),
            content.as_bytes()
        );
    }
}
