import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporary = mkdtempSync(join(tmpdir(), 'cosmos-contracts-'));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0)
    throw new Error(
      `${command} exited ${result.status}: ${result.error ?? ''}`,
    );
}
try {
  run('cargo', [
    'run',
    '-p',
    'cosmos-core',
    '--example',
    'export_schemas',
    '--locked',
    '--',
    temporary,
  ]);
  const generated = join(temporary, 'generated.ts');
  run(process.execPath, ['scripts/generate-types.mjs', temporary, generated]);
  const saved = readdirSync('packages/schemas/json').sort();
  const actual = readdirSync(temporary)
    .filter((file) => file.endsWith('.json'))
    .sort();
  if (JSON.stringify(saved) !== JSON.stringify(actual))
    throw new Error('Contract file list drift');
  const pairs = saved.map((file) => [
    `packages/schemas/json/${file}`,
    join(temporary, file),
  ]);
  pairs.push(['packages/schemas/src/generated.ts', generated]);
  for (const [expected, fresh] of pairs) {
    if (readFileSync(expected, 'utf8') !== readFileSync(fresh, 'utf8')) {
      throw new Error(
        `Contract drift: ${expected}. Run pnpm schemas:generate and review the diff.`,
      );
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
