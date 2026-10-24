import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
  /^host: (.+)$/m,
)?.[1];
if (!triple) throw new Error('Cannot determine Rust host');
execFileSync('cargo', ['build', '-p', 'cosmos-daemon', '--locked'], {
  cwd: root,
  stdio: 'inherit',
});
const ext = process.platform === 'win32' ? '.exe' : '';
const bins = new URL('apps/desktop/src-tauri/binaries/', root);
mkdirSync(bins, { recursive: true });
copyFileSync(
  new URL(`target/debug/cosmosd${ext}`, root),
  new URL(`cosmosd-${triple}${ext}`, bins),
);
