export interface DraftHeader {
  id: string;
  scope: string;
  path: string;
  version: string;
  updatedAt: number;
}
export interface LocalDraft extends DraftHeader {
  format: 1;
  content: string;
  baseContent: string;
  baseRev: string;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('cosmos-drafts', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('drafts', { keyPath: 'id' });
      db.createObjectStore('headers', { keyPath: 'id' }).createIndex(
        'scope',
        'scope',
      );
      db.createObjectStore('folders', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('DRAFT_DATABASE_BLOCKED'));
    };
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (
    tx: IDBTransaction,
    result: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode, { durability: 'strict' });
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () =>
        reject(tx.error ?? new Error('DRAFT_TRANSACTION_ABORTED'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('DRAFT_TRANSACTION_FAILED'));
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
  } finally {
    db.close();
  }
}

function header(draft: LocalDraft): DraftHeader {
  return {
    id: draft.id,
    scope: draft.scope,
    path: draft.path,
    version: draft.version,
    updatedAt: draft.updatedAt,
  };
}
function put(tx: IDBTransaction, draft: LocalDraft) {
  if (
    draft.format !== 1 ||
    draft.content.length > 8 * 1024 * 1024 ||
    draft.baseContent.length > 8 * 1024 * 1024
  )
    throw new Error('DRAFT_TOO_LARGE');
  tx.objectStore('drafts').put(draft);
  tx.objectStore('headers').put(header(draft));
}
function remove(tx: IDBTransaction, id: string) {
  tx.objectStore('drafts').delete(id);
  tx.objectStore('headers').delete(id);
}

export const draftStore = {
  put(draft: LocalDraft): Promise<void> {
    return transaction(['drafts', 'headers'], 'readwrite', (tx, done) => {
      put(tx, draft);
      done();
    });
  },
  list(scope: string): Promise<DraftHeader[]> {
    return transaction(['headers'], 'readonly', (tx, done) => {
      const request = tx.objectStore('headers').index('scope').getAll(scope);
      request.onsuccess = () =>
        done(
          (request.result as DraftHeader[]).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        );
    });
  },
  read(id: string, scope: string): Promise<LocalDraft> {
    return transaction(['drafts'], 'readonly', (tx, done, fail) => {
      const request = tx.objectStore('drafts').get(id);
      request.onsuccess = () => {
        const draft = request.result as LocalDraft | undefined;
        if (draft?.format !== 1 || draft.scope !== scope)
          fail(new Error('DRAFT_NOT_FOUND'));
        else done(draft);
      };
    });
  },
  remove(id: string, scope: string, version?: string): Promise<void> {
    return transaction(['drafts', 'headers'], 'readwrite', (tx, done, fail) => {
      const request = tx.objectStore('drafts').get(id);
      request.onsuccess = () => {
        const draft = request.result as LocalDraft | undefined;
        if (
          draft &&
          (draft.scope !== scope || (version && draft.version !== version))
        )
          fail(new Error('DRAFT_CHANGED'));
        else {
          remove(tx, id);
          done();
        }
      };
    });
  },
  /** Fork into a new editing session; do not let two tabs write the same draft ID. */
  recover(source: LocalDraft): Promise<LocalDraft> {
    return transaction(['drafts', 'headers'], 'readwrite', (tx, done, fail) => {
      const request = tx.objectStore('drafts').get(source.id);
      request.onsuccess = () => {
        const current = request.result as LocalDraft | undefined;
        if (
          !current ||
          current.scope !== source.scope ||
          current.version !== source.version
        ) {
          fail(new Error('DRAFT_CHANGED'));
          return;
        }
        const copy: LocalDraft = {
          ...current,
          id: crypto.randomUUID(),
          version: crypto.randomUUID(),
          updatedAt: Date.now(),
        };
        try {
          put(tx, copy);
          done(copy);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
    });
  },
};

/** Handle equality, never a folder's display name, establishes its draft identity. */
export async function directoryDraftScope(
  handle: FileSystemDirectoryHandle,
): Promise<string> {
  return navigator.locks.request('cosmos-draft-folders', async () => {
    const folders = await transaction<
      { id: string; handle: FileSystemDirectoryHandle }[]
    >(['folders'], 'readonly', (tx, done) => {
      const request = tx.objectStore('folders').getAll();
      request.onsuccess = () => done(request.result);
    });
    for (const folder of folders)
      if (await handle.isSameEntry(folder.handle)) return folder.id;
    const id = `folder:${crypto.randomUUID()}`;
    await transaction<void>(['folders'], 'readwrite', (tx, done) => {
      tx.objectStore('folders').put({ id, handle });
      done();
    });
    return id;
  });
}
