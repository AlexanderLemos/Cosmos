import type { Root } from 'mdast';
import { toString as nodeText } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import { previewPlugins } from './preview';

function preview(source: string): Root {
  const processor = unified().use(remarkParse).use(previewPlugins);
  return processor.runSync(processor.parse(source), source) as Root;
}
function quotes(tree: Root) {
  const result: unknown[] = [];
  visit(tree, 'blockquote', (node) => {
    result.push(node.data);
  });
  return result;
}

describe('display-only Obsidian callouts', () => {
  it('supports default titles, aliases, unknown types and nested fold states', () => {
    const tree = preview(
      '> [!NOTE]\n> Body\n>\n> > [!hint]- Nested\n> > Secret\n\n> [!CUSTOM]+\n> Other',
    );
    expect(quotes(tree)).toEqual([
      { hName: 'div', hProperties: { dataCallout: 'note', role: 'note' } },
      { hName: 'details', hProperties: { dataCallout: 'tip', open: false } },
      { hName: 'details', hProperties: { dataCallout: 'note', open: true } },
    ]);
    expect(tree.children[0]).toMatchObject({
      children: [
        { data: { hName: 'div', hProperties: { dataCalloutDefault: 'note' } } },
        { type: 'paragraph', children: [{ value: 'Body' }] },
        { type: 'blockquote' },
      ],
    });
    expect(nodeText(tree)).toContain('Nested');
    expect(nodeText(tree)).not.toContain('[!');
  });

  it('keeps body links, escapes and anchors after splitting BOM and mixed line endings', () => {
    for (const ending of ['\n', '\r\n', '\r']) {
      const tree = preview(
        `\ufeff> [!warning]- Title **bold** [label](a.md) [[Literal]]${ending}> [[Target]] \\[[Escaped]] &#91;&#91;Entity]] ^body${ending}>${ending}> ## Inside\n\n^outer`,
      );
      expect(tree.children[0]).toMatchObject({
        data: { hProperties: { id: 'cosmos-block-outer' } },
      });
      const urls: string[] = [];
      visit(tree, 'link', (node) => {
        urls.push(node.url);
      });
      expect(urls).toEqual(['cosmos-note:Target']);
      const paragraphs: unknown[] = [];
      visit(tree, 'paragraph', (node) => {
        paragraphs.push(node.data);
      });
      expect(paragraphs).toContainEqual({
        hProperties: { id: 'cosmos-block-body' },
      });
      expect(nodeText(tree)).toContain('Title bold label [[Literal]]');
    }
  });

  it('leaves escaped/entity markers, normal quotes, code, YAML and malformed syntax alone', () => {
    const source =
      '---\nx: "[!note]"\n---\n> \\[!note] Literal\n\n> &#91;!note] Entity\n\n> Text [!note]\n\n> `[!note]`\n\n> [!note]suffix\n\n> [!note] - separate\n\n```md\n> [!note]\n```';
    const data = quotes(preview(source));
    expect(data.slice(0, 5)).toEqual(Array(5).fill(undefined));
    expect(data[5]).toMatchObject({ hName: 'div' });
  });

  it('uses noninteractive text titles, omits HTML and keeps ambiguous multiline headers literal', () => {
    const tree = preview(
      '> [!note]- <span>Safe</span> [label](javascript:alert) ![alt](remote.png) [[Wiki]]\n> Body',
    );
    expect(nodeText(tree)).toBe('Safe label alt [[Wiki]]Body');
    const interactive: string[] = [];
    visit(tree, (node) => {
      if (['html', 'image', 'link'].includes(node.type))
        interactive.push(node.type);
    });
    expect(interactive).toEqual([]);
    for (const title of [
      'Title&#10;rest',
      'Title&NewLine;rest',
      '`spanning\n> code`',
    ]) {
      expect(quotes(preview(`> [!note] ${title}\n> Body`))).toEqual([
        undefined,
      ]);
    }
  });

  it('supports header-only blocks and hard breaks without swallowing subsequent content', () => {
    for (const line of [
      '> [!tip] **Title**  \n> Body',
      '> [!tip] **Title**\\\n> Body',
    ]) {
      const tree = preview(line);
      expect(nodeText(tree)).toBe('TitleBody');
      expect(tree.children[0]).toMatchObject({
        children: [
          { data: { hName: 'div' }, children: [{ value: 'Title' }] },
          { type: 'paragraph', children: [{ value: 'Body' }] },
        ],
      });
    }
    const tree = preview('> [!note]- Only ^title\n\nOutside');
    expect(tree.children[0]).toMatchObject({
      children: [{ data: { hProperties: { id: 'cosmos-block-title' } } }],
    });
    expect(nodeText(tree)).toBe('OnlyOutside');
  });
});
