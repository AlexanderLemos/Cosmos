export type ImageTarget = { path: string; wiki: boolean };
export type ImageSize = { width: number; height?: number };

/** Obsidian embed sizes are bounded CSS pixels, never CSS expressions or URLs. */
export function imageSize(value: string): ImageSize | undefined {
  const match = /^([1-9]\d{0,3})(?:x([1-9]\d{0,3}))?$/.exec(value);
  if (!match) return;
  const width = Number(match[1]);
  const height = match[2] ? Number(match[2]) : undefined;
  if (width > 4096 || (height !== undefined && height > 4096)) return;
  return height === undefined ? { width } : { width, height };
}

/** Decode only local raster references; never reinterpret a URL as a vault path. */
export function imageTarget(url: string): ImageTarget | undefined {
  try {
    const wiki = url.startsWith('cosmos-image:');
    const raw = wiki ? url.slice('cosmos-image:'.length) : url;
    if (!wiki && /[?#]/.test(raw)) return;
    const path = decodeURIComponent(raw);
    if (
      !path ||
      /^[a-z][a-z\d+.-]*:/i.test(path) ||
      path.startsWith('/') ||
      /[\\:<>"|?*]/.test(path) ||
      Array.from(path).some(
        (char) =>
          char.charCodeAt(0) < 32 ||
          (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159),
      )
    )
      return;
    if (!/\.(png|jpe?g|gif|webp)$/i.test(path)) return;
    return { path, wiki };
  } catch {
    return;
  }
}

export function resolveImageTarget(
  target: ImageTarget,
  from: string,
  paths: string[],
): string | undefined {
  const normalize = (path: string) => {
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (part === '..') {
        if (!parts.length) return;
        parts.pop();
      } else if (part === '.') continue;
      else if (
        !part ||
        /[. ]$/.test(part) ||
        part.toLowerCase().startsWith('.cosmos') ||
        ['.git', '.obsidian'].includes(part.toLowerCase())
      )
        return;
      else parts.push(part);
    }
    return parts.join('/').normalize('NFC').toLowerCase();
  };
  const directory = from.split('/').slice(0, -1);
  const local = normalize([...directory, target.path].join('/'));
  if (!local) return;
  const matches = (key: string) =>
    paths.filter((path) => normalize(path) === key);
  const nearby = matches(local);
  if (nearby.length) return nearby.length === 1 ? nearby[0] : undefined;
  if (!target.wiki || /^\.{1,2}\//.test(target.path)) return;
  const rooted = normalize(target.path);
  if (!rooted) return;
  const exact = matches(rooted);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  if (target.path.includes('/')) return;
  const names = paths.filter(
    (path) => normalize(path)?.split('/').at(-1) === rooted,
  );
  return names.length === 1 ? names[0] : undefined;
}
