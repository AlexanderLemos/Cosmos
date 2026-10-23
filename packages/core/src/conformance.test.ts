import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { inspectMarkdown } from './index';

const fixtures = new URL('../../../tests/conformance/', import.meta.url);
describe('shared Markdown fixtures (TS ↔ Rust)', () => {
  for (const file of readdirSync(fixtures).filter((name) =>
    name.endsWith('.md'),
  )) {
    test(file, () => {
      const input = readFileSync(new URL(file, fixtures), 'utf8');
      const expected = JSON.parse(
        readFileSync(
          fileURLToPath(new URL(file.replace('.md', '.json'), fixtures)),
          'utf8',
        ),
      );
      expect(inspectMarkdown(input)).toEqual(expected);
    });
  }
});
