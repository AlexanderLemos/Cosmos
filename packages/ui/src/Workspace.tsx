import { noteLinks, resolveNoteLink } from '@cosmos/core';
import { MarkdownEditor } from '@cosmos/editor';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Foundation } from './Foundation';
import type { OpenVault, VaultPlatform } from './vault';
import styles from './Workspace.module.css';

type Document = {
  path: string;
  content: string;
  saved: string;
  rev: string;
  readOnly: boolean;
  generation: number;
};
export function Workspace({ platform }: { platform: VaultPlatform }) {
  const { t } = useTranslation();
  const [vault, setVault] = useState<OpenVault | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[] | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [universe, setUniverse] = useState('Pessoal');
  const [form, setForm] = useState<'note' | 'project'>('note');
  const pending = useRef(false);
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
      setDoc(null);
      setLinks([]);
      setBacklinks([]);
    });
  const load = async (path: string, current = vault) => {
    if (!current) return;
    const note = await current.read(path);
    setDoc({
      path,
      ...note,
      saved: note.content,
      readOnly: await current.isReadOnly(path),
      generation: Date.now(),
    });
    const all = await current.paths();
    setLinks(noteLinks(note.content));
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
                  void run(async () => setResults(await vault.search(query)));
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
                    disabled={busy || !dirty || doc?.readOnly}
                    onClick={save}
                  >
                    {t('save')}
                  </button>
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
                      setLinks(noteLinks(content));
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
