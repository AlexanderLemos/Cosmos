// Preserve Cargo's exit status and expose a bounded failure excerpt in Actions annotations.
// This suite uses synthetic local fixtures, never credentials or real vaults.
import { spawn } from 'node:child_process';

const child = spawn('cargo', ['test', ...process.argv.slice(2)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let tail = '';
for (const [stream, output] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  stream.on('data', (chunk) => {
    output.write(chunk);
    tail = (tail + chunk.toString()).slice(-12000);
  });
}
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('close', (code) => {
  if (code !== 0) {
    const message = tail
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A');
    process.stdout.write(`::error title=Rust tests failed::${message}\n`);
  }
  process.exitCode = code ?? 1;
});
