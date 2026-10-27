import type { ImportHeader, ImportHistory } from '@cosmos/fs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Workspace.module.css';

export function ImportRecovery({
  history,
  busy,
  run,
  download,
}: {
  history: ImportHistory;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  download: (bytes: Uint8Array, name: string, type: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [records, setRecords] = useState<ImportHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly retries the persisted listing.
  useEffect(() => {
    if (busy) return;
    let current = true;
    setLoading(true);
    setFailed(false);
    void history
      .list()
      .then((items) => {
        if (current) setRecords(items);
      })
      .catch(() => {
        if (current) {
          setRecords([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [history, busy, refresh]);
  return (
    <section className={styles.importRecovery} aria-label={t('pendingImports')}>
      <h2>{t('pendingImports')}</h2>
      {records.length > 0 && <p>{t('pendingImportsHint')}</p>}
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => setRefresh((value) => value + 1)}
      >
        {t('refreshImports')}
      </button>
      {loading && <p role="status">{t('checkingImports')}</p>}
      {failed && <p role="status">{t('importHistoryUnavailable')}</p>}
      {!loading && !failed && !records.length && <p>{t('noPendingImports')}</p>}
      {!loading &&
        records.map((entry) => (
          <article key={entry.id}>
            <h3>
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(entry.createdAt)}
              </time>
            </h3>
            <p>
              {t('importProgress', {
                imported: entry.imported,
                skipped: entry.skipped,
                remaining: entry.total - entry.imported - entry.skipped,
              })}
            </p>
            {entry.current && (
              <p>{t('importUnconfirmedPath', { path: entry.current })}</p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const report = await history.read(entry.id, entry.version);
                  download(
                    new TextEncoder().encode(JSON.stringify(report, null, 2)),
                    `cosmos-import-${entry.id}.json`,
                    'application/json',
                  );
                })
              }
            >
              {t('downloadImportReport')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (window.confirm(t('forgetImportPrompt')))
                    await history.forget(entry.id, entry.version);
                })
              }
            >
              {t('forgetImportRecord')}
            </button>
          </article>
        ))}
    </section>
  );
}
