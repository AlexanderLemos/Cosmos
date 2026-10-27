import { pdfTarget, resolveImageTarget } from '@cosmos/core';
import { validatePdf } from '@cosmos/fs/pdfs';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Pdf.module.css';
import type { OpenVault } from './vault';

export function PdfDialog({
  src,
  from,
  vault,
  onClose,
}: {
  src: string;
  from: string;
  vault: OpenVault;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(pdfTarget(src)?.page ?? 1);
  const [name, setName] = useState(pdfTarget(src)?.path ?? 'PDF');
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);
  const [text, setText] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    const open = async () => {
      try {
        const target = pdfTarget(src);
        if (!target || !vault.pdfPaths || !vault.readPdf) throw new Error();
        const paths = await vault.pdfPaths();
        if (cancelled) return;
        const path = resolveImageTarget(target, from, paths);
        if (!path) throw new Error('PDF_UNRESOLVED');
        const bytes = await vault.readPdf(path);
        if (cancelled) return;
        validatePdf(path, bytes);
        const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (cancelled) return;
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdf.getDocument({
          data: bytes,
          useWasm: false,
          useWorkerFetch: false,
          useSystemFonts: true,
          enableXfa: false,
          stopAtErrors: true,
          maxImageSize: 16 * 1024 * 1024,
          canvasMaxAreaInBytes: 8 * 1024 * 1024,
        });
        destroy = () => task.destroy();
        task.onPassword = () => {
          if (!cancelled) setError('pdfPassword');
          void task.destroy().catch(() => {});
        };
        const loaded = await task.promise;
        if (cancelled) return;
        if (loaded.numPages > 2000) throw new Error('PDF_PAGE_LIMIT');
        if (target.page > loaded.numPages) throw new Error('PDF_PAGE_MISSING');
        setName(path);
        setDocument(loaded);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setError(
          (current) =>
            current ||
            (message.includes('PDF_TOO_LARGE')
              ? 'pdfTooLarge'
              : message.includes('PDF_UNRESOLVED')
                ? 'pdfUnresolved'
                : message.includes('PDF_PAGE_LIMIT')
                  ? 'pdfPageLimit'
                  : message.includes('PDF_PAGE_MISSING')
                    ? 'pdfPageMissing'
                    : 'pdfFailed'),
        );
        if (destroy) void destroy().catch(() => {});
      }
    };
    void open();
    return () => {
      cancelled = true;
      if (destroy) void destroy().catch(() => {});
    };
  }, [src, from, vault]);
  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    setRendering(true);
    setText('');
    setError('');
    const render = async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (cancelled || !canvas.current) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(
          1.5,
          1200 / original.width,
          1600 / original.height,
        );
        if (!Number.isFinite(scale) || scale <= 0) throw new Error();
        const viewport = pdfPage.getViewport({ scale });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = pdfPage.render({ canvas: target, viewport, annotationMode: 0 });
        await task.promise;
        const content = await pdfPage.getTextContent();
        if (cancelled) return;
        let value = '';
        for (const item of content.items) {
          if ('str' in item) value += item.str + (item.hasEOL ? '\n' : ' ');
          if (value.length > 250_000) break;
        }
        setText(value.slice(0, 250_000));
        setRendering(false);
        pdfPage.cleanup();
      } catch {
        if (!cancelled) {
          setError('pdfFailed');
          setRendering(false);
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, page]);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={t('pdfReader')}
      onClose={onClose}
    >
      <header className={styles.toolbar}>
        <strong>{name}</strong>
        <button type="button" onClick={onClose}>
          {t('closePdf')}
        </button>
      </header>
      <p>{t('pdfHint')}</p>
      {document && (
        <nav className={styles.toolbar} aria-label={t('pdfPages')}>
          <button
            type="button"
            disabled={rendering || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('pdfPrevious')}
          </button>
          <span role="status">
            {t('pdfPage', { page, total: document.numPages })}
          </span>
          <button
            type="button"
            disabled={rendering || page >= document.numPages}
            onClick={() => setPage(page + 1)}
          >
            {t('pdfNext')}
          </button>
        </nav>
      )}
      {error ? (
        <p role="alert">{t(error)}</p>
      ) : (
        (!document || rendering) && <p role="status">{t('pdfLoading')}</p>
      )}
      <canvas
        ref={canvas}
        className={styles.canvas}
        hidden={!document || rendering || !!error}
        role="img"
        aria-label={t('pdfPageImage', { page })}
      />
      {document && !rendering && !error && (
        <details>
          <summary>{t('pdfText')}</summary>
          <p>{t('pdfTextHint')}</p>
          <pre className={styles.text}>{text || t('pdfNoText')}</pre>
        </details>
      )}
    </dialog>
  );
}
