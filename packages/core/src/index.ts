import { toString as nodeText } from 'mdast-util-to-string';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

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
