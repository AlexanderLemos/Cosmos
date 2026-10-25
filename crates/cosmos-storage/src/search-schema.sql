CREATE TABLE IF NOT EXISTS search_documents (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  revision TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(
  path UNINDEXED, body, content='search_documents', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS search_insert AFTER INSERT ON search_documents BEGIN
  INSERT INTO notes(rowid, path, body) VALUES (new.id, new.path, new.body);
END;
CREATE TRIGGER IF NOT EXISTS search_delete AFTER DELETE ON search_documents BEGIN
  INSERT INTO notes(notes, rowid, path, body) VALUES ('delete', old.id, old.path, old.body);
END;
CREATE TRIGGER IF NOT EXISTS search_update AFTER UPDATE ON search_documents BEGIN
  INSERT INTO notes(notes, rowid, path, body) VALUES ('delete', old.id, old.path, old.body);
  INSERT INTO notes(rowid, path, body) VALUES (new.id, new.path, new.body);
END;
