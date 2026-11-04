//! SQLite internal database: WAL, foreign keys, ordered migrations tracked by
//! `PRAGMA user_version`.

use std::path::Path;

use rusqlite::Connection;

use crate::Error;

/// Ordered migrations. Never edit a released migration; append a new one.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_initial.sql")];

/// Schema version this build understands.
pub const SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

pub fn open(path: &Path) -> Result<Connection, Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // FULL on the event trail: an acknowledged event must survive a crash (plan §13.5).
    conn.pragma_update(None, "synchronous", "FULL")?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> Result<Connection, Error> {
    let conn = Connection::open_in_memory()?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> Result<(), Error> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

/// Apply pending migrations in one transaction each. Refuses databases created by a newer
/// build instead of guessing (requirement R18).
pub fn migrate(conn: &Connection) -> Result<u32, Error> {
    let current: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if current > SCHEMA_VERSION {
        return Err(Error::SchemaTooNew {
            found: current,
            supported: SCHEMA_VERSION,
        });
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let version = i as u32 + 1;
        conn.execute_batch(&format!(
            "BEGIN;\n{sql}\nPRAGMA user_version = {version};\nCOMMIT;"
        ))?;
    }
    Ok(SCHEMA_VERSION)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_fresh_db() {
        let conn = open_in_memory().unwrap();
        let v: u32 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
    }

    #[test]
    fn migration_is_idempotent() {
        let conn = open_in_memory().unwrap();
        assert_eq!(migrate(&conn).unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn mirror_is_off_by_default() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO projects (id, slug, display_name, created_at) VALUES ('prj_x','x','X',0)",
            [],
        )
        .unwrap();
        let (mirror, manifest): (i64, i64) = conn
            .query_row(
                "SELECT mirror_enabled, repo_manifest_enabled FROM projects",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((mirror, manifest), (0, 0));
    }

    #[test]
    fn idempotency_key_is_unique() {
        let conn = open_in_memory().unwrap();
        let insert = "INSERT INTO events (id, idempotency_key, agent, type, created_at)
                      VALUES (?1, 'same-key', 'codex', 'checkpoint', 0)";
        conn.execute(insert, ["01A"]).unwrap();
        assert!(conn.execute(insert, ["01B"]).is_err());
    }

    #[test]
    fn fts5_ignores_diacritics() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO fts (project_id, doc, section, body) VALUES ('p','requirements','R-005','Autenticação biométrica')",
            [],
        )
        .unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT count(*) FROM fts WHERE fts MATCH 'autenticacao'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn refuses_newer_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        assert!(matches!(migrate(&conn), Err(Error::SchemaTooNew { .. })));
    }

    #[test]
    fn opens_file_db_in_wal() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open(&dir.path().join("cosmos.db")).unwrap();
        let mode: String = conn
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }
}
