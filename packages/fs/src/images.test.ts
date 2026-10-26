import { expect, test } from 'vitest';
import {
  excludedImagePath,
  imageExtension,
  imageMediaType,
  MAX_IMAGE_BYTES,
} from './images';

test('image MIME requires both a supported extension and matching binary signature', () => {
  for (const [path, header, expected] of [
    ['a.PNG', [137, 80, 78, 71, 13, 10, 26, 10], 'image/png'],
    ['a.jpeg', [255, 216, 255, 224], 'image/jpeg'],
    ['a.gif', [...Buffer.from('GIF89a')], 'image/gif'],
    ['a.webp', [...Buffer.from('RIFF0000WEBP')], 'image/webp'],
  ] as const) {
    expect(imageMediaType(path, Uint8Array.from(header))).toBe(expected);
    expect(() => imageMediaType('a.svg', Uint8Array.from(header))).toThrow(
      'UNSUPPORTED_IMAGE',
    );
  }
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode('<svg onload="alert(1)"/>'),
    new TextEncoder().encode('GIF89a'),
  ])
    expect(() => imageMediaType('a.png', bytes)).toThrow('UNSUPPORTED_IMAGE');
  expect(() =>
    imageMediaType('a.png', new Uint8Array(MAX_IMAGE_BYTES + 1)),
  ).toThrow('IMAGE_TOO_LARGE');
  expect(excludedImagePath('A/.OBSIDIAN/image.png')).toBe(true);
  expect(excludedImagePath('A/.cosmos-write-test/image.png')).toBe(true);
  expect(excludedImagePath('A/image.png')).toBe(false);
  expect(imageExtension('image.constructor')).toBeUndefined();
  expect(imageExtension('image.__proto__')).toBeUndefined();
});
