/** One bounded worker per search. Web Locks serialize the OPFS VFS across tabs. */
export async function searchNotes(
  notes: { path: string; content: string; rev: string }[],
  query: string,
): Promise<string[]> {
  if (!query.trim()) return Promise.resolve(notes.map((note) => note.path));
  return navigator.locks.request(
    'cosmos-search-index',
    () =>
      new Promise<string[]>((resolve, reject) => {
        const worker = new Worker(
          new URL('./search.worker.ts', import.meta.url),
          { type: 'module' },
        );
        const finish = () => {
          clearTimeout(timeout);
          worker.terminate();
        };
        const timeout = setTimeout(() => {
          finish();
          reject(new Error('SEARCH_TIMEOUT'));
        }, 30_000);
        worker.onmessage = (
          event: MessageEvent<{ paths?: string[]; error?: string }>,
        ) => {
          finish();
          if (event.data.paths) resolve(event.data.paths);
          else reject(new Error(event.data.error ?? 'SEARCH_FAILED'));
        };
        worker.onerror = (error) => {
          finish();
          reject(new Error(error.message));
        };
        worker.postMessage({ notes, query });
      }),
  );
}
