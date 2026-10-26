export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function imageExtension(path: string): string | undefined {
  switch (path.split('.').at(-1)?.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return undefined;
  }
}

export function excludedImagePath(path: string): boolean {
  return path.split('/').some((part) => {
    const lower = part.toLowerCase();
    return (
      lower.startsWith('.cosmos') || lower === '.git' || lower === '.obsidian'
    );
  });
}

/** Never trust the filename or a File's supplied MIME type alone. No SVG/HTML. */
export function imageMediaType(path: string, bytes: Uint8Array): string {
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  const starts = (values: number[]) =>
    values.every((value, i) => bytes[i] === value);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));
  const type = starts([137, 80, 78, 71, 13, 10, 26, 10])
    ? 'image/png'
    : starts([255, 216, 255])
      ? 'image/jpeg'
      : ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
        ? 'image/gif'
        : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
          ? 'image/webp'
          : undefined;
  if (!type || type !== imageExtension(path))
    throw new Error('UNSUPPORTED_IMAGE');
  return type;
}
