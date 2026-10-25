//! A bounded invalidation token, not a queue of filesystem contents or raw events.
use cosmos_core::vault::VaultReply;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

pub(super) struct VaultWatcher {
    epoch: String,
    sequence: Arc<AtomicU64>,
    failed: Arc<AtomicBool>,
    _watcher: Option<RecommendedWatcher>,
}
impl VaultWatcher {
    pub fn new(root: &Path) -> Self {
        let sequence = Arc::new(AtomicU64::new(0));
        let failed = Arc::new(AtomicBool::new(false));
        let counter = sequence.clone();
        let failure = failed.clone();
        let directory = root.to_path_buf();
        let watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| match result {
                Ok(event) if relevant(&directory, &event) => {
                    // A backend failure may leave part of the tree unwatched.
                    // Do not advertise recovery merely because another event arrives.
                    if !directory.is_dir() {
                        failure.store(true, Ordering::SeqCst);
                    }
                    counter.fetch_add(1, Ordering::SeqCst);
                }
                Err(_) => {
                    failure.store(true, Ordering::SeqCst);
                    counter.fetch_add(1, Ordering::SeqCst);
                }
                _ => (),
            },
            Config::default().with_follow_symlinks(false),
        )
        .and_then(|mut watcher| {
            watcher.watch(root, RecursiveMode::Recursive)?;
            Ok(watcher)
        })
        .ok();
        Self {
            epoch: ulid::Ulid::new().to_string(),
            sequence,
            failed,
            _watcher: watcher,
        }
    }
    pub fn snapshot(&self) -> VaultReply {
        VaultReply::WatchState {
            revision: format!("{}:{}", self.epoch, self.sequence.load(Ordering::SeqCst)),
            available: self._watcher.is_some() && !self.failed.load(Ordering::SeqCst),
        }
    }
}
fn relevant(root: &Path, event: &Event) -> bool {
    if event.need_rescan() {
        return true;
    }
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    if event.paths.is_empty() {
        return true;
    }
    event.paths.iter().any(|path| {
        // Backend-specific path normalization may differ. Invalidating is safer
        // than losing an event; paths themselves never leave this module.
        let Ok(relative) = path.strip_prefix(root) else {
            return true;
        };
        !relative.components().any(|part| {
            let name = part.as_os_str().to_string_lossy();
            matches!(name.as_ref(), ".git" | ".obsidian" | ".cosmos")
                || name.starts_with(".cosmos-write-")
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RenameMode};
    #[test]
    fn ignores_reads_and_internal_paths_but_keeps_atomic_renames() {
        let root = Path::new("vault");
        assert!(!relevant(
            root,
            &Event::new(EventKind::Access(AccessKind::Read)).add_path(root.join("note.md"))
        ));
        for hidden in [
            ".git/index",
            ".obsidian/app.json",
            ".cosmos/trash/note.md",
            ".cosmos-write-tmp",
        ] {
            assert!(!relevant(
                root,
                &Event::new(EventKind::Create(CreateKind::File)).add_path(root.join(hidden))
            ));
        }
        assert!(relevant(
            root,
            &Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
                .add_path(root.join(".cosmos-write-tmp"))
                .add_path(root.join("note.md"))
        ));
        assert!(relevant(
            root,
            &Event::new(EventKind::Create(CreateKind::File))
                .add_path(root.join("Project/project.cosmos.json"))
        ));
    }
    #[test]
    fn restart_changes_epoch_and_failure_is_explicit() {
        let temp = tempfile::tempdir().unwrap();
        let first = VaultWatcher::new(temp.path());
        let second = VaultWatcher::new(temp.path());
        let VaultReply::WatchState {
            revision: a,
            available,
        } = first.snapshot()
        else {
            panic!()
        };
        assert!(available);
        let VaultReply::WatchState { revision: b, .. } = second.snapshot() else {
            panic!()
        };
        assert_ne!(a, b);
        let missing = VaultWatcher::new(&temp.path().join("missing"));
        assert!(matches!(
            missing.snapshot(),
            VaultReply::WatchState {
                available: false,
                ..
            }
        ));
    }
}
