import { expect, test } from 'vitest';
import { pdfTarget } from './pdfs';

test('PDF references accept local paths and explicit page numbers without turning URLs into vault paths', () => {
  expect(pdfTarget('../assets/Manual%20A.PDF#page=2')).toEqual({
    path: '../assets/Manual A.PDF',
    wiki: false,
    page: 2,
  });
  expect(pdfTarget('cosmos-pdf:Manual%20A.pdf%23page%3D12')).toEqual({
    path: 'Manual A.pdf',
    wiki: true,
    page: 12,
  });
  for (const value of [
    'https://example.org/a.pdf',
    '//example.org/a.pdf',
    '/a.pdf',
    'file:///a.pdf',
    'a.pdf?x',
    'a.pdf#page=0',
    'a.pdf#page=-1',
    'a.pdf#page=10000',
    'a.pdf#other',
    'a%00.pdf',
    'a%5Cb.pdf',
    'cosmos-pdf:https%3A%2F%2Fx.pdf',
    'cosmos-pdf:%',
    'a.svg',
  ])
    expect(pdfTarget(value), value).toBeUndefined();
});
