import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import querySql from '../../../crates/cosmos-storage/src/search-query.sql?raw';
import schemaSql from '../../../crates/cosmos-storage/src/search-schema.sql?raw';

self.onmessage = async (
  event: MessageEvent<{
    notes: { path: string; content: string }[];
    query: string;
  }>,
) => {
  try {
    const sqlite = await sqlite3InitModule();
    const pool = await sqlite.installOpfsSAHPoolVfs({
      directory: '/cosmos-search-index',
      initialCapacity: 6,
    });
    const db = new pool.OpfsSAHPoolDb('/search.sqlite3');
    try {
      db.exec(schemaSql);
      db.transaction(() => {
        db.exec('DELETE FROM notes');
        for (const note of event.data.notes)
          db.exec({
            sql: 'INSERT INTO notes(path, body) VALUES (?1, ?2)',
            bind: [note.path, note.content],
          });
      });
      const phrase = `"${event.data.query.replaceAll('"', '""')}"`;
      const paths = db.selectValues(querySql, [phrase]);
      db.close();
      pool.pauseVfs();
      self.postMessage({ paths });
    } finally {
      db.close();
      pool.pauseVfs();
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
