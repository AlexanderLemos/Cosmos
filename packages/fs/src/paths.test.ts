import { expect, test } from 'vitest';
import { validatePath } from './browser';

test('portable paths reject traversal, ADS and Windows devices', () => {
  for (const path of [
    '../a.md',
    '/a.md',
    'C:/a.md',
    'a\\b.md',
    'a//b.md',
    'CON.md',
    'com1/a.md',
    'a.md:secret',
    'a./b.md',
  ])
    expect(() => validatePath(path)).toThrow();
  expect(validatePath('Universos/Órbita/nota.md')).toEqual([
    'Universos',
    'Órbita',
    'nota.md',
  ]);
});
