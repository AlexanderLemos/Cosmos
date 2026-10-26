import { readFileSync } from 'node:fs';
import type { Root } from 'mdast';
import { toString as nodeText } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { expect, test } from 'vitest';
import { previewPlugins } from './preview';

function preview(source: string) {
  const processor = unified().use(remarkParse).use(previewPlugins);
  return processor.runSync(processor.parse(source), source) as Root;
}
function anchors(tree: Root) {
  const result: { type: string; id: unknown; text: string }[] = [];
  visit(tree, (node) => {
    const data = node.data as { hProperties?: { id?: string } } | undefined;
    if (data?.hProperties?.id)
      result.push({
        type: node.type,
        id: data.hProperties.id,
        text: nodeText(node),
      });
  });
  return result;
}

test('Obsidian fixture anchors paragraphs, list items and standalone list/quote/table IDs without mutating source', () => {
  const source = readFileSync(
    new URL('../../../tests/conformance/obsidian-blocks.md', import.meta.url),
    'utf8',
  );
  const tree = preview(source);
  expect(anchors(tree).map(({ type, id }) => ({ type, id }))).toEqual([
    { type: 'heading', id: 'cosmos-heading-blocos-obsidian' },
    { type: 'paragraph', id: 'cosmos-block-intro' },
    { type: 'list', id: 'cosmos-block-lista' },
    { type: 'listItem', id: 'cosmos-block-item-1' },
    { type: 'blockquote', id: 'cosmos-block-citacao' },
    { type: 'table', id: 'cosmos-block-tabela' },
  ]);
  expect(nodeText(tree)).not.toContain('portável. ^intro');
  expect(source).toContain('portável. ^intro');
  expect(preview(source)).toEqual(tree);
});

test('preserves formatted content and recognizes BOM, CRLF, bare CR and same-paragraph marker lines', () => {
  const tree = preview(
    '\ufeffUm **bloco** com `código`. ^A-1\r\n\r\nOutro\n^next\r\n\r\nTerceiro\r\r^third\r\r> Citação ^quote\r',
  );
  expect(anchors(tree)).toEqual([
    { type: 'paragraph', id: 'cosmos-block-A-1', text: 'Um bloco com código.' },
    { type: 'paragraph', id: 'cosmos-block-next', text: 'Outro' },
    { type: 'paragraph', id: 'cosmos-block-third', text: 'Terceiro' },
    { type: 'paragraph', id: 'cosmos-block-quote', text: 'Citação' },
  ]);
});

test('leaves escaped, encoded, invalid, code, HTML, frontmatter and unsupported markers literal', () => {
  for (const source of [
    'Text \\^escaped',
    'Text &#94;entity',
    'Text ^entit&#121;',
    'Text ^bad_id',
    'Text ^non-ascii-é',
    'Text ^middle more',
    'Text **^bold**',
    'Text `^inline`',
    '**Bold**^joined',
    '`Code`^joined',
    '[Link](note.md)^joined',
    'Text [^link](note.md)',
    '```md\nText ^code\n```',
    '    Text ^indented',
    '<div>Text ^html</div>',
    '---\naliases: text ^yaml\n---',
    '^orphan',
    '# Heading\n\n^heading',
    '```\ncode\n```\n\n^fence',
    '[ref]: note.md\n\n^definition',
  ]) {
    expect(
      anchors(preview(source)).filter(({ id }) =>
        String(id).startsWith('cosmos-block-'),
      ),
      source,
    ).toEqual([]);
  }
});

test('does not choose duplicate IDs or competing IDs for the same block, and IDs are case-sensitive', () => {
  const source =
    'First ^dup\n\nSecond\n\n^dup\n\nThird ^one\n\n^two\n\nLower ^case\n\nUpper ^Case';
  const tree = preview(source);
  expect(anchors(tree).map(({ id }) => id)).toEqual([
    'cosmos-block-case',
    'cosmos-block-Case',
  ]);
  expect(nodeText(tree)).toContain('First ^dup');
  expect(nodeText(tree)).toContain('Third ^one');
  expect(nodeText(tree)).toContain('^two');
});
