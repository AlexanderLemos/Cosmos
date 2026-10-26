import { expect, test } from 'vitest';
import { imageSize, imageTarget, resolveImageTarget } from './images';

test('Obsidian image sizes accept only bounded positive pixel dimensions', () => {
  expect(imageSize('300')).toEqual({ width: 300 });
  expect(imageSize('300x200')).toEqual({ width: 300, height: 200 });
  expect(imageSize('1x4096')).toEqual({ width: 1, height: 4096 });
  for (const value of [
    '',
    '0',
    '01',
    '-1',
    '1.5',
    '300%',
    '300px',
    '300x0',
    '300x',
    'x300',
    '300x200x100',
    '4097',
    '1x4097',
    '999999999',
    '300;display:none',
    ' 300 ',
    '300X200',
  ])
    expect(imageSize(value), value).toBeUndefined();
});

test('only local raster references can request bytes; wiki filenames decode once', () => {
  for (const url of [
    'https://example.org/a.png',
    '//example.org/a.png',
    '/private/a.png',
    'file:///a.png',
    'data:image/png,x.png',
    'blob:a.png',
    'java%73cript:a.png',
    'a%5Cb.png',
    'a%00.png',
    'a.svg',
    'a.png#fragment',
    'a.png?download',
    '%',
    'cosmos-image:https%3A%2F%2Fexample.org%2Fa.png',
  ])
    expect(imageTarget(url), url).toBeUndefined();
  expect(imageTarget('a%20b.png')).toEqual({ path: 'a b.png', wiki: false });
  expect(imageTarget('cosmos-image:100%25.png')).toEqual({
    path: '100%.png',
    wiki: true,
  });
});

test('Markdown is relative; wikilinks try local, vault-root and unique filename without choosing ambiguities', () => {
  const paths = [
    'Folder/a.png',
    'assets/Órbita.png',
    'A/dup.jpg',
    'B/dup.jpg',
    'assets/unique.gif',
  ];
  const resolve = (
    path: string,
    wiki = false,
    from = 'Folder/Note.md',
    entries = paths,
  ) => resolveImageTarget({ path, wiki }, from, entries);
  expect(resolve('a.png')).toBe('Folder/a.png');
  expect(resolve('../assets/Órbita.png')).toBe('assets/Órbita.png');
  expect(resolve('unique.gif')).toBeUndefined();
  expect(resolve('unique.gif', true)).toBe('assets/unique.gif');
  expect(resolve('assets/Órbita.png', true)).toBe('assets/Órbita.png');
  expect(resolve('assets/O\u0301rbita.png', true)).toBe('assets/Órbita.png');
  expect(resolve('dup.jpg', true)).toBeUndefined();
  expect(
    resolve('A.PNG', true, 'Note.md', ['a.png', 'A.PNG', 'Folder/A.PNG']),
  ).toBeUndefined();
  for (const path of [
    '../../assets/Órbita.png',
    '../.obsidian/a.png',
    '../.GIT/a.png',
    '../.cosmos/trash/a.png',
    '../.cosmos-write-x/a.png',
    'a//a.png',
    'bad./a.png',
  ])
    expect(resolve(path, true), path).toBeUndefined();
});
