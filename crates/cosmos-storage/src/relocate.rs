//! Copy durably without replacing a destination, then remove the checked source.
//! A crash in the narrow copy/acknowledgement gap retains both files as a conflict.
use super::*;
use cosmos_core::vault::TrashEntry;
use rusqlite::OptionalExtension;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Kind {
    Move,
    Trash,
    Restore,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Relocation {
    kind: Kind,
    from: String,
    to: String,
    expected_rev: String,
}
impl Vault {
    pub(super) fn in_project(&self, path: &str) -> Result<bool> {
        let mut directory = self
            .resolve(path)?
            .parent()
            .ok_or(Error::InvalidPath)?
            .to_path_buf();
        loop {
            if directory.join("project.cosmos.json").try_exists()? {
                return Ok(true);
            }
            if directory == self.root {
                return Ok(false);
            }
            if !directory.pop() {
                return Err(Error::InvalidPath);
            }
        }
    }
    fn organizable(&self, path: &str) -> Result<PathBuf> {
        if !path.to_lowercase().ends_with(".md") {
            return Err(Error::InvalidPath);
        }
        let target = self.resolve(path)?;
        if self.in_project(path)? {
            return Err(Error::Protected);
        }
        Ok(target)
    }
    fn relocation_paths(&self, op: &Relocation) -> Result<(PathBuf, PathBuf)> {
        let from = match op.kind {
            Kind::Restore => self.resolve_path(&op.from, true)?,
            _ => self.organizable(&op.from)?,
        };
        let to = match op.kind {
            Kind::Trash => self.resolve_path(&op.to, true)?,
            _ => self.organizable(&op.to)?,
        };
        Ok((from, to))
    }
    fn read_bytes(path: &Path) -> Result<Vec<u8>> {
        let metadata = fs::metadata(path)?;
        if !metadata.is_file() {
            return Err(Error::InvalidPath);
        }
        if metadata.len() > MAX_NOTE_BYTES as u64 {
            return Err(Error::TooLarge);
        }
        Ok(fs::read(path)?)
    }
    fn relocation_bytes(path: &Path, label: &str) -> Result<Vec<u8>> {
        match Self::read_bytes(path) {
            Err(Error::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                Err(Error::Conflict(label.into()))
            }
            result => result,
        }
    }
    fn check_destination(&self, path: &Path) -> Result<()> {
        // Reject case-only collisions on Linux too, including directory components.
        let mut parent = self.root.clone();
        for component in path
            .strip_prefix(&self.root)
            .map_err(|_| Error::InvalidPath)?
            .components()
        {
            let name = component.as_os_str();
            if parent.is_dir() {
                for entry in fs::read_dir(&parent)? {
                    let entry = entry?;
                    if entry.file_name().to_string_lossy().to_lowercase()
                        == name.to_string_lossy().to_lowercase()
                        && (entry.file_name() != name || parent.join(name) == path)
                    {
                        return Err(Error::DestinationExists);
                    }
                }
            }
            parent.push(name);
        }
        Ok(())
    }
    pub(super) fn ensure_no_pending_relocations(&self) -> Result<()> {
        let count: i64 = self.db.query_row(
            "SELECT count(*) FROM relocations WHERE state IN ('pending','copied')",
            [],
            |r| r.get(0),
        )?;
        if count != 0 {
            return Err(Error::RecoveryRequired);
        }
        Ok(())
    }
    fn relocate(&mut self, id: &str, op: &Relocation) -> Result<()> {
        let (from, to) = self.relocation_paths(op)?;
        let content = Self::read_bytes(&from)?;
        if revision(&content) != op.expected_rev {
            return Err(Error::Conflict(op.from.clone()));
        }
        self.check_destination(&to)?;
        self.db.execute(
            "INSERT INTO relocations(id,payload) VALUES (?1,?2)",
            params![id, serde_json::to_string(op)?],
        )?;
        fault_checkpoint("relocation_journal");
        self.finish_relocation(id, op, "pending")
    }
    fn finish_relocation(&mut self, id: &str, op: &Relocation, state: &str) -> Result<()> {
        let result = self.apply_relocation(id, op, state);
        if matches!(
            result,
            Err(Error::Conflict(_)
                | Error::DestinationExists
                | Error::InvalidPath
                | Error::Protected)
        ) {
            self.db
                .execute("UPDATE relocations SET state='conflict' WHERE id=?1", [id])?;
        }
        result
    }
    fn apply_relocation(&mut self, id: &str, op: &Relocation, state: &str) -> Result<()> {
        let (from, to) = self.relocation_paths(op)?;
        let parent = to.parent().ok_or(Error::InvalidPath)?;
        if state == "pending" {
            // Never infer that a pre-existing destination belongs to this operation,
            // even when its content matches. Keep the original for manual recovery.
            self.check_destination(&to)?;
            let bytes = Self::relocation_bytes(&from, &op.from)?;
            if revision(&bytes) != op.expected_rev {
                return Err(Error::Conflict(op.from.clone()));
            }
            fs::create_dir_all(parent)?;
            self.relocation_paths(op)?;
            // Persist the links of newly created parent directories before the
            // source can be removed (syncing only the leaf directory is insufficient).
            #[cfg(unix)]
            {
                let mut directory = parent;
                loop {
                    File::open(directory)?.sync_all()?;
                    if directory == self.root {
                        break;
                    }
                    directory = directory.parent().ok_or(Error::InvalidPath)?;
                }
            }
            let mut temp = tempfile::Builder::new()
                .prefix(".cosmos-write-")
                .tempfile_in(parent)?;
            temp.write_all(&bytes)?;
            temp.as_file().sync_all()?;
            self.check_destination(&to)?;
            temp.persist_noclobber(&to).map_err(|e| {
                if e.error.kind() == std::io::ErrorKind::AlreadyExists {
                    Error::DestinationExists
                } else {
                    Error::Io(e.error)
                }
            })?;
            #[cfg(unix)]
            File::open(parent)?.sync_all()?;
            fault_checkpoint("relocation_published");
            self.db
                .execute("UPDATE relocations SET state='copied' WHERE id=?1", [id])?;
            fault_checkpoint("relocation_copied");
        }
        // Revalidate both paths and contents before deleting anything. As with
        // writes, external editors do not participate in the daemon's OS lock.
        self.relocation_paths(op)?;
        if revision(&Self::relocation_bytes(&to, &op.to)?) != op.expected_rev {
            return Err(Error::Conflict(op.to.clone()));
        }
        let mut delay = 20;
        loop {
            self.relocation_paths(op)?;
            match Self::read_bytes(&from) {
                Ok(bytes) if revision(&bytes) != op.expected_rev => {
                    return Err(Error::Conflict(op.from.clone()));
                }
                Ok(_) => (),
                Err(Error::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => break,
                Err(e) => return Err(e),
            }
            if revision(&Self::relocation_bytes(&to, &op.to)?) != op.expected_rev {
                return Err(Error::Conflict(op.to.clone()));
            }
            match fs::remove_file(&from) {
                Ok(()) => break,
                Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied && delay <= 2560 => {
                    std::thread::sleep(Duration::from_millis(delay));
                    delay *= 2;
                }
                Err(e) => return Err(e.into()),
            }
        }
        #[cfg(unix)]
        File::open(from.parent().ok_or(Error::InvalidPath)?)?.sync_all()?;
        fault_checkpoint("relocation_removed");
        self.db
            .execute("UPDATE relocations SET state='applied' WHERE id=?1", [id])?;
        Ok(())
    }
    pub(super) fn recover_relocations(&mut self) -> Result<()> {
        let pending: Vec<(String, String, String)> = self.db.prepare("SELECT id,payload,state FROM relocations WHERE state IN ('pending','copied') ORDER BY rowid")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<std::result::Result<_, _>>()?;
        for (id, payload, state) in pending {
            let op: Relocation = serde_json::from_str(&payload)?;
            match self.finish_relocation(&id, &op, &state) {
                Ok(())
                | Err(
                    Error::Conflict(_)
                    | Error::DestinationExists
                    | Error::InvalidPath
                    | Error::Protected,
                ) => (),
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }
    pub(super) fn move_note(
        &mut self,
        from: String,
        to: String,
        expected_rev: String,
    ) -> Result<VaultReply> {
        self.relocate(
            &ulid::Ulid::new().to_string(),
            &Relocation {
                kind: Kind::Move,
                from,
                to: to.clone(),
                expected_rev,
            },
        )?;
        Ok(VaultReply::Moved { path: to })
    }
    pub(super) fn trash_note(&mut self, path: String, expected_rev: String) -> Result<VaultReply> {
        let id = ulid::Ulid::new().to_string();
        let to = format!(".cosmos/trash/{id}/{path}");
        self.relocate(
            &id,
            &Relocation {
                kind: Kind::Trash,
                from: path,
                to,
                expected_rev,
            },
        )?;
        Ok(VaultReply::Trashed { id })
    }
    fn trash_record(&self, id: &str) -> Result<Relocation> {
        let payload: Option<String> = self
            .db
            .query_row(
                "SELECT payload FROM relocations WHERE id=?1 AND state='applied'",
                [id],
                |r| r.get(0),
            )
            .optional()?;
        let op: Relocation = serde_json::from_str(&payload.ok_or(Error::InvalidPath)?)?;
        if !matches!(op.kind, Kind::Trash) {
            return Err(Error::InvalidPath);
        }
        Ok(op)
    }
    pub(super) fn list_trash(&self) -> Result<Vec<TrashEntry>> {
        let records: Vec<(String, String)> = self
            .db
            .prepare(
                "SELECT id,payload FROM relocations WHERE state='applied' ORDER BY rowid DESC",
            )?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let mut entries = vec![];
        for (id, payload) in records {
            let op: Relocation = serde_json::from_str(&payload)?;
            if !matches!(op.kind, Kind::Trash) {
                continue;
            }
            let path = self.resolve_path(&op.to, true)?;
            match Self::read_bytes(&path) {
                Ok(bytes) => entries.push(TrashEntry {
                    id,
                    path: op.from,
                    rev: revision(&bytes),
                }),
                Err(Error::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e),
            }
        }
        Ok(entries)
    }
    pub(super) fn restore_note(
        &mut self,
        id: String,
        to: String,
        expected_rev: String,
    ) -> Result<VaultReply> {
        let original = self.trash_record(&id)?;
        self.relocate(
            &ulid::Ulid::new().to_string(),
            &Relocation {
                kind: Kind::Restore,
                from: original.to,
                to: to.clone(),
                expected_rev,
            },
        )?;
        Ok(VaultReply::Moved { path: to })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Vault) {
        let temp = tempfile::tempdir().unwrap();
        let vault = Vault::open(&temp.path().join("vault"), &temp.path().join("data")).unwrap();
        (temp, vault)
    }
    fn seed(vault: &Vault, path: &str, text: &str) -> String {
        fs::write(vault.root.join(path), text).unwrap();
        revision(text.as_bytes())
    }
    #[test]
    fn move_trash_and_restore_preserve_bytes_and_never_overwrite() {
        let (temp, mut vault) = fixture();
        let text = "\u{feff}---\r\naliases: [ideia]\r\n---\n# Órbita\r\n";
        let rev = seed(&vault, "a.md", text);
        seed(&vault, "b.md", "keep");
        assert!(matches!(
            vault.move_note("a.md".into(), "b.md".into(), rev.clone()),
            Err(Error::DestinationExists)
        ));
        assert!(matches!(
            vault.move_note("a.md".into(), "new.md".into(), "stale".into()),
            Err(Error::Conflict(_))
        ));
        assert!(matches!(
            vault.move_note("a.md".into(), "A.md".into(), rev.clone()),
            Err(Error::DestinationExists)
        ));
        vault
            .move_note("a.md".into(), "Folder/moved.md".into(), rev.clone())
            .unwrap();
        assert!(!vault.root.join("a.md").exists());
        assert_eq!(vault.read("Folder/moved.md").unwrap().content, text);
        assert_eq!(vault.search("orbita").unwrap(), vec!["Folder/moved.md"]);
        let VaultReply::Trashed { id } = vault
            .trash_note("Folder/moved.md".into(), rev.clone())
            .unwrap()
        else {
            panic!()
        };
        assert!(vault.search("orbita").unwrap().is_empty());
        drop(vault);
        let mut vault = Vault::open(&temp.path().join("vault"), &temp.path().join("data")).unwrap();
        let entries = vault.list_trash().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(entries[0].path, "Folder/moved.md");
        assert!(matches!(
            vault.restore_note(id.clone(), "b.md".into(), rev.clone()),
            Err(Error::DestinationExists)
        ));
        assert!(matches!(
            vault.restore_note(id.clone(), "restored.md".into(), "stale".into()),
            Err(Error::Conflict(_))
        ));
        vault.restore_note(id, "restored.md".into(), rev).unwrap();
        assert!(vault.list_trash().unwrap().is_empty());
        assert_eq!(
            fs::read(vault.root.join("restored.md")).unwrap(),
            text.as_bytes()
        );
        assert_eq!(vault.read("b.md").unwrap().content, "keep");
    }
    #[test]
    fn structural_project_files_and_invalid_paths_are_protected() {
        let (_temp, mut vault) = fixture();
        let rev = seed(&vault, "a.md", "hello");
        vault
            .execute(VaultCommand::CreateProject {
                name: "Project".into(),
                universe: "Dev".into(),
            })
            .unwrap();
        let project = "Universos/Dev/Project/context.md";
        let note = vault.read(project).unwrap();
        assert!(!note.can_organize);
        assert!(matches!(
            vault.trash_note(project.into(), note.rev),
            Err(Error::Protected)
        ));
        for target in [
            "../outside.md",
            ".cosmos/trash/fake.md",
            "Universos/Dev/Project/new.md",
            "NUL.md",
            "file.txt",
        ] {
            assert!(
                vault
                    .move_note("a.md".into(), target.into(), rev.clone())
                    .is_err(),
                "{target}"
            );
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(vault.root.parent().unwrap(), vault.root.join("link"))
                .unwrap();
            assert!(
                vault
                    .move_note("a.md".into(), "link/out.md".into(), rev.clone())
                    .is_err()
            );
        }
        assert_eq!(vault.read("a.md").unwrap().content, "hello");
        assert_eq!(vault.list().unwrap().len(), 7);
    }
    #[test]
    fn recovery_preserves_external_edits_and_unacknowledged_destinations() {
        for (state, external) in [
            ("pending", "same"),
            ("copied", "source"),
            ("copied", "destination"),
            ("copied", "none"),
        ] {
            let (temp, vault) = fixture();
            let rev = seed(&vault, "a.md", "original");
            seed(
                &vault,
                "b.md",
                if external == "destination" {
                    "external destination"
                } else {
                    "original"
                },
            );
            if external == "source" {
                seed(&vault, "a.md", "external source");
            }
            let op = Relocation {
                kind: Kind::Move,
                from: "a.md".into(),
                to: "b.md".into(),
                expected_rev: rev,
            };
            vault
                .db
                .execute(
                    "INSERT INTO relocations(id,payload,state) VALUES ('op',?1,?2)",
                    params![serde_json::to_string(&op).unwrap(), state],
                )
                .unwrap();
            drop(vault);
            let vault = Vault::open(&temp.path().join("vault"), &temp.path().join("data")).unwrap();
            assert_eq!(vault.root.join("a.md").exists(), external != "none");
            assert_eq!(
                vault.read("b.md").unwrap().content,
                if external == "destination" {
                    "external destination"
                } else {
                    "original"
                }
            );
            if external == "source" {
                assert_eq!(vault.read("a.md").unwrap().content, "external source");
            }
            let result: String = vault
                .db
                .query_row("SELECT state FROM relocations", [], |r| r.get(0))
                .unwrap();
            assert_eq!(
                result,
                if external == "none" {
                    "applied"
                } else {
                    "conflict"
                }
            );
        }
    }
    #[test]
    fn upgrading_v1_keeps_a_consistent_backup_and_pending_writes() {
        let (temp, vault) = fixture();
        let intent = WriteIntent {
            path: "pending.md".into(),
            content: "recover".into(),
            expected_rev: String::new(),
        };
        vault
            .db
            .execute(
                "INSERT INTO writes(payload) VALUES (?1)",
                [serde_json::to_string(&vec![intent]).unwrap()],
            )
            .unwrap();
        vault
            .db
            .execute_batch("DROP TABLE relocations; PRAGMA user_version=1;")
            .unwrap();
        drop(vault);
        let vault = Vault::open(&temp.path().join("vault"), &temp.path().join("data")).unwrap();
        assert_eq!(vault.read("pending.md").unwrap().content, "recover");
        let backups: Vec<_> = fs::read_dir(temp.path().join("data"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("cosmos-before-v2-")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        let backup = Connection::open(&backups[0]).unwrap();
        assert_eq!(
            backup
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            backup
                .query_row("SELECT state FROM writes", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "pending"
        );
        assert_eq!(
            vault
                .db
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
}
