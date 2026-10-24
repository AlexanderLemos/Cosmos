import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeVaultZip } from './browser';

const text = (value: string) => new TextEncoder().encode(value);
describe('vault ZIP validation', () => {
  it('preserves hidden files and exact Markdown bytes', () => {
    const entries = {
      '.obsidian/app.json': text('{"x":true}'),
      'note.md': text('\ufeff# Órbita\r\nnext\n'),
      'asset.bin': new Uint8Array([0, 255, 42]),
    };
    expect(decodeVaultZip(zipSync(entries))).toEqual(entries);
  });
  it('rejects unsafe paths, Git data and case collisions before import', () => {
    for (const path of [
      '../outside.md',
      '/outside.md',
      'x\\outside.md',
      'CON.md',
      '.git/config',
    ]) {
      expect(() => decodeVaultZip(zipSync({ [path]: text('x') }))).toThrow();
    }
    expect(() =>
      decodeVaultZip(zipSync({ 'a.md': text('a'), 'A.md': text('b') })),
    ).toThrow('DESTINATION_EXISTS');
  });
  it('rejects excessive declared output before decompression', () => {
    const bytes = zipSync({ 'huge.md': text('x') });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 24, 257 * 1024 * 1024, true);
        break;
      }
    }
    expect(() => decodeVaultZip(bytes)).toThrow('IMPORT_TOO_LARGE');
  });
});
