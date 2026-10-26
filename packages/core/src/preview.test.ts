import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import {
  headingId,
  previewFragmentId,
  previewLink,
  previewPlugins,
} from './preview';

function preview(source: string): Root {
  const processor = unified().use(remarkParse).use(previewPlugins);
  return processor.runSync(processor.parse(source), source) as Root;
}

describe('read-only Markdown preview', () => {
  it('links plain wikilinks and aliases while leaving code, frontmatter, embeds and escaped syntax alone', () => {
    const tree = preview(
      '\ufeff---\r\naliases: ["[[Hidden]]"]\n---\r\n[[Nota#Seção|Abrir]] [[Outra]]\n\n`[[Code]]` ![[Embed]] \\[[Literal]] &#91;&#91;Entity]]\n\n[existing [[Label]]](https://example.org)\n\n```md\n[[Fence]]\n```',
    );
    const urls: string[] = [];
    visit(tree, 'link', (node) => {
      urls.push(node.url);
    });
    expect(urls).toEqual([
      'cosmos-note:Nota%23Se%C3%A7%C3%A3o',
      'cosmos-note:Outra',
      'https://example.org',
    ]);
  });

  it('creates scoped, deterministic IDs, including repeated headings and Unicode', () => {
    const tree = preview(
      '# Órbita **local**\n# Órbita local\n# Órbita local-1\n# Órbita local',
    );
    const ids: unknown[] = [];
    visit(tree, 'heading', (node) => {
      ids.push(node.data);
    });
    expect(ids).toEqual(
      [
        'cosmos-heading-órbita-local',
        'cosmos-heading-órbita-local-1',
        'cosmos-heading-órbita-local-1-1',
        'cosmos-heading-órbita-local-2',
      ].map((id) => ({ hProperties: { id } })),
    );
    expect(headingId('O\u0301rbita local')).toBe('cosmos-heading-órbita-local');
  });

  it('resolves relative, encoded, aliased targets and same-note headings without choosing ambiguous names', () => {
    const paths = [
      'Folder/Mapa.md',
      'Folder/Órbita.md',
      'A/Duplicate.md',
      'B/Duplicate.md',
      '100%.md',
    ];
    expect(
      previewLink(
        '%C3%93rbita.md#Pr%C3%B3ximos%20passos',
        paths[0] as string,
        paths,
      ),
    ).toEqual({
      kind: 'note',
      path: 'Folder/Órbita.md',
      fragment: 'Próximos passos',
    });
    expect(previewLink('#local', 'Folder/Mapa.md', paths)).toEqual({
      kind: 'note',
      path: 'Folder/Mapa.md',
      fragment: 'local',
    });
    expect(previewLink('cosmos-note:100%25', 'Folder/Mapa.md', paths)).toEqual({
      kind: 'note',
      path: '100%.md',
      fragment: '',
    });
    expect(previewLink('Duplicate', 'Folder/Mapa.md', paths)).toEqual({
      kind: 'unresolved',
    });
    expect(previewLink('missing.md', 'Folder/Mapa.md', paths)).toEqual({
      kind: 'unresolved',
    });
  });

  it('rejects active, local-file, malformed and protocol-relative URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///tmp/private.md',
      '//example.org',
      '\\example.org',
      '%',
      'cosmos-note:%',
      'java%73cript:alert(1)',
      '%00a',
      'cosmos-note:javascript%3Aalert(1)',
      '#^',
      '#^invalid_id',
      '#^invalid%20id',
    ]) {
      expect(previewLink(url, 'a.md', ['a.md'])).toEqual({
        kind: 'unresolved',
      });
    }
    expect(previewLink('https://example.org/hello', 'a.md', [])).toEqual({
      kind: 'external',
      url: 'https://example.org/hello',
    });
    expect(previewLink('mailto:hello@example.org', 'a.md', [])).toEqual({
      kind: 'external',
      url: 'mailto:hello@example.org',
    });
  });

  it('resolves block fragments exactly, including encoded Markdown links and same-note wikilinks', () => {
    for (const url of ['cosmos-note:%23%5EBlock-1', '#%5EBlock-1']) {
      expect(previewLink(url, 'a.md', ['a.md'])).toEqual({
        kind: 'note',
        path: 'a.md',
        fragment: '^Block-1',
      });
    }
    expect(previewLink('b.md#%5EBlock-1', 'a.md', ['a.md', 'b.md'])).toEqual({
      kind: 'note',
      path: 'b.md',
      fragment: '^Block-1',
    });
    expect(previewFragmentId('^Block-1')).toBe('cosmos-block-Block-1');
    expect(previewFragmentId('Block-1')).toBe('cosmos-heading-block-1');
    expect(previewFragmentId('^bad id')).toBeUndefined();
  });
});
