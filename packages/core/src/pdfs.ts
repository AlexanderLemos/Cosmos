import { type ImageTarget, localAttachmentTarget } from './images';

/** Reuse portable local-path validation, with a separate PDF namespace. */
export function pdfTarget(
  url: string,
): (ImageTarget & { page: number }) | undefined {
  const wiki = url.startsWith('cosmos-pdf:');
  let value: string;
  try {
    value = wiki ? decodeURIComponent(url.slice('cosmos-pdf:'.length)) : url;
  } catch {
    return;
  }
  const hash = value.indexOf('#');
  const path = hash < 0 ? value : value.slice(0, hash);
  const fragment = hash < 0 ? '' : value.slice(hash + 1);
  if (fragment && !/^page=[1-9]\d{0,3}$/.test(fragment)) return;
  if (!/\.pdf$/i.test(path)) return;
  const target = localAttachmentTarget(
    wiki ? `cosmos-pdf:${encodeURIComponent(path)}` : path,
    'cosmos-pdf:',
    /\.pdf$/i,
  );
  if (!target) return;
  return { ...target, page: fragment ? Number(fragment.slice(5)) : 1 };
}
