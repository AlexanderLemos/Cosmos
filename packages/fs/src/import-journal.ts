import type { ImportEntry, ImportHeader, ImportReport } from './index';

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('cosmos-imports', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('operations', { keyPath: 'id' }).createIndex(
        'scope',
        'scope',
      );
      db.createObjectStore('entries', {
        keyPath: ['operation', 'path'],
      }).createIndex('operation', 'operation');
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('IMPORT_RECORD_UNAVAILABLE'));
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (
    tx: IDBTransaction,
    done: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    const connection = db;
    return await new Promise<T>((resolve, reject) => {
      const tx = connection.transaction(['operations', 'entries'], mode, {
        durability: 'strict',
      });
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () =>
        reject(tx.error ?? new Error('IMPORT_RECORD_UNAVAILABLE'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('IMPORT_RECORD_UNAVAILABLE'));
      const fail = (error: Error) => {
        reject(error);
        tx.abort();
      };
      try {
        action(
          tx,
          (result) => {
            value = result;
          },
          fail,
        );
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('IMPORT_'))
      throw error;
    throw new Error('IMPORT_RECORD_UNAVAILABLE', { cause: error });
  } finally {
    db?.close();
  }
}

function header(value: unknown, scope: string): ImportHeader {
  const h = value as ImportHeader | undefined;
  if (!h || h.scope !== scope) throw new Error('IMPORT_RECORD_CHANGED');
  if (
    h.format !== 1 ||
    typeof h.id !== 'string' ||
    typeof h.version !== 'string' ||
    typeof h.source !== 'string' ||
    !Number.isFinite(h.createdAt) ||
    !Number.isFinite(new Date(h.createdAt).getTime()) ||
    !Number.isFinite(h.updatedAt) ||
    !Number.isFinite(new Date(h.updatedAt).getTime()) ||
    ![h.total, h.imported, h.skipped].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    h.total > 10_000 ||
    h.imported + h.skipped > h.total ||
    (h.current !== undefined && typeof h.current !== 'string')
  )
    throw new Error('IMPORT_RECORD_UNAVAILABLE');
  return h;
}
function get(
  tx: IDBTransaction,
  id: string,
  scope: string,
  fail: (error: Error) => void,
  use: (h: ImportHeader) => void,
) {
  const request = tx.objectStore('operations').get(id);
  request.onsuccess = () => {
    try {
      use(header(request.result, scope));
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  };
}
function erase(tx: IDBTransaction, id: string) {
  tx.objectStore('operations').delete(id);
  const store = tx.objectStore('entries');
  const cursor = store.index('operation').openKeyCursor(IDBKeyRange.only(id));
  cursor.onsuccess = () => {
    if (cursor.result) {
      store.delete(cursor.result.primaryKey);
      cursor.result.continue();
    }
  };
}

/** Local progress evidence, never authority to delete or replace vault files. */
export const importJournal = {
  list(scope: string): Promise<ImportHeader[]> {
    return transaction('readonly', (tx, done, fail) => {
      const request = tx.objectStore('operations').index('scope').getAll(scope);
      request.onsuccess = () => {
        try {
          done(
            request.result
              .map((value) => header(value, scope))
              .sort((a, b) => b.createdAt - a.createdAt),
          );
        } catch (error) {
          fail(error as Error);
        }
      };
    });
  },
  start(
    scope: string,
    source: string,
    entries: ImportEntry[],
  ): Promise<string> {
    return transaction('readwrite', (tx, done, fail) => {
      const store = tx.objectStore('operations');
      const count = store.index('scope').count(scope);
      count.onsuccess = () => {
        try {
          if (count.result >= 20) {
            fail(new Error('IMPORT_RECORD_LIMIT'));
            return;
          }
          const id = crypto.randomUUID();
          const now = Date.now();
          const h: ImportHeader = {
            format: 1,
            id,
            scope,
            source,
            version: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            total: entries.length,
            imported: 0,
            skipped: entries.filter((entry) => entry.state === 'kept').length,
          };
          store.add(h);
          for (const entry of entries)
            tx.objectStore('entries').add({ ...entry, operation: id });
          done(id);
        } catch (error) {
          fail(error as Error);
        }
      };
    });
  },
  mark(
    scope: string,
    id: string,
    path: string,
    written: boolean,
  ): Promise<void> {
    return transaction('readwrite', (tx, done, fail) => {
      get(tx, id, scope, fail, (h) => {
        const entries = tx.objectStore('entries');
        const request = entries.get([id, path]);
        request.onsuccess = () => {
          try {
            const entry = request.result as
              | (ImportEntry & { operation: string })
              | undefined;
            if (
              !entry ||
              entry.state !== (written ? 'writing' : 'pending') ||
              (written && h.current !== path) ||
              (!written && h.current !== undefined)
            ) {
              fail(new Error('IMPORT_RECORD_CHANGED'));
              return;
            }
            entries.put({ ...entry, state: written ? 'written' : 'writing' });
            tx.objectStore('operations').put({
              ...h,
              current: written ? undefined : path,
              imported: h.imported + Number(written),
              version: crypto.randomUUID(),
              updatedAt: Date.now(),
            });
            done(undefined);
          } catch (error) {
            fail(error as Error);
          }
        };
      });
    });
  },
  finish(scope: string, source: string): Promise<void> {
    return transaction('readwrite', (tx, done, fail) => {
      const request = tx.objectStore('operations').index('scope').getAll(scope);
      request.onsuccess = () => {
        try {
          for (const value of request.result) {
            const h = header(value, scope);
            if (h.source === source) erase(tx, h.id);
          }
          done(undefined);
        } catch (error) {
          fail(error as Error);
        }
      };
    });
  },
  read(scope: string, id: string, version: string): Promise<ImportReport> {
    return transaction('readonly', (tx, done, fail) => {
      get(tx, id, scope, fail, (h) => {
        if (h.version !== version) {
          fail(new Error('IMPORT_RECORD_CHANGED'));
          return;
        }
        const request = tx.objectStore('entries').index('operation').getAll(id);
        request.onsuccess = () => {
          if (request.result.length !== h.total) {
            fail(new Error('IMPORT_RECORD_UNAVAILABLE'));
            return;
          }
          done({
            header: h,
            entries: request.result.map(
              ({ operation: _operation, ...entry }) => entry,
            ),
          });
        };
      });
    });
  },
  forget(scope: string, id: string, version: string): Promise<void> {
    return transaction('readwrite', (tx, done, fail) => {
      get(tx, id, scope, fail, (h) => {
        if (h.version !== version) {
          fail(new Error('IMPORT_RECORD_CHANGED'));
          return;
        }
        erase(tx, id);
        done(undefined);
      });
    });
  },
};
