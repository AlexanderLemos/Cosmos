import type { Root } from 'mdast';
import { toString as nodeText } from 'mdast-util-to-string';
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
  it('keeps text surrounding image embeds and does not also create a note link', () => {
    const tree = preview('Antes ![[foto.png]] depois [[Nota]] fim.');
    expect(nodeText(tree)).toBe('Antes foto.png depois Nota fim.');
    const links: string[] = [];
    visit(tree, 'link', (node) => {
      links.push(node.url);
    });
    expect(links).toEqual(['cosmos-note:Nota']);
  });
  it('adds display-only dimensions to image embeds without turning aliases or invalid sizes into CSS', () => {
    const tree = preview(
      'Antes ![[a.png|300]] ![[b.png|300x200]] ![[c.png|0]] ![[d.png|300%]] ![[e.png|300|200]] ![[f.png|Legenda]] depois',
    );
    const images: unknown[] = [];
    visit(tree, 'image', (node) => {
      images.push({ alt: node.alt, data: node.data });
    });
    expect(images).toEqual([
      { alt: 'a.png', data: { hProperties: { width: 300 } } },
      { alt: 'b.png', data: { hProperties: { width: 300, height: 200 } } },
      ...['c.png', 'd.png', 'e.png', 'f.png'].map((alt) => ({
        alt,
        data: { hProperties: undefined },
      })),
    ]);
    expect(nodeText(tree)).toBe(
      'Antes a.png b.png c.png d.png e.png f.png depois',
    );
  });
  it('recognizes raster embeds but leaves escapes, code, YAML and other transclusions alone', () => {
    const tree = preview(
      '---\nimage: "![[hidden.png]]"\n---\n![[assets/Órbita.png|300]] ![[other.JPG]] ![[note#^id]] ![[a.svg]] \\![[escaped.png]] &#33;[[entity.png]] `![[code.png]]`\n\n[![Linked](a.png)](https://example.org)',
    );
    const images: string[] = [];
    visit(tree, 'image', (node) => {
      images.push(node.url);
    });
    expect(images).toEqual([
      'cosmos-image:assets%2F%C3%93rbita.png',
      'cosmos-image:other.JPG',
    ]);
  });
  it('sizes Markdown images and references using only a valid final alt suffix, preserving descriptions and destinations', () => {
    const tree = preview(
      '\ufeff![Órbita &amp; Lua|300](assets/a.png "Título")\r\n\n![Caixa|300x200][foto]\n\n![|40](empty.png)\n\n![A | B|120](b.png)\n\n![Inválida|4097](bad.png)\n\n![CSS|300px](css.png)\n\n![Espaços| 300](spaces.png)\n\n![Fim|300|texto](suffix.png)\n\n![Entidade&#124;80](entity.png)\n\n![Tabela|90][tabela]\n\n[![Link|300](linked.png)](https://example.org)\n\n`![Código|300](code.png)`\n\n[foto]: assets/ref.png "Referência"\n[tabela]: table.png\n',
    );
    const images: unknown[] = [];
    visit(tree, (node) => {
      if (node.type === 'image' || node.type === 'imageReference')
        images.push({
          alt: node.alt,
          target: node.type === 'image' ? node.url : node.identifier,
          size: (node.data as { hProperties?: unknown } | undefined)
            ?.hProperties,
        });
    });
    expect(images).toEqual([
      { alt: 'Órbita & Lua', target: 'assets/a.png', size: { width: 300 } },
      { alt: 'Caixa', target: 'foto', size: { width: 300, height: 200 } },
      { alt: '', target: 'empty.png', size: { width: 40 } },
      { alt: 'A | B', target: 'b.png', size: { width: 120 } },
      { alt: 'Inválida|4097', target: 'bad.png', size: undefined },
      { alt: 'CSS|300px', target: 'css.png', size: undefined },
      { alt: 'Espaços| 300', target: 'spaces.png', size: undefined },
      { alt: 'Fim|300|texto', target: 'suffix.png', size: undefined },
      { alt: 'Entidade', target: 'entity.png', size: { width: 80 } },
      { alt: 'Tabela', target: 'tabela', size: { width: 90 } },
    ]);
    expect(nodeText(tree)).toContain('Link|300');
    expect(nodeText(tree)).toContain('![Código|300](code.png)');
  });
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
