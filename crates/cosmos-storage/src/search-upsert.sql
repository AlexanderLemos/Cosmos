INSERT INTO search_documents(path, revision, body) VALUES (?1, ?2, ?3)
ON CONFLICT(path) DO UPDATE SET revision=excluded.revision, body=excluded.body
WHERE search_documents.revision != excluded.revision;
