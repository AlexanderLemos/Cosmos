import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import pruneSql from '../../../crates/cosmos-storage/src/search-prune.sql?raw';
import querySql from '../../../crates/cosmos-storage/src/search-query.sql?raw';
import scanSql from '../../../crates/cosmos-storage/src/search-scan.sql?raw';
import schemaSql from '../../../crates/cosmos-storage/src/search-schema.sql?raw';
import seenSql from '../../../crates/cosmos-storage/src/search-seen.sql?raw';
import upsertSql from '../../../crates/cosmos-storage/src/search-upsert.sql?raw';

self.onmessage = async (
  event: MessageEvent<{
    notes: { path: string; content: string; rev: string }[];
    query: string;
  }>,
) => {
  try {
    const sqlite = await sqlite3InitModule();
    const pool = await sqlite.installOpfsSAHPoolVfs({
      // Old tabs must not write their previous FTS schema into this cache.
      directory: '/cosmos-search-index-v1',
      initialCapacity: 6,
    });
    let paths: unknown[] = [];
    let indexed = 0;
    let removed = 0;
    try {
      const db = new pool.OpfsSAHPoolDb('/search.sqlite3');
      try {
        db.exec(schemaSql);
        db.transaction(() => {
          db.exec(scanSql);
          for (const note of event.data.notes) {
            db.exec({ sql: seenSql, bind: [note.path] });
            db.exec({
              sql: upsertSql,
              bind: [note.path, note.rev, note.content],
            });
            indexed += Number(db.changes());
          }
          removed = Number(db.exec(pruneSql).changes());
        });
        // Every request reconciles the complete selected vault before querying.
        // The shared cache therefore cannot return paths left by a different vault.
        const phrase = `"${event.data.query.replaceAll('"', '""')}"`;
        paths = db.selectValues(querySql, [phrase]);
      } finally {
        db.close();
      }
    } finally {
      pool.pauseVfs();
    }
    // Release OPFS handles before the parent terminates this worker.
    self.postMessage({ paths, indexed, removed });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
