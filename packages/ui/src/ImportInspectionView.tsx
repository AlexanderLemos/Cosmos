import type { ImportFileState, ImportInspection } from '@cosmos/fs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Workspace.module.css';

const states: ImportFileState[] = [
  'matching',
  'different',
  'missing',
  'incompatible',
  'unreadable',
];
const pageSize = 50;
export function ImportInspectionView({
  result,
  busy,
  download,
}: {
  result: ImportInspection;
  busy: boolean;
  download: (bytes: Uint8Array, name: string, type: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const filtered = result.entries.filter(
    (entry) => filter === 'all' || entry.current.state === filter,
  );
  const counts = {
    matching: 0,
    different: 0,
    missing: 0,
    incompatible: 0,
    unreadable: 0,
  };
  for (const entry of result.entries) counts[entry.current.state]++;
  return (
    <section
      aria-label={t('importInspection')}
      className={styles.importInspection}
    >
      <h4>{t('importInspection')}</h4>
      <p>
        {t('importInspectionTime', {
          time: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(result.checkedAt),
        })}
      </p>
      <p>{t('importInspectionHint')}</p>
      <ul>
        {states.map((state) => (
          <li key={state}>
            {t(`importCurrent_${state}`)}: {counts[state]}
          </li>
        ))}
      </ul>
      <label>
        {t('importInspectionFilter')}
        <select
          value={filter}
          disabled={busy}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">{t('importInspectionAll')}</option>
          {states.map((state) => (
            <option key={state} value={state}>
              {t(`importCurrent_${state}`)}
            </option>
          ))}
        </select>
      </label>
      <section
        className={styles.importInspectionTable}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded table region must be keyboard-scrollable.
        tabIndex={0}
        aria-label={t('importInspectionFiles')}
      >
        <table>
          <caption>{t('importInspectionFiles')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('importInspectionPath')}</th>
              <th scope="col">{t('importInspectionRecorded')}</th>
              <th scope="col">{t('importInspectionCurrent')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(page * pageSize, (page + 1) * pageSize)
              .map((entry) => (
                <tr key={entry.path}>
                  <th scope="row">{entry.path}</th>
                  <td>{t(`importRecorded_${entry.state}`)}</td>
                  <td>{t(`importCurrent_${entry.current.state}`)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <p role="status">
        {t('importInspectionRange', {
          start: filtered.length ? page * pageSize + 1 : 0,
          end: Math.min((page + 1) * pageSize, filtered.length),
          total: filtered.length,
        })}
      </p>
      <button
        type="button"
        disabled={busy || page === 0}
        onClick={() => setPage((value) => value - 1)}
      >
        {t('importInspectionPrevious')}
      </button>
      <button
        type="button"
        disabled={busy || (page + 1) * pageSize >= filtered.length}
        onClick={() => setPage((value) => value + 1)}
      >
        {t('importInspectionNext')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          download(
            new TextEncoder().encode(JSON.stringify(result, null, 2)),
            `cosmos-import-check-${result.header.id}.json`,
            'application/json',
          )
        }
      >
        {t('downloadImportInspection')}
      </button>
    </section>
  );
}
