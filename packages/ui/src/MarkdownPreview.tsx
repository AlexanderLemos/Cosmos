import { previewFragmentId, previewLink, previewPlugins } from '@cosmos/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import styles from './MarkdownPreview.module.css';

export type PreviewLocation = {
  path: string;
  fragment: string;
  request: number;
};

export function MarkdownPreview({
  content,
  path,
  paths,
  busy,
  externalLinks,
  location,
  onNavigate,
}: {
  content: string;
  path: string;
  paths: string[];
  busy: boolean;
  externalLinks: boolean;
  location: PreviewLocation | null;
  onNavigate: (path: string, fragment: string) => void;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    if (location?.path !== path || !location.fragment) return;
    const id = previewFragmentId(location.fragment);
    const target = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[id]') ?? [],
    ).find((element) => element.id === id);
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    } else setMissing(true);
  }, [location, path]);
  return (
    <section
      className={styles.preview}
      ref={root}
      aria-label={t('markdownPreview')}
    >
      {missing && (
        <p role="status">
          {t(
            location?.fragment.startsWith('^')
              ? 'blockNotFound'
              : 'sectionNotFound',
          )}
        </p>
      )}
      {content.length > 256 * 1024 ? (
        <p>{t('previewTooLarge')}</p>
      ) : (
        <Markdown
          skipHtml
          remarkPlugins={previewPlugins}
          urlTransform={(url) =>
            url.startsWith('cosmos-note:') ? url : defaultUrlTransform(url)
          }
          components={{
            a: ({ href = '', children }) => {
              const target = previewLink(href, path, paths);
              if (target.kind === 'external' && !externalLinks)
                return (
                  <span>
                    {children} ({target.url})
                  </span>
                );
              if (target.kind === 'external')
                return (
                  <a
                    href={target.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {children}
                  </a>
                );
              return (
                <button
                  type="button"
                  className={styles.noteLink}
                  disabled={busy || target.kind !== 'note'}
                  title={target.kind !== 'note' ? t('unresolved') : undefined}
                  onClick={() => {
                    if (target.kind === 'note')
                      onNavigate(target.path, target.fragment);
                  }}
                >
                  {children}
                  {target.kind !== 'note' && <span> · {t('unresolved')}</span>}
                </button>
              );
            },
            // No automatic requests, blob/file URLs, SVG, or access outside the selected vault.
            img: ({ alt }) => (
              <span className={styles.attachment}>
                {t('imageNotDisplayed', { name: alt || t('image') })}
              </span>
            ),
            input: ({ checked }) => (
              <span
                role="img"
                aria-label={t(checked ? 'taskDone' : 'taskPending')}
              >
                {checked ? '☑' : '☐'}
              </span>
            ),
          }}
        >
          {content}
        </Markdown>
      )}
    </section>
  );
}
