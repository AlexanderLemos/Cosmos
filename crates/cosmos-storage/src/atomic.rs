//! Atomic file writes (plan §12.3): temp file in the same directory, fsync, atomic rename,
//! directory fsync on Unix, retry with backoff when the target is locked (antivirus or an
//! editor on Windows).

use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use crate::rev::{rev_of, Rev};
use crate::Error;

/// Suffix of temporary files. Orphans are cleaned on daemon start.
pub const TMP_SUFFIX: &str = ".cosmos-tmp";

/// Maximum time spent retrying a locked target before giving up (the caller then queues).
pub const LOCK_RETRY_BUDGET: Duration = Duration::from_secs(5);

/// Write `content` to `path` atomically and return its revision.
pub fn write_atomic(path: &Path, content: &[u8]) -> Result<Rev, Error> {
    write_atomic_with_budget(path, content, LOCK_RETRY_BUDGET)
}

pub(crate) fn write_atomic_with_budget(
    path: &Path,
    content: &[u8],
    budget: Duration,
) -> Result<Rev, Error> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let file_name = path
        .file_name()
        .ok_or_else(|| Error::InvalidPath(path.to_path_buf()))?
        .to_string_lossy()
        .into_owned();

    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::Builder::new()
        .prefix(&format!(".{file_name}."))
        .suffix(TMP_SUFFIX)
        .tempfile_in(dir)?;
    tmp.write_all(content)?;
    tmp.as_file().sync_all()?;

    let started = Instant::now();
    let mut delay = Duration::from_millis(50);
    let mut tmp = tmp;
    loop {
        match tmp.persist(path) {
            Ok(_) => break,
            Err(e) if is_transient(&e.error) && started.elapsed() < budget => {
                tmp = e.file;
                thread::sleep(delay);
                delay = (delay * 2).min(Duration::from_secs(1));
            }
            Err(e) if is_transient(&e.error) => {
                return Err(Error::Locked(path.to_path_buf()));
            }
            Err(e) => return Err(e.error.into()),
        }
    }

    sync_dir(dir)?;
    Ok(rev_of(content))
}

/// Write only if the current content still has `expected` revision (optimistic concurrency,
/// plan §19.2). `None` means "the file must not exist yet".
pub fn write_if_rev(path: &Path, content: &[u8], expected: Option<&Rev>) -> Result<Rev, Error> {
    let current = match fs::read(path) {
        Ok(bytes) => Some(rev_of(&bytes)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    if current.as_ref() != expected {
        return Err(Error::Conflict {
            path: path.to_path_buf(),
            expected: expected.cloned(),
            actual: current,
        });
    }
    write_atomic(path, content)
}

/// Remove orphaned temporary files left by a crash.
pub fn clean_orphans(dir: &Path) -> Result<usize, Error> {
    let mut removed = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        if name.to_string_lossy().ends_with(TMP_SUFFIX) && entry.file_type()?.is_file() {
            fs::remove_file(entry.path())?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn is_transient(e: &io::Error) -> bool {
    // Windows reports sharing violations as PermissionDenied.
    matches!(e.kind(), io::ErrorKind::PermissionDenied) || e.raw_os_error() == Some(32)
}

#[cfg(unix)]
fn sync_dir(dir: &Path) -> io::Result<()> {
    fs::File::open(dir)?.sync_all()
}

#[cfg(not(unix))]
fn sync_dir(_dir: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_returns_rev() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("context.md");
        let rev = write_atomic(&path, b"hello").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        assert_eq!(rev, rev_of(b"hello"));
        assert_eq!(clean_orphans(dir.path()).unwrap(), 0);
    }

    #[test]
    fn creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a/b/c.md");
        write_atomic(&path, b"x").unwrap();
        assert!(path.exists());
    }

    #[test]
    fn conflict_when_rev_changed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("doc.md");
        let r1 = write_if_rev(&path, b"v1", None).unwrap();
        // Someone else writes in between.
        write_atomic(&path, b"external").unwrap();
        let err = write_if_rev(&path, b"v2", Some(&r1)).unwrap_err();
        assert!(matches!(err, Error::Conflict { .. }));
        assert_eq!(fs::read(&path).unwrap(), b"external");
    }

    #[test]
    fn create_only_fails_if_exists() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("doc.md");
        write_atomic(&path, b"user content").unwrap();
        assert!(write_if_rev(&path, b"cosmos", None).is_err());
    }

    #[test]
    fn cleans_orphans() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".x.md.abc.cosmos-tmp"), b"partial").unwrap();
        fs::write(dir.path().join("keep.md"), b"keep").unwrap();
        assert_eq!(clean_orphans(dir.path()).unwrap(), 1);
        assert!(dir.path().join("keep.md").exists());
    }
}
