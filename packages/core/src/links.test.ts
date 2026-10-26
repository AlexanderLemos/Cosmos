import { expect, test } from 'vitest';
import { noteLinks, resolveNoteLink } from './index';

test('wikilinks ignore code and frontmatter, preserve aliases and resolve only unambiguous targets', () => {
  expect(
    noteLinks(
      '---\na: "[[hidden]]"\n---\n[[Órbita#Título|apelido]] ![[image.png]] ![[Embebida#seção]]\n`[[code]]`\n```\n[[fence]]\n```\n[Outro](../Outra.md)',
    ),
  ).toEqual(['Órbita', 'Embebida', '../Outra.md']);
  const paths = ['a/Órbita.md', 'b/Órbita.md', 'Outra.md'];
  expect(resolveNoteLink('Órbita', 'a/Start.md', paths)).toBe('a/Órbita.md');
  expect(resolveNoteLink('Órbita', 'Start.md', paths)).toBeUndefined();
  expect(resolveNoteLink('../Outra', 'a/Start.md', paths)).toBe('Outra.md');
});
