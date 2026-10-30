import { type ImageSize, imageTarget } from '@cosmos/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MarkdownPreview.module.css';
import { readLocalImage } from './read-local-image';
import type { OpenVault } from './vault';

export function LocalImage({
  src,
  alt,
  from,
  vault,
  size,
}: {
  src: string;
  alt: string;
  from: string;
  vault: OpenVault;
  size?: ImageSize;
}) {
  const { t } = useTranslation();
  const target = imageTarget(src);
  const name = alt || target?.path || t('image');
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const resource = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const release = () => {
    if (resource.current) URL.revokeObjectURL(resource.current);
    resource.current = undefined;
  };
  useEffect(
    () => () => {
      generation.current++;
      if (resource.current) URL.revokeObjectURL(resource.current);
    },
    [],
  );
  const hide = () => {
    generation.current++;
    release();
    setUrl(undefined);
    setLoading(false);
  };
  const show = async () => {
    if (!target || !vault.imagePaths || !vault.readImage) return;
    const request = ++generation.current;
    setError('');
    setLoading(true);
    try {
      const blob = await readLocalImage(
        src,
        from,
        vault,
        () => request === generation.current,
      );
      if (!blob || request !== generation.current) return;
      const next = URL.createObjectURL(blob);
      release();
      resource.current = next;
      setUrl(next);
    } catch (error) {
      if (request !== generation.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setError(
        message.includes('IMAGE_TOO_LARGE')
          ? 'imageTooLarge'
          : message.includes('IMAGE_UNRESOLVED')
            ? 'imageUnresolved'
            : 'imageFailed',
      );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };
  if (!target || !vault.readImage || !vault.imagePaths)
    return (
      <span className={styles.attachment}>
        {t('imageNotDisplayed', { name })}
      </span>
    );
  return (
    <span className={styles.localImage}>
      {url && (
        <img
          src={url}
          alt={name}
          width={size?.width}
          height={size?.height}
          onError={() => {
            hide();
            setError('imageFailed');
          }}
        />
      )}
      <button
        type="button"
        onClick={() => {
          if (url || loading) hide();
          else void show();
        }}
      >
        {t(url ? 'hideImage' : loading ? 'cancelImage' : 'showImage', { name })}
      </button>
      {loading && <span role="status">{t('imageLoading')}</span>}
      {error && <span role="status">{t(error)}</span>}
    </span>
  );
}
