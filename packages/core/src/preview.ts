import type { PhrasingContent, Root, RootContent } from 'mdast';
import { toString as nodeText } from 'mdast-util-to-string';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { blockId, remarkBlocks } from './blocks';
import { resolveNoteLink } from './index';

export function headingSlug(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function headingId(fragment: string): string {
  return `cosmos-heading-${headingSlug(fragment)}`;
}

// This AST is exclusively for display. It must never be serialized to the vault.
function remarkPreview() {
  return (tree: Root, file: { toString(): string }) => {
    // remark offsets exclude a leading BOM; the original source remains untouched.
    const source = file.toString().replace(/^\ufeff/, '');
    const ids = new Set<string>();
    const nextSuffix = new Map<string, number>();
    function walk(node: Root | RootContent, insideLink = false) {
      if (!('children' in node)) return;
      const linked =
        insideLink || node.type === 'link' || node.type === 'linkReference';
      node.children = node.children.flatMap((child): RootContent[] => {
        if (child.type !== 'text' || linked) {
          walk(child, linked);
          return [child];
        }
        const parts: PhrasingContent[] = [];
        let offset = 0;
        const raw = source.slice(
          child.position?.start.offset,
          child.position?.end.offset,
        );
        let rawOffset = 0;
        // Embeds remain literal until attachment/transclusion support is available.
        for (const match of child.value.matchAll(/(?<!!)\[\[([^\]\n]+)\]\]/g)) {
          const rawIndex = raw.indexOf(match[0], rawOffset);
          if (rawIndex < 0) continue;
          rawOffset = rawIndex + match[0].length;
          let escapes = 0;
          for (let i = rawIndex - 1; i >= 0 && raw[i] === '\\'; i--) escapes++;
          if (escapes % 2) continue;
          const [target, ...alias] = (match[1] ?? '').split('|');
          if (!target?.trim()) continue;
          parts.push({
            type: 'text',
            value: child.value.slice(offset, match.index),
          });
          parts.push({
            type: 'link',
            url: `cosmos-note:${encodeURIComponent(target.trim())}`,
            children: [{ type: 'text', value: alias.join('|') || target }],
          });
          offset = match.index + match[0].length;
        }
        parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts;
      }) as typeof node.children;
      if (node.type === 'heading') {
        const base = headingId(nodeText(node));
        let suffix = nextSuffix.get(base) ?? 0;
        let id = suffix ? `${base}-${suffix}` : base;
        while (ids.has(id)) id = `${base}-${++suffix}`;
        ids.add(id);
        nextSuffix.set(base, suffix + 1);
        node.data = { ...node.data, hProperties: { id } };
      }
    }
    walk(tree);
  };
}

export function previewFragmentId(fragment: string): string | undefined {
  return fragment.startsWith('^')
    ? blockId(fragment.slice(1))
    : headingId(fragment);
}

export const previewPlugins = [
  remarkGfm,
  remarkFrontmatter,
  remarkBlocks,
  remarkPreview,
];

export type PreviewLink =
  | { kind: 'note'; path: string; fragment: string }
  | { kind: 'external'; url: string }
  | { kind: 'unresolved' };

/** Only listed notes and explicit web/mail links can be activated by the renderer. */
export function previewLink(
  url: string,
  from: string,
  paths: string[],
): PreviewLink {
  const unresolved = { kind: 'unresolved' } as const;
  try {
    const wiki = url.startsWith('cosmos-note:');
    const value = wiki
      ? decodeURIComponent(url.slice('cosmos-note:'.length))
      : url;
    if (!wiki && /^(https?:|mailto:)/i.test(value)) {
      const parsed = new URL(value);
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol))
        return { kind: 'external', url: parsed.href };
    }
    const hash = value.indexOf('#');
    const rawPath = hash < 0 ? value : value.slice(0, hash);
    const path = wiki ? rawPath : decodeURIComponent(rawPath);
    const fragment =
      hash < 0
        ? ''
        : wiki
          ? value.slice(hash + 1)
          : decodeURIComponent(value.slice(hash + 1));
    if (
      /^[a-z][a-z\d+.-]*:/i.test(path) ||
      path.includes('\\') ||
      Array.from(path).some((char) => char.charCodeAt(0) < 32) ||
      path.startsWith('//') ||
      (fragment.startsWith('^') && !blockId(fragment.slice(1)))
    )
      return unresolved;
    if (!path && !fragment) return unresolved;
    const target = path ? resolveNoteLink(path, from, paths) : from;
    return target ? { kind: 'note', path: target, fragment } : unresolved;
  } catch {
    return unresolved;
  }
}
