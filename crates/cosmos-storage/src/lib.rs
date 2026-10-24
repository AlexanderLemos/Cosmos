//! Markdown is authoritative; SQLite holds a durable write journal and a rebuildable index.
use cosmos_core::vault::{Note, VaultCommand, VaultReply};
use fs4::fs_std::FileExt;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};

pub const MAX_NOTE_BYTES: usize = 8 * 1024 * 1024;
pub const SCHEMA_VERSION: i64 = 2;
mod relocate;
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("CONFLICT: {0}")]
    Conflict(String),
    #[error("INVALID_PATH")]
    InvalidPath,
    #[error("VAULT_BUSY")]
    Busy,
    #[error("UNSUPPORTED_DATABASE_VERSION")]
    Version,
    #[error("NOTE_TOO_LARGE")]
    TooLarge,
    #[error("DESTINATION_EXISTS")]
    DestinationExists,
    #[error("PROJECT_STRUCTURE_PROTECTED")]
    Protected,
    #[error("RECOVERY_REQUIRED")]
    RecoveryRequired,
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Sql(#[from] rusqlite::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Serialize, Deserialize)]
struct WriteIntent {
    path: String,
    content: String,
    expected_rev: String,
}
pub struct Vault {
    root: PathBuf,
    db: Connection,
    _lock: File,
}
pub fn revision(content: &[u8]) -> String {
    format!("b3:{}", blake3::hash(content).to_hex())
}

impl Vault {
    pub fn open(root: &Path, data: &Path) -> Result<Self> {
        // The caller must obtain the user's choice before creating/opening this directory.
        fs::create_dir_all(root)?;
        let root = root.canonicalize()?;
        fs::create_dir_all(data)?;
        let data = data.canonicalize()?;
        if data.starts_with(&root) {
            return Err(Error::InvalidPath);
        }
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(data.join("writer.lock"))?;
        if !lock.try_lock_exclusive().map_err(|_| Error::Busy)? {
            return Err(Error::Busy);
        }
        let db = Connection::open(data.join("cosmos.db"))?;
        db.busy_timeout(Duration::from_secs(5))?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > SCHEMA_VERSION {
            return Err(Error::Version);
        }
        if version == 1 {
            // A consistent SQLite backup includes committed WAL content. An old
            // binary refuses v2 instead of ignoring pending relocation records.
            let backup = data.join(format!("cosmos-before-v2-{}.db", ulid::Ulid::new()));
            db.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])?;
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(backup)?
                .sync_all()?;
            #[cfg(unix)]
            File::open(&data)?.sync_all()?;
        }
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS writes(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending');
            CREATE TABLE IF NOT EXISTS relocations(id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending');
            PRAGMA user_version=2; COMMIT;")?;
        db.execute_batch(include_str!("search-schema.sql"))?;
        let mut vault = Self {
            root,
            db,
            _lock: lock,
        };
        vault.recover()?;
        vault.recover_relocations()?;
        Ok(vault)
    }
    fn resolve(&self, path: &str) -> Result<PathBuf> {
        self.resolve_path(path, false)
    }
    fn resolve_path(&self, path: &str, trash: bool) -> Result<PathBuf> {
        // Use the same portable path grammar on every OS, rejecting ADS and device names.
        if path.is_empty()
            || path
                .chars()
                .any(|c| c.is_control() || ['\\', ':', '<', '>', '"', '|', '?', '*'].contains(&c))
            || path.starts_with('/')
        {
            return Err(Error::InvalidPath);
        }
        let mut target = self.root.clone();
        for (index, part) in path.split('/').enumerate() {
            let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
            if part.is_empty()
                || part == "."
                || part == ".."
                || part.ends_with(['.', ' '])
                || (part.starts_with(".cosmos")
                    && !(trash && index == 0 && path.starts_with(".cosmos/trash/")))
                || matches!(part, ".git" | ".obsidian")
                || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                || (stem.len() == 4
                    && (stem.starts_with("COM") || stem.starts_with("LPT"))
                    && stem.as_bytes()[3].is_ascii_digit())
            {
                return Err(Error::InvalidPath);
            }
            target.push(part);
            if let Ok(meta) = fs::symlink_metadata(&target) {
                if meta.file_type().is_symlink() {
                    return Err(Error::InvalidPath);
                }
                if !target.canonicalize()?.starts_with(&self.root) {
                    return Err(Error::InvalidPath);
                }
            }
        }
        Ok(target)
    }
    pub fn read(&self, path: &str) -> Result<Note> {
        let target = self.resolve(path)?;
        if fs::metadata(&target)?.len() > MAX_NOTE_BYTES as u64 {
            return Err(Error::TooLarge);
        }
        let content = fs::read_to_string(target)?;
        Ok(Note {
            path: path.into(),
            rev: revision(content.as_bytes()),
            content,
            can_organize: !self.in_project(path)?,
        })
    }
    fn current_rev(&self, path: &str) -> Result<String> {
        match self.read(path) {
            Ok(note) => Ok(note.rev),
            Err(Error::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e),
        }
    }
    pub fn list(&self) -> Result<Vec<String>> {
        fn walk(root: &Path, dir: &Path, paths: &mut Vec<String>) -> Result<()> {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let kind = entry.file_type()?;
                let name = entry.file_name().to_string_lossy().into_owned();
                if kind.is_symlink() || matches!(name.as_str(), ".cosmos" | ".git" | ".obsidian") {
                    continue;
                }
                if kind.is_dir() {
                    walk(root, &entry.path(), paths)?;
                } else if kind.is_file() && name.to_lowercase().ends_with(".md") {
                    paths.push(
                        entry
                            .path()
                            .strip_prefix(root)
                            .map_err(|_| Error::InvalidPath)?
                            .to_string_lossy()
                            .replace('\\', "/"),
                    );
                }
            }
            Ok(())
        }
        let mut paths = vec![];
        walk(&self.root, &self.root, &mut paths)?;
        paths.sort();
        Ok(paths)
    }
    fn apply(&self, intent: &WriteIntent) -> Result<()> {
        let new_rev = revision(intent.content.as_bytes());
        let current = self.current_rev(&intent.path)?;
        if current == new_rev {
            return Ok(());
        } // replay after rename, before DB acknowledgement
        if current != intent.expected_rev {
            return Err(Error::Conflict(intent.path.clone()));
        }
        let target = self.resolve(&intent.path)?;
        let parent = target.parent().ok_or(Error::InvalidPath)?;
        fs::create_dir_all(parent)?;
        self.resolve(&intent.path)?;
        let mut temp = tempfile::Builder::new()
            .prefix(".cosmos-write-")
            .tempfile_in(parent)?;
        temp.write_all(intent.content.as_bytes())?;
        temp.as_file().sync_all()?;
        // Check again after preparing the new file, preserving an external editor's changes.
        if self.current_rev(&intent.path)? != current {
            return Err(Error::Conflict(intent.path.clone()));
        }
        let mut delay = 20;
        loop {
            match temp.persist(&target) {
                Ok(_) => break,
                Err(error) => {
                    if error.error.kind() != std::io::ErrorKind::PermissionDenied || delay > 2560 {
                        return Err(Error::Io(error.error));
                    }
                    temp = error.file;
                    std::thread::sleep(Duration::from_millis(delay));
                    delay *= 2;
                    if self.current_rev(&intent.path)? != current {
                        return Err(Error::Conflict(intent.path.clone()));
                    }
                }
            }
        }
        #[cfg(unix)]
        File::open(parent)?.sync_all()?;
        fault_checkpoint("after_rename");
        Ok(())
    }
    fn commit(&mut self, writes: Vec<WriteIntent>) -> Result<()> {
        for write in &writes {
            if write.content.len() > MAX_NOTE_BYTES {
                return Err(Error::TooLarge);
            }
            if self.current_rev(&write.path)? != write.expected_rev {
                return Err(Error::Conflict(write.path.clone()));
            }
        }
        self.db.execute(
            "INSERT INTO writes(payload) VALUES (?1)",
            [serde_json::to_string(&writes)?],
        )?;
        let id = self.db.last_insert_rowid();
        fault_checkpoint("after_journal");
        for write in &writes {
            if let Err(e) = self.apply(write) {
                if matches!(e, Error::Conflict(_)) {
                    self.db
                        .execute("UPDATE writes SET state='conflict' WHERE id=?1", [id])?;
                }
                return Err(e);
            }
        }
        self.db
            .execute("UPDATE writes SET state='applied' WHERE id=?1", [id])?;
        Ok(())
    }
    fn recover(&mut self) -> Result<()> {
        let pending: Vec<(i64, String)> = self
            .db
            .prepare("SELECT id,payload FROM writes WHERE state='pending' ORDER BY id")?
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        for (id, payload) in pending {
            let writes: Vec<WriteIntent> = serde_json::from_str(&payload)?;
            let mut state = "applied";
            for write in &writes {
                match self.apply(write) {
                    Ok(()) => (),
                    Err(Error::Conflict(_)) => {
                        state = "conflict";
                        break;
                    }
                    Err(e) => return Err(e),
                }
            }
            self.db
                .execute("UPDATE writes SET state=?1 WHERE id=?2", params![state, id])?;
        }
        Ok(())
    }
    fn search(&mut self, query: &str) -> Result<Vec<String>> {
        // Rebuild from disk so changes made by Obsidian/other editors are immediately visible.
        let paths = self.list()?;
        let notes = paths
            .iter()
            .map(|p| self.read(p))
            .collect::<Result<Vec<_>>>()?;
        let tx = self.db.transaction()?;
        tx.execute("DELETE FROM notes", [])?;
        for note in notes {
            tx.execute(
                "INSERT INTO notes(path,body) VALUES (?1,?2)",
                params![note.path, note.content],
            )?;
        }
        tx.commit()?;
        if query.trim().is_empty() {
            return Ok(paths);
        }
        let phrase = format!("\"{}\"", query.replace('"', "\"\""));
        Ok(self
            .db
            .prepare(include_str!("search-query.sql"))?
            .query_map([phrase], |row| row.get(0))?
            .collect::<std::result::Result<_, _>>()?)
    }
    pub fn execute(&mut self, command: VaultCommand) -> Result<VaultReply> {
        if !matches!(
            &command,
            VaultCommand::List
                | VaultCommand::Read { .. }
                | VaultCommand::Search { .. }
                | VaultCommand::ListTrash
        ) {
            self.ensure_no_pending_relocations()?;
        }
        match command {
            VaultCommand::List => Ok(VaultReply::Paths {
                paths: self.list()?,
            }),
            VaultCommand::Read { path } => Ok(VaultReply::Note(self.read(&path)?)),
            VaultCommand::Move {
                from,
                to,
                expected_rev,
            } => self.move_note(from, to, expected_rev),
            VaultCommand::Trash { path, expected_rev } => self.trash_note(path, expected_rev),
            VaultCommand::ListTrash => Ok(VaultReply::TrashEntries {
                entries: self.list_trash()?,
            }),
            VaultCommand::Restore {
                id,
                to,
                expected_rev,
            } => self.restore_note(id, to, expected_rev),
            VaultCommand::Write {
                path,
                content,
                expected_rev,
            } => {
                if !path.to_lowercase().ends_with(".md") {
                    return Err(Error::InvalidPath);
                }
                let rev = revision(content.as_bytes());
                self.commit(vec![WriteIntent {
                    path,
                    content,
                    expected_rev,
                }])?;
                Ok(VaultReply::Saved { rev })
            }
            VaultCommand::Search { query } => Ok(VaultReply::Paths {
                paths: self.search(&query)?,
            }),
            VaultCommand::CreateProject { name, universe } => {
                if name.trim().is_empty()
                    || universe.trim().is_empty()
                    || name.contains('/')
                    || universe.contains('/')
                {
                    return Err(Error::InvalidPath);
                }
                let path = format!("Universos/{universe}/{name}");
                let folder = self.resolve(&path)?;
                if folder.exists() {
                    return Err(Error::Conflict(path));
                }
                let id = format!("prj_{}", ulid::Ulid::new());
                let created_at = time::OffsetDateTime::now_utc()
                    .format(&time::format_description::well_known::Rfc3339)
                    .map_err(std::io::Error::other)?;
                let meta = serde_json::json!({"format_version":1,"id":id,"display_name":name,"universe":universe,"bindings":[],"created_at":created_at});
                let mut writes = vec![WriteIntent {
                    path: format!("{path}/project.cosmos.json"),
                    content: format!("{}\n", serde_json::to_string_pretty(&meta)?),
                    expected_rev: String::new(),
                }];
                for (file, title) in [
                    ("context", "Contexto · Context"),
                    ("requirements", "Requisitos · Requirements"),
                    ("architecture", "Arquitetura · Architecture"),
                    ("decisions", "Decisões · Decisions"),
                    ("progress", "Progresso · Progress"),
                    ("tasks", "Tarefas · Tasks"),
                ] {
                    // JSON strings are also valid quoted YAML scalars; never interpolate unescaped names.
                    let content = format!(
                        "---\ncosmos_project: {}\ncosmos_doc: {file}\n---\n# {title}\n\n<!-- cosmos:begin section=summary -->\n<!-- cosmos:end -->\n\n## Notas · Notes\n",
                        serde_json::to_string(&id)?
                    );
                    writes.push(WriteIntent {
                        path: format!("{path}/{file}.md"),
                        content,
                        expected_rev: String::new(),
                    });
                }
                self.commit(writes)?;
                Ok(VaultReply::Project {
                    path: format!("{path}/context.md"),
                })
            }
        }
    }
}

// Only linked by the dedicated fault-injection test build, never the distributed sidecar.
fn fault_checkpoint(_stage: &str) {
    #[cfg(feature = "fault-injection")]
    if std::env::var("COSMOS_TEST_PAUSE").as_deref() == Ok(_stage) {
        if let Some(marker) = std::env::var_os("COSMOS_TEST_MARKER") {
            std::fs::write(marker, _stage).expect("write test marker");
            loop {
                std::thread::park();
            }
        }
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
    fn write(vault: &mut Vault, path: &str, content: &str, expected: &str) -> Result<VaultReply> {
        vault.execute(VaultCommand::Write {
            path: path.into(),
            content: content.into(),
            expected_rev: expected.into(),
        })
    }
    #[test]
    fn round_trip_preserves_obsidian_and_detects_external_changes() {
        let (temp, mut vault) = fixture();
        let original =
            "\u{feff}---\r\naliases: [ideia]\r\n---\n# Órbita\r\n[[Outra|Nome]]\n![[a.png]]\r\n";
        write(&mut vault, "Universos/Pessoal/nota.md", original, "").unwrap();
        let note = vault.read("Universos/Pessoal/nota.md").unwrap();
        assert_eq!(note.content.as_bytes(), original.as_bytes());
        fs::write(
            temp.path().join("vault/Universos/Pessoal/nota.md"),
            "edição externa",
        )
        .unwrap();
        assert!(matches!(
            write(&mut vault, &note.path, "stale", &note.rev),
            Err(Error::Conflict(_))
        ));
        assert_eq!(vault.read(&note.path).unwrap().content, "edição externa");
        assert!(!temp.path().join("vault/cosmos.db").exists());
    }
    #[test]
    fn lock_is_exclusive_and_released_on_drop() {
        let (temp, vault) = fixture();
        let root = temp.path().join("vault");
        let data = temp.path().join("data");
        assert!(matches!(Vault::open(&root, &data), Err(Error::Busy)));
        drop(vault);
        assert!(Vault::open(&root, &data).is_ok());
    }
    #[test]
    fn pending_writes_replay_and_never_overwrite_external_edits() {
        for (renamed, external) in [(false, false), (true, false), (false, true)] {
            let (temp, vault) = fixture();
            let intent = WriteIntent {
                path: "a.md".into(),
                content: "durável".into(),
                expected_rev: String::new(),
            };
            vault
                .db
                .execute(
                    "INSERT INTO writes(payload) VALUES (?1)",
                    [serde_json::to_string(&vec![&intent]).unwrap()],
                )
                .unwrap();
            if renamed {
                vault.apply(&intent).unwrap();
            }
            if external {
                fs::write(temp.path().join("vault/a.md"), "humano").unwrap();
            }
            drop(vault);
            let recovered =
                Vault::open(&temp.path().join("vault"), &temp.path().join("data")).unwrap();
            assert_eq!(
                recovered.read("a.md").unwrap().content,
                if external { "humano" } else { "durável" }
            );
            let state: String = recovered
                .db
                .query_row("SELECT state FROM writes", [], |r| r.get(0))
                .unwrap();
            assert_eq!(state, if external { "conflict" } else { "applied" });
        }
    }
    #[test]
    fn invalid_paths_and_symlinks_cannot_escape_the_vault() {
        let (temp, mut vault) = fixture();
        for path in [
            "../escape.md",
            "/absolute.md",
            "C:/a.md",
            "a\\b.md",
            "a//b.md",
            ".git/config.md",
            "CON.md",
            "x/../a.md",
            "a.md:stream",
            ".cosmos/x.md",
        ] {
            assert!(write(&mut vault, path, "x", "").is_err(), "{path}");
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(temp.path(), temp.path().join("vault/link")).unwrap();
            assert!(write(&mut vault, "link/escape.md", "x", "").is_err());
        }
        assert!(!temp.path().join("escape.md").exists());
    }
    #[test]
    fn project_documents_are_portable_and_creation_never_overwrites() {
        let (temp, mut vault) = fixture();
        let command = VaultCommand::CreateProject {
            name: "Órbita".into(),
            universe: "Dev".into(),
        };
        vault.execute(command.clone()).unwrap();
        assert!(matches!(vault.execute(command), Err(Error::Conflict(_))));
        assert_eq!(vault.list().unwrap().len(), 6);
        let meta: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(
                temp.path()
                    .join("vault/Universos/Dev/Órbita/project.cosmos.json"),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(meta["format_version"], 1);
        assert_eq!(meta["bindings"], serde_json::json!([]));
        assert!(!temp.path().join("vault/.cosmos/project.json").exists());
    }
    #[test]
    fn fts_finds_accents_and_external_changes_without_sql_injection() {
        let (temp, mut vault) = fixture();
        write(&mut vault, "orbita.md", "# Órbita\nConhecimento", "").unwrap();
        assert_eq!(vault.search("orbita").unwrap(), vec!["orbita.md"]);
        fs::write(temp.path().join("vault/externa.md"), "atualização").unwrap();
        assert_eq!(vault.search("atualizacao").unwrap(), vec!["externa.md"]);
        assert!(vault.search("\" OR 1=1 --").unwrap().is_empty());
    }
    #[test]
    fn refuses_future_schema_without_downgrading() {
        let (temp, vault) = fixture();
        vault.db.execute_batch("PRAGMA user_version=99").unwrap();
        drop(vault);
        assert!(matches!(
            Vault::open(&temp.path().join("vault"), &temp.path().join("data")),
            Err(Error::Version)
        ));
    }
}
