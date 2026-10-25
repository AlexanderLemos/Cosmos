DELETE FROM search_documents WHERE path NOT IN (SELECT path FROM search_seen);
