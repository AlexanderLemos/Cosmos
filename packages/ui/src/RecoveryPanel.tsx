import type {
  MoveHistory,
  MoveInspection,
  RecoveryPage,
  RecoveryRecord,
  TrashHistory,
  TrashInspection,
} from '@cosmos/fs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Workspace.module.css';

export function RecoveryPanel({
  kind = 'move',
  history,
  busy,
  run,
  onRestored,
}: {
  kind?: 'move' | 'trash';
  history: MoveHistory | TrashHistory;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onRestored: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const title = kind === 'trash' ? 'trashTitle' : 'moveRecovery';
  const [listing, setListing] = useState<{
    owner: MoveHistory | TrashHistory;
    page: RecoveryPage<RecoveryRecord>;
  } | null>(null);
  const [inspection, setInspection] = useState<{
    owner: MoveHistory | TrashHistory;
    result: MoveInspection | TrashInspection;
  } | null>(null);
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState<{
    owner: MoveHistory | TrashHistory;
    path: string;
  } | null>(null);
  const page = listing?.owner === history ? listing.page : null;
  const checked = inspection?.owner === history ? inspection.result : null;
  const list = async (after?: string) => {
    setInspection(null);
    setSaved(null);
    if (!after) setListing(null);
    const result = await history.list(after);
    setListing({
      owner: history,
      page: {
        entries: after
          ? [...(page?.entries ?? []), ...result.entries]
          : result.entries,
        next: result.next,
      },
    });
  };
  return (
    <section className={styles.importRecovery} aria-label={t(title)}>
      <h2>{t(title)}</h2>
      <p>{t(kind === 'trash' ? 'webTrashHint' : 'moveRecoveryHint')}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => list())}
      >
        {t(kind === 'trash' ? 'reviewTrash' : 'reviewMoves')}
      </button>
      {page && !page.entries.length && (
        <p role="status">
          {t(kind === 'trash' ? 'emptyTrash' : 'noMoveCopies')}
        </p>
      )}
      {saved?.owner === history && (
        <p role="status">{t('moveCopyRestored', { path: saved.path })}</p>
      )}
      {page?.entries.map((entry) => (
        <article key={entry.id}>
          <h3>
            {'record' in entry ? entry.record.from : t('moveInvalidEntry')}
          </h3>
          <p>{t('moveRecordId', { id: entry.id })}</p>
          {'record' in entry ? (
            <>
              {'to' in entry.record && (
                <p>{t('moveRecordedDestination', { path: entry.record.to })}</p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setInspection(null);
                    setSaved(null);
                    const result = await history.inspect(
                      entry.id,
                      entry.record.version,
                    );
                    setTarget(result.record.from);
                    setInspection({ owner: history, result });
                  })
                }
              >
                {t(kind === 'trash' ? 'inspectTrash' : 'inspectMove')}
              </button>
              {checked?.record.id === entry.id &&
                checked.record.version === entry.record.version && (
                  <div className={styles.importInspection}>
                    <p>
                      {t('moveCheckedAt', {
                        time: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        }).format(checked.checkedAt),
                      })}
                    </p>
                    <dl>
                      <dt>{t('moveSource')}</dt>
                      <dd>{t(`moveState_${checked.source}`)}</dd>
                      {'destination' in checked && (
                        <>
                          <dt>{t('moveDestination')}</dt>
                          <dd>{t(`moveState_${checked.destination}`)}</dd>
                        </>
                      )}
                      <dt>{t('moveBackup')}</dt>
                      <dd>{t(`moveState_${checked.backup}`)}</dd>
                    </dl>
                    {checked.backup === 'matching' ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(async () => {
                            const path = target.trim();
                            await history.restore(
                              entry.id,
                              checked.record.version,
                              path,
                            );
                            // Record success before refreshing: a listing failure cannot undo a write.
                            setSaved({ owner: history, path });
                            setInspection(null);
                            await onRestored();
                          });
                        }}
                      >
                        <label>
                          {t('restoreMovePath')}
                          <input
                            required
                            disabled={busy}
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                          />
                        </label>
                        <button type="submit" disabled={busy || !target.trim()}>
                          {t('restoreMoveCopy')}
                        </button>
                      </form>
                    ) : (
                      <p role="status">{t('moveBackupUnavailable')}</p>
                    )}
                  </div>
                )}
            </>
          ) : (
            <p>
              {t(
                entry.issue === 'invalid'
                  ? 'moveRecordInvalid'
                  : 'moveRecordUnreadable',
              )}
            </p>
          )}
        </article>
      ))}
      {page?.next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => list(page.next))}
        >
          {t('moreMoveCopies')}
        </button>
      )}
    </section>
  );
}
