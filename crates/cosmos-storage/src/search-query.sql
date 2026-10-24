SELECT path FROM notes WHERE notes MATCH ?1 ORDER BY bm25(notes) LIMIT 200;
