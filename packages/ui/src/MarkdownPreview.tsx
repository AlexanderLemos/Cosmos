import {
  imageSize,
  previewFragmentId,
  previewLink,
  previewPlugins,
} from '@cosmos/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import { LocalImage } from './LocalImage';
import styles from './MarkdownPreview.module.css';
import type { OpenVault } from './vault';

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
  vault,
}: {
  content: string;
  path: string;
  paths: string[];
  busy: boolean;
  externalLinks: boolean;
  location: PreviewLocation | null;
  onNavigate: (path: string, fragment: string) => void;
  vault: OpenVault;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const [missing, setMissing] = useState(false);
  const renderImage = useCallback(
    ({
      src = '',
      alt = '',
      width,
      height,
    }: {
      src?: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
    }) => (
      <LocalImage
        key={`${path}:${src}`}
        src={src}
        alt={alt}
        from={path}
        vault={vault}
        size={imageSize(`${width}${height === undefined ? '' : `x${height}`}`)}
      />
    ),
    [path, vault],
  );
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
            url.startsWith('cosmos-note:') || url.startsWith('cosmos-image:')
              ? url
              : defaultUrlTransform(url)
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
            img: renderImage,
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
