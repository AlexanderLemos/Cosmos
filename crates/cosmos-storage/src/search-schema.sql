CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(path UNINDEXED, body, tokenize='unicode61 remove_diacritics 2');
