use super::{Result, Vault, fault_checkpoint};
use rusqlite::params;

#[derive(Debug, Default, PartialEq)]
struct IndexChanges {
    indexed: usize,
    removed: usize,
}

impl Vault {
    fn reconcile_index(&self, paths: &[String]) -> Result<IndexChanges> {
        // The vault serializes all commands. This shared borrow lets each file be
        // read within the transaction without collecting the whole vault in RAM.
        let tx = self.db.unchecked_transaction()?;
        tx.execute_batch(include_str!("search-scan.sql"))?;
        let mut changes = IndexChanges::default();
        for path in paths {
            // Hash the actual bytes, not only size/mtime or a possibly delayed event.
            // A failed read rolls back the entire scan; never publish partial results.
            let note = self.read(path)?;
            tx.execute(include_str!("search-seen.sql"), [path])?;
            changes.indexed += tx.execute(
                include_str!("search-upsert.sql"),
                params![note.path, note.rev, note.content],
            )?;
        }
        changes.removed = tx.execute(include_str!("search-prune.sql"), [])?;
        fault_checkpoint("search_before_commit");
        tx.commit()?;
        Ok(changes)
    }

    pub(super) fn search(&self, query: &str) -> Result<Vec<String>> {
        let paths = self.list()?;
        if query.trim().is_empty() {
            return Ok(paths);
        }
        self.reconcile_index(&paths)?;
        let phrase = format!("\"{}\"", query.replace('"', "\"\""));
        Ok(self
            .db
            .prepare(include_str!("search-query.sql"))?
            .query_map([phrase], |row| row.get(0))?
            .collect::<std::result::Result<_, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SCHEMA_VERSION, tests::fixture};
    use cosmos_core::vault::{VaultCommand, VaultReply};
    use rusqlite::Connection;
    use std::{fs, fs::FileTimes};

    fn scan(vault: &Vault) -> IndexChanges {
        vault.reconcile_index(&vault.list().unwrap()).unwrap()
    }
    fn rows(vault: &Vault) -> Vec<(i64, String, String)> {
        vault
            .db
            .prepare("SELECT id,path,body FROM search_documents ORDER BY path")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    #[test]
    fn only_changed_revisions_are_indexed_even_when_size_and_mtime_match() {
        let (temp, vault) = fixture();
        let root = temp.path().join("vault");
        for number in 0..32 {
            fs::write(root.join(format!("note-{number:02}.md")), "oldtoken").unwrap();
        }
        assert_eq!(
            scan(&vault),
            IndexChanges {
                indexed: 32,
                removed: 0
            }
        );
        let before = rows(&vault);
        assert_eq!(scan(&vault), IndexChanges::default());
        assert_eq!(rows(&vault), before);
        let changed = root.join("note-07.md");
        let modified = fs::metadata(&changed).unwrap().modified().unwrap();
        fs::write(&changed, "newtoken").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&changed)
            .unwrap()
            .set_times(FileTimes::new().set_modified(modified))
            .unwrap();
        assert_eq!(
            scan(&vault),
            IndexChanges {
                indexed: 1,
                removed: 0
            }
        );
        let after = rows(&vault);
        assert_eq!(after[7].0, before[7].0);
        assert_eq!(after[7].2, "newtoken");
        assert_eq!(vault.search("newtoken").unwrap(), ["note-07.md"]);
        assert_eq!(vault.search("oldtoken").unwrap().len(), 31);
        assert_eq!(scan(&vault), IndexChanges::default());
        drop(vault);
        let reopened = Vault::open(&root, &temp.path().join("data")).unwrap();
        assert_eq!(scan(&reopened), IndexChanges::default());
        assert_eq!(rows(&reopened), after);
        reopened
            .db
            .execute(
                "INSERT INTO notes(notes,rank) VALUES('integrity-check',1)",
                [],
            )
            .unwrap();
    }

    #[test]
    fn rename_trash_restore_and_an_empty_vault_remove_stale_hits() {
        let (temp, mut vault) = fixture();
        let root = temp.path().join("vault");
        let content = "\u{feff}Órbita\r\n";
        fs::write(root.join("a.md"), content).unwrap();
        assert_eq!(vault.search("orbita").unwrap(), ["a.md"]);
        fs::rename(root.join("a.md"), root.join("b.md")).unwrap();
        assert_eq!(
            scan(&vault),
            IndexChanges {
                indexed: 1,
                removed: 1
            }
        );
        assert_eq!(vault.search("orbita").unwrap(), ["b.md"]);
        let VaultReply::Trashed { id } = vault
            .execute(VaultCommand::Trash {
                path: "b.md".into(),
                expected_rev: crate::revision(content.as_bytes()),
            })
            .unwrap()
        else {
            panic!()
        };
        assert!(vault.search("orbita").unwrap().is_empty());
        assert!(rows(&vault).is_empty());
        vault
            .execute(VaultCommand::Restore {
                id,
                to: "restored.md".into(),
                expected_rev: crate::revision(content.as_bytes()),
            })
            .unwrap();
        assert_eq!(vault.search("orbita").unwrap(), ["restored.md"]);
        assert_eq!(
            fs::read(root.join("restored.md")).unwrap(),
            content.as_bytes()
        );
        vault
            .db
            .execute(
                "INSERT INTO notes(notes,rank) VALUES('integrity-check',1)",
                [],
            )
            .unwrap();
    }

    #[test]
    fn unreadable_note_rolls_back_updates_and_deletions_until_a_complete_scan() {
        let (temp, vault) = fixture();
        let root = temp.path().join("vault");
        for name in ["a.md", "deleted.md", "z.md"] {
            fs::write(root.join(name), "original").unwrap();
        }
        scan(&vault);
        let before = rows(&vault);
        fs::write(root.join("a.md"), "updated").unwrap();
        fs::remove_file(root.join("deleted.md")).unwrap();
        fs::write(root.join("z.md"), [255]).unwrap();
        assert!(vault.search("updated").is_err());
        assert_eq!(rows(&vault), before);
        fs::write(root.join("z.md"), "original").unwrap();
        assert_eq!(
            scan(&vault),
            IndexChanges {
                indexed: 1,
                removed: 1
            }
        );
        assert_eq!(vault.search("updated").unwrap(), ["a.md"]);
        assert_eq!(vault.search("original").unwrap(), ["z.md"]);
    }

    #[test]
    fn v2_upgrade_backs_up_journals_and_rebuilds_only_the_search_cache() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("vault");
        let data = temp.path().join("data");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&data).unwrap();
        fs::write(root.join("note.md"), "authoritative source\r\n").unwrap();
        let old = Connection::open(data.join("cosmos.db")).unwrap();
        old.execute_batch("PRAGMA journal_mode=WAL;
            CREATE TABLE writes(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending');
            INSERT INTO writes(payload,state) VALUES('[]','conflict');
            CREATE TABLE relocations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending');
            INSERT INTO relocations VALUES('keep','{}','conflict');
            CREATE VIRTUAL TABLE notes USING fts5(path UNINDEXED,body,tokenize='unicode61 remove_diacritics 2');
            INSERT INTO notes VALUES('stale.md','obsolete'); PRAGMA user_version=2;").unwrap();
        drop(old);
        let vault = Vault::open(&root, &data).unwrap();
        assert_eq!(vault.search("authoritative").unwrap(), ["note.md"]);
        assert!(vault.search("obsolete").unwrap().is_empty());
        assert_eq!(
            vault
                .db
                .query_row("SELECT state FROM writes", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "conflict"
        );
        assert_eq!(
            vault
                .db
                .query_row("SELECT state FROM relocations", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "conflict"
        );
        assert_eq!(
            vault
                .db
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            SCHEMA_VERSION
        );
        let backup_path = fs::read_dir(&data)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("cosmos-before-v3-")
            })
            .unwrap();
        let backup = Connection::open(backup_path).unwrap();
        assert_eq!(
            backup
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            backup
                .query_row("SELECT path FROM notes", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "stale.md"
        );
        assert_eq!(
            backup
                .query_row("SELECT state FROM relocations", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "conflict"
        );
        assert_eq!(
            fs::read(root.join("note.md")).unwrap(),
            b"authoritative source\r\n"
        );
    }
}
