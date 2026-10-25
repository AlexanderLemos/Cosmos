import { noteLinks, resolveNoteLink } from '@cosmos/core';
import { MarkdownEditor } from '@cosmos/editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Foundation } from './Foundation';
import { type DocumentState, observeVault, reconcileDocument } from './monitor';
import type { OpenVault, TrashItem, VaultPlatform } from './vault';
import styles from './Workspace.module.css';

export function Workspace({ platform }: { platform: VaultPlatform }) {
  const { t } = useTranslation();
  const [vault, setVault] = useState<OpenVault | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [doc, setDoc] = useState<DocumentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [monitorIssue, setMonitorIssue] = useState('');
  const [results, setResults] = useState<string[] | null>(null);
  const content = doc?.content ?? '';
  const links = useMemo(() => noteLinks(content), [content]);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [fileAction, setFileAction] = useState<'move' | 'trash' | null>(null);
  const [destination, setDestination] = useState('');
  const [trashItems, setTrashItems] = useState<TrashItem[] | null>(null);
  const [restoreItem, setRestoreItem] = useState<TrashItem | null>(null);
  const [restorePath, setRestorePath] = useState('');
  const [universe, setUniverse] = useState('Pessoal');
  const [form, setForm] = useState<'note' | 'project'>('note');
  const pending = useRef(false);
  const actionGeneration = useRef(0);
  const monitorRef = useRef({
    doc,
    searchTerm,
    trashOpen: trashItems !== null,
  });
  monitorRef.current = { doc, searchTerm, trashOpen: trashItems !== null };
  const dirty = doc !== null && doc.content !== doc.saved;
  const documentRef = useRef(doc);
  documentRef.current = doc;
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    actionGeneration.current++;
    pending.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(
        message.includes('CONFLICT') || message.includes('Revision conflict')
          ? t('conflict')
          : message.includes('DESTINATION_EXISTS')
            ? t('destinationExists')
            : message.includes('PROJECT_STRUCTURE_PROTECTED')
              ? t('structureProtected')
              : `${t('operationFailed')} ${message}`,
      );
    } finally {
      setBusy(false);
      pending.current = false;
    }
  };
  const mayLeave = () => !dirty || window.confirm(t('discardPrompt'));
  const refresh = async (current: OpenVault) => {
    setPaths(await current.paths());
    setResults(null);
    setQuery('');
    setSearchTerm(null);
  };
  const open = (folder = false) =>
    void run(async () => {
      if (!mayLeave()) return;
      const current = await (folder
        ? platform.openFolder?.()
        : platform.open());
      if (!current) return;
      await refresh(current);
      setVault(current);
      setTrashItems(null);
      setRestoreItem(null);
      setFileAction(null);
      setDoc(null);
      setBacklinks([]);
    });
  const load = async (path: string, current = vault) => {
    if (!current) return;
    const note = await current.read(path);
    setFileAction(null);
    setDestination(path);
    setDoc({
      path,
      ...note,
      saved: note.content,
      readOnly: await current.isReadOnly(path),
      generation: Date.now(),
    });
    const all = await current.paths();
    const back: string[] = [];
    for (const candidate of all) {
      if (candidate === path) continue;
      const other = await current.read(candidate);
      if (
        noteLinks(other.content).some(
          (link) => resolveNoteLink(link, candidate, all) === path,
        )
      )
        back.push(candidate);
    }
    setBacklinks(back);
  };
  const save = () =>
    void run(async () => {
      const snapshot = documentRef.current;
      if (
        !vault ||
        !snapshot ||
        snapshot.readOnly ||
        snapshot.external ||
        snapshot.content === snapshot.saved
      )
        return;
      const result = await vault.write(snapshot.path, snapshot.content, {
        expectedRev: snapshot.rev,
      });
      // Edits made while IO was in flight remain dirty; never replace newer text with the snapshot.
      setDoc((current) =>
        current?.path === snapshot.path
          ? { ...current, rev: result.rev, saved: snapshot.content }
          : current,
      );
      setStatus(t('saved'));
      await refresh(vault);
    });
  useEffect(() => {
    setMonitorIssue('');
    if (!vault?.watchState) return;
    const readState = vault.watchState.bind(vault);
    let cancelled = false;
    let inFlight = false;
    let token: string | undefined;
    let rescan = true;
    const poll = async (force = false) => {
      if (force) rescan = true;
      if (
        cancelled ||
        inFlight ||
        pending.current ||
        document.visibilityState === 'hidden'
      )
        return;
      inFlight = true;
      const action = actionGeneration.current;
      const observed = monitorRef.current;
      const stale = () =>
        cancelled || pending.current || action !== actionGeneration.current;
      try {
        const state = await readState();
        if (stale()) {
          rescan = true;
          return;
        }
        if (state.revision === token && !rescan) {
          setMonitorIssue(state.available ? '' : 'monitorUnavailable');
          return;
        }
        rescan = false;
        const update = await observeVault(
          vault,
          observed.doc,
          observed.searchTerm,
          observed.trashOpen,
        );
        if (stale()) {
          rescan = true;
          return;
        }
        setPaths(update.paths);
        setDoc((current) =>
          reconcileDocument(current, observed.doc, update.incoming),
        );
        setBacklinks(update.backlinks);
        if (monitorRef.current.searchTerm === observed.searchTerm)
          setResults(update.results);
        if (observed.trashOpen && monitorRef.current.trashOpen)
          setTrashItems(update.trash);
        setMonitorIssue(
          !state.available
            ? 'monitorUnavailable'
            : update.incomplete
              ? 'monitorUnreadable'
              : '',
        );
        token = state.revision;
        rescan = rescan || update.incomplete;
      } catch {
        if (!stale()) setMonitorIssue('monitorUnavailable');
        rescan = true;
      } finally {
        inFlight = false;
      }
    };
    const resume = () => {
      void poll(true);
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1500);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [vault]);
  const downloadDraft = () => {
    if (!doc) return;
    download(
      new TextEncoder().encode(doc.content),
      doc.path.split('/').at(-1) ?? 'note.md',
      'text/markdown',
    );
  };
  const launcher = (
    <div className={styles.launcher}>
      <button type="button" disabled={busy} onClick={() => open()}>
        {t(platform.kind === 'web' ? 'openBrowser' : 'openVault')}
      </button>
      {platform.openFolder && (
        <button type="button" disabled={busy} onClick={() => open(true)}>
          {t('openFolder')}
        </button>
      )}
      {platform.kind === 'web' && <p>{t('browserStorage')}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
  return (
    <Foundation
      launcher={launcher}
      workspace={
        vault ? (
          <div className={styles.workspace}>
            <aside className={styles.sidebar} aria-label={t('notes')}>
              <p className={styles.eyebrow}>{t('yourVault')}</p>
              <h1>{vault.name}</h1>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    const term = query;
                    setResults(await vault.search(term));
                    setSearchTerm(term);
                  });
                }}
              >
                <label>
                  {t('search')}
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button disabled={busy} type="submit">
                  {t('search')}
                </button>
              </form>
              <nav aria-label={t('notes')} className={styles.noteList}>
                {(results ?? paths).map((path) => (
                  <button
                    type="button"
                    key={path}
                    aria-current={doc?.path === path ? 'page' : undefined}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (mayLeave()) await load(path);
                      })
                    }
                  >
                    {path}
                  </button>
                ))}
                {!paths.length && <p>{t('emptyVault')}</p>}
                {results?.length === 0 && <p>{t('noResults')}</p>}
              </nav>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    if (!mayLeave()) return;
                    let path: string;
                    if (form === 'project' && vault.createProject)
                      path = await vault.createProject(
                        name.trim(),
                        universe.trim(),
                      );
                    else {
                      path = name.trim().endsWith('.md')
                        ? name.trim()
                        : `${name.trim()}.md`;
                      await vault.write(path, '', { expectedRev: '' });
                    }
                    await refresh(vault);
                    await load(path);
                    setName('');
                  });
                }}
              >
                {vault.createProject && (
                  <label>
                    {t('create')}
                    <select
                      value={form}
                      onChange={(e) =>
                        setForm(e.target.value as 'note' | 'project')
                      }
                    >
                      <option value="note">{t('note')}</option>
                      <option value="project">{t('project')}</option>
                    </select>
                  </label>
                )}
                {form === 'project' && (
                  <label>
                    {t('universe')}
                    <input
                      required
                      value={universe}
                      onChange={(e) => setUniverse(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  {t(form === 'project' ? 'projectName' : 'notePath')}
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Universos/Pessoal/Ideias.md"
                  />
                </label>
                <button type="submit" disabled={busy || !name.trim()}>
                  {t(form === 'project' ? 'createProject' : 'createNote')}
                </button>
              </form>
              {vault.listTrash && (
                <section aria-label={t('trashTitle')}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setTrashItems(
                          trashItems
                            ? null
                            : ((await vault.listTrash?.()) ?? []),
                        );
                        setRestoreItem(null);
                      })
                    }
                  >
                    {t('trashTitle')}
                  </button>
                  {trashItems && (
                    <>
                      {!trashItems.length && <p>{t('emptyTrash')}</p>}
                      <ul>
                        {trashItems.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRestoreItem(item);
                                setRestorePath(item.path);
                              }}
                            >
                              {item.path}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {restoreItem && (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void run(async () => {
                              await vault.restore?.(
                                restoreItem.id,
                                restorePath.trim(),
                                restoreItem.rev,
                              );
                              setRestoreItem(null);
                              setTrashItems((await vault.listTrash?.()) ?? []);
                              await refresh(vault);
                              setStatus(t('restored'));
                            });
                          }}
                        >
                          <label>
                            {t('restorePath')}
                            <input
                              aria-label={t('restorePath')}
                              required
                              value={restorePath}
                              onChange={(e) => setRestorePath(e.target.value)}
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={busy || !restorePath.trim()}
                          >
                            {t('restoreNote')}
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </section>
              )}
              <div className={styles.tools}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => refresh(vault))}
                >
                  {t('refresh')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (mayLeave()) {
                      setVault(null);
                      setDoc(null);
                    }
                  }}
                >
                  {t('closeVault')}
                </button>
                {vault.importFiles && (
                  <label>
                    {t('importFolder')}
                    <small>{t('folderImportHint')}</small>
                    <input
                      aria-label={t('importFolder')}
                      type="file"
                      multiple
                      {...{ webkitdirectory: '' }}
                      disabled={busy}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        void run(async () => {
                          await vault.importFiles?.(files);
                          await refresh(vault);
                          setStatus(t('imported'));
                        });
                      }}
                    />
                  </label>
                )}
                {vault.importZip && (
                  <label>
                    {t('importZip')}
                    <input
                      aria-label={t('importZip')}
                      type="file"
                      accept=".zip,application/zip"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file)
                          void run(async () => {
                            await vault.importZip?.(file);
                            await refresh(vault);
                            setStatus(t('imported'));
                          });
                      }}
                    />
                  </label>
                )}
                {vault.exportZip && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const bytes = await vault.exportZip?.();
                        if (bytes)
                          download(
                            bytes,
                            'cosmos-vault.zip',
                            'application/zip',
                          );
                      })
                    }
                  >
                    {t('exportVault')}
                  </button>
                )}
              </div>
            </aside>
            <section className={styles.document} aria-label={t('editor')}>
              <div className={styles.toolbar}>
                <div>
                  <p className={styles.eyebrow}>{t('knowledge')}</p>
                  <h2>{doc?.path.split('/').at(-1) ?? t('chooseNote')}</h2>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={
                      busy || !dirty || doc?.readOnly || !!doc?.external
                    }
                    onClick={save}
                  >
                    {t('save')}
                  </button>
                  {doc && vault.move && (
                    <button
                      type="button"
                      disabled={
                        busy || dirty || !!doc.external || !doc.canOrganize
                      }
                      onClick={() => {
                        setDestination(doc.path);
                        setFileAction('move');
                      }}
                    >
                      {t('moveNote')}
                    </button>
                  )}
                  {doc && vault.trash && (
                    <button
                      type="button"
                      disabled={
                        busy || dirty || !!doc.external || !doc.canOrganize
                      }
                      onClick={() => setFileAction('trash')}
                    >
                      {t('trashNote')}
                    </button>
                  )}
                  {doc && (
                    <button type="button" onClick={downloadDraft}>
                      {t('downloadNote')}
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.feedback} aria-live="polite">
                {busy ? t('working') : dirty ? t('unsaved') : status}
              </div>
              {(monitorIssue || doc?.external) && (
                <div role="alert" className={styles.error}>
                  {monitorIssue && <p>{t(monitorIssue)}</p>}
                  {doc?.external && <p>{t(`external_${doc.external}`)}</p>}
                  {doc && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (mayLeave()) await load(doc.path);
                        })
                      }
                    >
                      {t('reloadNote')}
                    </button>
                  )}
                </div>
              )}
              {error && (
                <div role="alert" className={styles.error}>
                  {error}
                  {doc && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (mayLeave()) await load(doc.path);
                        })
                      }
                    >
                      {t('reloadNote')}
                    </button>
                  )}
                </div>
              )}
              {doc && vault.move && (
                <p className={styles.feedback}>
                  {!doc.canOrganize
                    ? t('structureProtected')
                    : dirty
                      ? t('saveBeforeOrganizing')
                      : t('moveLinksHint')}
                </p>
              )}
              {doc && fileAction && (
                <form
                  className={styles.fileAction}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      if (dirty || doc.external || !doc.canOrganize) return;
                      if (fileAction === 'move') {
                        const target = destination.trim();
                        await vault.move?.(doc.path, target, doc.rev);
                        await refresh(vault);
                        await load(target);
                        setStatus(t('moved'));
                      } else {
                        await vault.trash?.(doc.path, doc.rev);
                        setDoc(null);
                        setFileAction(null);
                        await refresh(vault);
                        setTrashItems((await vault.listTrash?.()) ?? []);
                        setStatus(t('trashed'));
                      }
                    });
                  }}
                >
                  {fileAction === 'move' ? (
                    <label>
                      {t('destinationPath')}
                      <input
                        aria-label={t('destinationPath')}
                        required
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      />
                    </label>
                  ) : (
                    <p>{t('trashPrompt', { path: doc.path })}</p>
                  )}
                  <div>
                    <button
                      type="submit"
                      disabled={
                        busy ||
                        dirty ||
                        !!doc.external ||
                        (fileAction === 'move' && !destination.trim())
                      }
                    >
                      {t(
                        fileAction === 'move' ? 'confirmMove' : 'confirmTrash',
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setFileAction(null)}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </form>
              )}
              {doc ? (
                <>
                  {doc.readOnly && (
                    <p className={styles.feedback}>{t('memoryReadOnly')}</p>
                  )}
                  <MarkdownEditor
                    key={`${doc.path}:${doc.generation}`}
                    initialValue={doc.content}
                    label={t('editor')}
                    readOnly={doc.readOnly || busy}
                    onSave={save}
                    onChange={(content) => {
                      setDoc((d) => (d ? { ...d, content } : d));
                      setStatus('');
                    }}
                  />
                  <section
                    className={styles.links}
                    aria-label={t('connections')}
                  >
                    <div>
                      <h3>{t('outgoingLinks')}</h3>
                      {links.length ? (
                        links.map((link) => {
                          const target = resolveNoteLink(link, doc.path, paths);
                          return (
                            <button
                              key={link}
                              type="button"
                              disabled={busy || !target}
                              onClick={() =>
                                void run(async () => {
                                  if (target && mayLeave()) await load(target);
                                })
                              }
                            >
                              {link}
                              {!target && ` · ${t('unresolved')}`}
                            </button>
                          );
                        })
                      ) : (
                        <p>{t('noLinks')}</p>
                      )}
                    </div>
                    <div>
                      <h3>{t('backlinks')}</h3>
                      {backlinks.length ? (
                        backlinks.map((path) => (
                          <button
                            key={path}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                if (mayLeave()) await load(path);
                              })
                            }
                          >
                            {path}
                          </button>
                        ))
                      ) : (
                        <p>{t('noLinks')}</p>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <div className={styles.empty}>
                  <span aria-hidden="true">✧</span>
                  <p>{t('startWriting')}</p>
                </div>
              )}
            </section>
          </div>
        ) : undefined
      }
    />
  );
}
function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
