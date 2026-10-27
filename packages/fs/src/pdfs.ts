export const MAX_PDF_BYTES = 16 * 1024 * 1024;

/** The signature is a format gate; the reader still has to parse the document. */
export function validatePdf(path: string, bytes: Uint8Array): void {
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE');
  const header = String.fromCharCode(...bytes.subarray(0, 8));
  if (!/\.pdf$/i.test(path) || !/^%PDF-[12]\.\d/.test(header))
    throw new Error('UNSUPPORTED_PDF');
}
