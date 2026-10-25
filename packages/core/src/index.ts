import { toString as nodeText } from 'mdast-util-to-string';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export { headingId, headingSlug, previewLink, previewPlugins } from './preview';

/** Read-only inspection. Never serialize the AST over the user's Markdown. */
export function inspectMarkdown(source: string) {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .parse(source);
  const headings: { level: number; text: string }[] = [];
  const links: { destination: string; text: string }[] = [];
  visit(tree, 'heading', (node) => {
    headings.push({ level: node.depth, text: nodeText(node) });
  });
  visit(tree, 'link', (node) => {
    links.push({ destination: node.url, text: nodeText(node) });
  });
  return { headings, links };
}

/** Ignore code/frontmatter; keep link targets separate from their display aliases. */
export function noteLinks(source: string): string[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .parse(source);
  const links: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'text') {
      for (const match of node.value.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const target = match[1]?.split('|')[0]?.split('#')[0]?.trim();
        if (target) links.push(target);
      }
    }
    if (node.type === 'link' && !/^[a-z][a-z\d+.-]*:/i.test(node.url)) {
      const target = node.url.split('#')[0];
      if (target) {
        try {
          links.push(decodeURIComponent(target));
        } catch {
          /* Invalid URL is displayed as text. */
        }
      }
    }
  });
  return [...new Set(links)];
}
export function resolveNoteLink(
  target: string,
  from: string,
  paths: string[],
): string | undefined {
  const clean = target.replace(/\.md$/i, '').normalize('NFC').toLowerCase();
  const normalize = (path: string) => {
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/').replace(/\.md$/i, '').normalize('NFC').toLowerCase();
  };
  const local = normalize(`${from.split('/').slice(0, -1).join('/')}/${clean}`);
  const exact = paths.filter((p) => normalize(p) === local);
  if (exact.length === 1) return exact[0];
  const rooted = paths.filter((p) => normalize(p) === clean);
  if (rooted.length === 1) return rooted[0];
  const names = paths.filter((p) => normalize(p).split('/').at(-1) === clean);
  return names.length === 1 ? names[0] : undefined;
}
