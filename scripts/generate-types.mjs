import { readdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const root = new URL('../packages/schemas/', import.meta.url);
const input = process.argv[2]
  ? pathToFileURL(`${process.argv[2]}/`)
  : new URL('json/', root);
const output = process.argv[3] ?? new URL('src/generated.ts', root);
const files = (await readdir(input))
  .filter((file) => file.endsWith('.json'))
  .sort();
const blocks = [];
for (const file of files) {
  const schema = JSON.parse(await readFile(new URL(file, input), 'utf8'));
  // Separate namespaces prevent duplicate definitions across independent schemas.
  const name = file.replace('.json', '');
  const types = await compile(schema, name, {
    bannerComment: '',
    additionalProperties: false,
  });
  blocks.push(`export namespace ${name}Contract {\n${types}\n}`);
}
await writeFile(
  output,
  `/* Generated from Rust via schemars. Do not edit. */\n${blocks.join('\n')}`,
);
