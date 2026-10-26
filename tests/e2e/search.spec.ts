import { expect, type Page } from '@playwright/test';
import { test } from './storage-fixture';

type Changes = { indexed: number; removed: number };
async function prepare(page: Page) {
  // Observe real worker commits without adding test endpoints to the application.
  await page.addInitScript(() => {
    const commits: { indexed: number; removed: number }[] = [];
    Reflect.set(window, 'searchCommits', commits);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (typeof event.data.indexed === 'number')
            commits.push({
              indexed: event.data.indexed,
              removed: event.data.removed,
            });
        });
      }
    };
    // A second real OPFS directory acts as a user-selected folder in all engines.
    Reflect.set(window, 'showDirectoryPicker', async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(
        'second-vault',
        { create: true },
      ),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}

async function changeFiles(
  page: Page,
  files: Record<string, string | number[] | null>,
  vault = 'cosmos-vault',
) {
  await page.evaluate(
    async ({ files, vault }) => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle(vault, { create: true });
      for (const [path, content] of Object.entries(files)) {
        if (content === null) await root.removeEntry(path);
        else {
          const writer = await (
            await root.getFileHandle(path, { create: true })
          ).createWritable();
          await writer.write(
            typeof content === 'string' ? content : new Uint8Array(content),
          );
          await writer.close();
        }
      }
    },
    { files, vault },
  );
}

async function search(
  page: Page,
  query: string,
  results: string[],
  changes: Changes,
) {
  const count = await page.evaluate(
    () => (Reflect.get(window, 'searchCommits') as Changes[]).length,
  );
  await page.getByLabel('Buscar', { exact: true }).fill(query);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  // Initial SQLite-WASM startup can exceed the default assertion timeout on CI.
  // Check the finished operation first; errors must fail rather than look like
  // a missing worker commit or an unchanged list of paths.
  await expect(
    page.getByRole('button', { name: 'Buscar', exact: true }),
  ).toBeEnabled({ timeout: 35_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (Reflect.get(window, 'searchCommits') as Changes[]).length,
      ),
    )
    .toBe(count + 1);
  await expect(
    page.getByRole('navigation', { name: 'Notas' }).getByRole('button'),
  ).toHaveText(results);
  expect(
    await page.evaluate(() =>
      (Reflect.get(window, 'searchCommits') as Changes[]).at(-1),
    ),
  ).toEqual(changes);
}

test('search reuses unchanged revisions, applies external edits and removals, and survives reload', async ({
  page,
}) => {
  await prepare(page);
  await changeFiles(page, {
    'a.md': '\ufeffÓrbita antiga\r\n',
    'b.md': 'Órbita estável',
  });
  await page.getByRole('button', { name: 'Atualizar lista' }).click();
  await search(page, 'orbita', ['a.md', 'b.md'], { indexed: 2, removed: 0 });
  await search(page, 'estavel', ['b.md'], { indexed: 0, removed: 0 });
  await search(page, 'orbita', ['a.md', 'b.md'], { indexed: 0, removed: 0 });
  // Rename a file and change another, independently of the app's write commands.
  await changeFiles(page, {
    'a.md': '\ufeffÓrbita recente\r\n',
    'c.md': 'Órbita estável',
    'b.md': null,
  });
  await search(page, 'orbita', ['a.md', 'c.md'], { indexed: 2, removed: 1 });
  await search(page, 'antiga', [], { indexed: 0, removed: 0 });
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await search(page, 'recente', ['a.md'], { indexed: 0, removed: 0 });
  await changeFiles(page, { 'a.md': null, 'c.md': null });
  await search(page, 'orbita', [], { indexed: 0, removed: 2 });
});

test('shared index never leaks results across vaults and a failed read does not publish partial changes', async ({
  page,
}) => {
  await prepare(page);
  await changeFiles(page, { 'a.md': 'primeiro' });
  await changeFiles(
    page,
    { 'a.md': 'segundo', 'other.md': 'segundo' },
    'second-vault',
  );
  await search(page, 'primeiro', ['a.md'], { indexed: 1, removed: 0 });
  await page.getByRole('button', { name: 'Fechar cofre' }).click();
  await page.getByRole('button', { name: 'Abrir pasta do computador' }).click();
  await search(page, 'segundo', ['a.md', 'other.md'], {
    indexed: 2,
    removed: 0,
  });
  await search(page, 'primeiro', [], { indexed: 0, removed: 0 });
  await page.getByRole('button', { name: 'Fechar cofre' }).click();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await search(page, 'segundo', [], { indexed: 1, removed: 1 });
  const count = await page.evaluate(
    () => (Reflect.get(window, 'searchCommits') as Changes[]).length,
  );
  await changeFiles(page, { 'a.md': 'nova versão', 'z.md': [255] });
  await page.getByLabel('Buscar', { exact: true }).fill('nova');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível concluir.',
  );
  expect(
    await page.evaluate(
      () => (Reflect.get(window, 'searchCommits') as Changes[]).length,
    ),
  ).toBe(count);
  await changeFiles(page, { 'a.md': 'primeiro', 'z.md': null });
  await search(page, 'primeiro', ['a.md'], { indexed: 0, removed: 0 });
});
