use cosmos_core::vault::{VaultCommand, VaultReply};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
struct Daemon(Child);
impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
// Process startup includes SQLite recovery, watcher setup and OS security checks.
// A wall-clock deadline tolerates loaded runners while still detecting child exit.
fn wait_ready(mut daemon: Daemon, data: &Path) -> Daemon {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let error = match cosmos_daemon::handshake(data) {
            Ok(()) => return daemon,
            Err(error) => error,
        };
        if let Some(status) = daemon.0.try_wait().unwrap() {
            panic!("daemon exited during startup: {status}; last handshake: {error}");
        }
        assert!(Instant::now() < deadline, "daemon did not start: {error}");
        thread::sleep(Duration::from_millis(20));
    }
}
fn start(root: &Path, data: &Path) -> Daemon {
    let child = Command::new(env!("CARGO_BIN_EXE_cosmosd"))
        .arg(root)
        .arg(data)
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    wait_ready(Daemon(child), data)
}

#[test]
fn image_bytes_cross_ipc_without_modifying_the_vault() {
    use base64::{Engine, engine::general_purpose::STANDARD};
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("v");
    let data = temp.path().join("d");
    let _daemon = start(&root, &data);
    let bytes = include_bytes!("../../../tests/fixtures/images/pixels.png");
    std::fs::write(root.join("pixels.png"), bytes).unwrap();
    let VaultReply::Paths { paths } = cosmos_daemon::call(&data, VaultCommand::ListImages).unwrap()
    else {
        panic!()
    };
    assert_eq!(paths, vec!["pixels.png"]);
    let VaultReply::Image {
        path,
        media_type,
        data_base64,
    } = cosmos_daemon::call(
        &data,
        VaultCommand::ReadImage {
            path: "pixels.png".into(),
        },
    )
    .unwrap()
    else {
        panic!()
    };
    assert_eq!(path, "pixels.png");
    assert_eq!(media_type, "image/png");
    assert_eq!(STANDARD.decode(data_base64).unwrap(), bytes);
    assert_eq!(std::fs::read(root.join("pixels.png")).unwrap(), bytes);
    assert!(
        cosmos_daemon::call(
            &data,
            VaultCommand::ReadImage {
                path: "../pixels.png".into()
            }
        )
        .is_err()
    );
}

#[test]
fn handshake_rejects_daemons_without_the_current_vault_api() {
    use interprocess::local_socket::prelude::*;
    for version in [
        serde_json::Value::Null,
        serde_json::json!(1),
        serde_json::json!(999),
    ] {
        let temp = tempfile::tempdir().unwrap();
        let listener = cosmos_daemon::listener(temp.path()).unwrap();
        thread::scope(|scope| {
            let server = scope.spawn(|| {
                let mut stream = listener.accept().unwrap();
                let _ = cosmos_daemon::receive(&mut stream).unwrap();
                cosmos_daemon::send(&mut stream, &serde_json::json!({"jsonrpc":"2.0","id":1,"result":{"protocol_version":1,"schema_version":cosmos_storage::SCHEMA_VERSION,"vault_api_version":version}})).unwrap();
            });
            assert!(
                cosmos_daemon::handshake(temp.path())
                    .unwrap_err()
                    .to_string()
                    .contains("INCOMPATIBLE_DAEMON")
            );
            server.join().unwrap();
        });
    }
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
        let daemon = wait_ready(daemon, &data);
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
        let daemon = wait_ready(daemon, &data);
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

#[test]
fn filesystem_changes_reach_the_daemon_watch_token() {
    use std::io::Write;
    for action in [
        "edit",
        "replace",
        "create",
        "rename",
        "remove",
        "nested",
        "project_marker",
    ] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("v");
        let data = temp.path().join("d");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("note.md"), "original").unwrap();
        let _daemon = start(&root, &data);
        let token = || {
            let VaultReply::WatchState {
                revision,
                available,
            } = cosmos_daemon::call(&data, VaultCommand::Watch).unwrap()
            else {
                panic!()
            };
            assert!(available, "native watcher unavailable for {action}");
            revision
        };
        let before = token();
        match action {
            "edit" => std::fs::write(root.join("note.md"), "external").unwrap(),
            "replace" => {
                let mut file = tempfile::Builder::new()
                    .prefix(".cosmos-write-")
                    .tempfile_in(&root)
                    .unwrap();
                file.write_all(b"replacement").unwrap();
                file.persist(root.join("note.md")).unwrap();
            }
            "create" => std::fs::write(root.join("new.md"), "new").unwrap(),
            "rename" => std::fs::rename(root.join("note.md"), root.join("renamed.md")).unwrap(),
            "remove" => std::fs::remove_file(root.join("note.md")).unwrap(),
            "nested" => {
                std::fs::create_dir(root.join("Folder")).unwrap();
                std::fs::write(root.join("Folder/new.md"), "nested").unwrap();
            }
            "project_marker" => std::fs::write(root.join("project.cosmos.json"), "{}").unwrap(),
            _ => unreachable!(),
        }
        let until = Instant::now() + Duration::from_secs(10);
        while token() == before {
            assert!(Instant::now() < until, "event not observed: {action}");
            thread::sleep(Duration::from_millis(30));
        }
        let VaultReply::Paths { paths } = cosmos_daemon::call(&data, VaultCommand::List).unwrap()
        else {
            panic!()
        };
        match action {
            "remove" => assert!(paths.is_empty()),
            "rename" => assert_eq!(paths, vec!["renamed.md"]),
            "nested" => assert!(paths.contains(&"Folder/new.md".into())),
            "project_marker" => {
                let VaultReply::Note(note) = cosmos_daemon::call(
                    &data,
                    VaultCommand::Read {
                        path: "note.md".into(),
                    },
                )
                .unwrap() else {
                    panic!()
                };
                assert!(!note.can_organize);
            }
            _ => (),
        }
    }
}

#[cfg(feature = "fault-injection")]
#[test]
fn kill_during_index_update_keeps_markdown_and_recovers_search() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("v");
    let data = temp.path().join("d");
    let marker = temp.path().join("paused");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("note.md"), "oldtoken").unwrap();
    std::fs::write(root.join("removed.md"), "oldtoken").unwrap();
    let initial = start(&root, &data);
    cosmos_daemon::call(
        &data,
        VaultCommand::Search {
            query: "oldtoken".into(),
        },
    )
    .unwrap();
    drop(initial);
    let content = "\u{feff}newtoken\r\n";
    std::fs::write(root.join("note.md"), content).unwrap();
    std::fs::remove_file(root.join("removed.md")).unwrap();
    let daemon = Daemon(
        Command::new(env!("CARGO_BIN_EXE_cosmosd"))
            .arg(&root)
            .arg(&data)
            .env("COSMOS_TEST_PAUSE", "search_before_commit")
            .env("COSMOS_TEST_MARKER", &marker)
            .spawn()
            .unwrap(),
    );
    let daemon = wait_ready(daemon, &data);
    thread::scope(|scope| {
        let client = scope.spawn(|| {
            cosmos_daemon::call(
                &data,
                VaultCommand::Search {
                    query: "newtoken".into(),
                },
            )
        });
        for _ in 0..500 {
            if marker.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(marker.exists(), "search fault point not reached");
        drop(daemon);
        assert!(client.join().unwrap().is_err());
    });
    let _daemon = start(&root, &data);
    assert_eq!(
        std::fs::read(root.join("note.md")).unwrap(),
        content.as_bytes()
    );
    let VaultReply::Paths { paths } = cosmos_daemon::call(
        &data,
        VaultCommand::Search {
            query: "newtoken".into(),
        },
    )
    .unwrap() else {
        panic!()
    };
    assert_eq!(paths, ["note.md"]);
    let VaultReply::Paths { paths } = cosmos_daemon::call(
        &data,
        VaultCommand::Search {
            query: "oldtoken".into(),
        },
    )
    .unwrap() else {
        panic!()
    };
    assert!(paths.is_empty());
}
