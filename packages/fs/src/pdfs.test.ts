import { expect, test } from 'vitest';
import { MAX_PDF_BYTES, validatePdf } from './pdfs';

test('PDF format gates require the extension, a version header and bounded bytes', () => {
  expect(() =>
    validatePdf('a.PDF', new TextEncoder().encode('%PDF-1.7\n')),
  ).not.toThrow();
  expect(() =>
    validatePdf('a.pdf', new TextEncoder().encode('%PDF-2.0\n')),
  ).not.toThrow();
  for (const [path, value] of [
    ['a.pdf', '<html>'],
    ['a.pdf', '%PDF-1.'],
    ['a.pdf', '%PDF-1.x'],
    ['a.html', '%PDF-1.7'],
  ])
    expect(() =>
      validatePdf(path as string, new TextEncoder().encode(value)),
    ).toThrow('UNSUPPORTED_PDF');
  expect(() => validatePdf('a.pdf', new Uint8Array(MAX_PDF_BYTES + 1))).toThrow(
    'PDF_TOO_LARGE',
  );
});
