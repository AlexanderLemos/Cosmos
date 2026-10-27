import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const source = {
  'First.md': Buffer.from('\ufeff# Private note content\r\n'),
  'Stop.md': Buffer.from('# Second\n'),
  'asset.bin': Buffer.from([0, 255, 42]),
};
const zip = (entries: Record<string, Uint8Array> = source) => ({
  name: 'source.zip',
  mimeType: 'application/zip',
  buffer: Buffer.from(zipSync(entries)),
});
const recovery = (page: Page) =>
  page.getByRole('region', { name: 'Importações pendentes' });
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function stopAtSecond(page: Page) {
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (
      name,
      options,
    ) {
      if (name === 'Stop.md' && options?.create)
        throw new DOMException('Test interruption', 'QuotaExceededError');
      return original.call(this, name, options);
    };
  });
}
async function report(page: Page) {
  const downloading = page.waitForEvent('download');
  await recovery(page)
    .getByRole('button', { name: 'Baixar relatório da importação' })
    .first()
    .click();
  return JSON.parse(
    await readFile((await (await downloading).path()) as string, 'utf8'),
  );
}
async function exported(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  return unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
}

test('pending imports survive reload, report conservative progress without note content and clear after exact-source resume', async ({
  page,
}) => {
  await open(page);
  await stopAtSecond(page);
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(page.getByRole('alert')).toContainText('Test interruption');
  await expect(recovery(page)).toContainText(
    'Confirmados: 1 · Idênticos mantidos: 0 · Sem confirmação: 2',
  );
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  const initial = await report(page);
  expect(
    initial.entries.map(({ path, state }: { path: string; state: string }) => [
      path,
      state,
    ]),
  ).toEqual([
    ['First.md', 'written'],
    ['Stop.md', 'writing'],
    ['asset.bin', 'pending'],
  ]);
  expect(JSON.stringify(initial)).not.toContain('Private note content');
  for (const entry of initial.entries)
    expect(entry.rev).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(Object.keys(await exported(page))).toEqual(['First.md']);
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  expect((await report(page)).header).toEqual(initial.header);
  for (const theme of ['nyx', 'hemera']) {
    await page.getByLabel('Tema').selectOption(theme);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  // ZIP order is irrelevant; identity includes every source path and exact bytes.
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(
      zip(
        Object.fromEntries(Object.entries(source).reverse()) as typeof source,
      ),
    );
  await expect(
    page.getByText(
      'Importação retomada: 2 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
  const files = await exported(page);
  for (const [path, bytes] of Object.entries(source))
    expect(Buffer.from(files[path] ?? [])).toEqual(bytes);
});

test('closing the importing tab leaves the last unconfirmed write visible to another tab', async ({
  page,
  context,
}) => {
  await open(page);
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (
      name,
      options,
    ) {
      if (name === 'Stop.md' && options?.create) {
        Reflect.set(window, 'importPaused', true);
        await new Promise(() => {});
      }
      return original.call(this, name, options);
    };
  });
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'importPaused')))
    .toBe(true);
  const other = await context.newPage();
  await open(other);
  await page.close();
  await expect(recovery(other)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  expect((await report(other)).header.imported).toBe(1);
  await other
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  await other.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(recovery(other)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
  expect(Object.keys(await exported(other))).toHaveLength(3);
});

test('unavailable progress storage prevents any new vault writes', async ({
  page,
}) => {
  await open(page);
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
  await page.evaluate(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, version) {
      if (name === 'cosmos-imports')
        throw new DOMException('Denied journal', 'SecurityError');
      return original.call(this, name, version);
    };
  });
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível acessar ou atualizar os registros',
  );
  expect(await exported(page)).toEqual({});
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
});

test('a completed write without a committed confirmation remains uncertain and can be verified on retry', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.transaction.db.name === 'cosmos-imports' &&
        this.name === 'entries' &&
        value.state === 'written'
      )
        throw new DOMException('Full journal', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível acessar ou atualizar os registros',
  );
  await expect(recovery(page)).toContainText(
    'Confirmados: 0 · Idênticos mantidos: 0 · Sem confirmação: 3',
  );
  const pending = await report(page);
  expect(pending.entries[0].state).toBe('writing');
  expect(Buffer.from((await exported(page))['First.md'] ?? [])).toEqual(
    source['First.md'],
  );
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(
    page.getByText(
      'Importação retomada: 2 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
});

test('forgetting a progress record requires confirmation and preserves vault bytes', async ({
  page,
}) => {
  await open(page);
  await stopAtSecond(page);
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  page.once('dialog', (dialog) => dialog.dismiss());
  await recovery(page)
    .getByRole('button', { name: 'Esquecer registro' })
    .click();
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await recovery(page)
    .getByRole('button', { name: 'Esquecer registro' })
    .click();
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
  expect(await exported(page)).toEqual({
    'First.md': new Uint8Array(source['First.md']),
  });
  await page.getByLabel('Idioma').selectOption('en');
  await expect(
    page.getByRole('region', { name: 'Pending imports' }),
  ).toContainText('No pending import recorded.');
});

test('same-name folders isolate import histories and a different source cannot clear an older attempt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle(
        Reflect.get(window, 'selectedFolder') ?? 'A',
        { create: true },
      );
      return parent.getDirectoryHandle('Vault', { create: true });
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir pasta do computador' }).click();
  await stopAtSecond(page);
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  const initial = await report(page);
  await page.getByRole('button', { name: 'Fechar cofre' }).click();
  await page.evaluate(() => Reflect.set(window, 'selectedFolder', 'B'));
  await page.getByRole('button', { name: 'Abrir pasta do computador' }).click();
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Abrir pasta do computador' }).click();
  expect((await report(page)).header.id).toBe(initial.header.id);
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'other.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({ 'Other.md': Buffer.from('different source') }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  expect((await report(page)).header.id).toBe(initial.header.id);
});

test('a completed retry in another tab invalidates stale progress reports without touching vault files', async ({
  page,
  context,
}) => {
  await open(page);
  await stopAtSecond(page);
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  const other = await context.newPage();
  await open(other);
  await other
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  await other.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(
    other.getByText(
      'Importação retomada: 2 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  await recovery(page)
    .getByRole('button', { name: 'Baixar relatório da importação' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'O registro da importação mudou ou já foi concluído.',
  );
  await expect(recovery(page)).toContainText(
    'Nenhuma importação pendente registrada.',
  );
  const files = await exported(page);
  for (const [path, bytes] of Object.entries(source))
    expect(Buffer.from(files[path] ?? [])).toEqual(bytes);
});

test('the pending-record bound stops new writes and forgetting metadata frees capacity without deleting files', async ({
  page,
}) => {
  await open(page);
  await stopAtSecond(page);
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(zip());
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cosmos-imports', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['operations', 'entries'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        const operations = tx.objectStore('operations');
        const request = operations.getAll();
        request.onsuccess = () => {
          const original = request.result[0];
          const entries = tx.objectStore('entries');
          const all = entries.index('operation').getAll(original.id);
          all.onsuccess = () => {
            for (let i = 1; i < 20; i++) {
              const id = crypto.randomUUID();
              operations.add({ ...original, id, version: crypto.randomUUID() });
              for (const entry of all.result)
                entries.add({ ...entry, operation: id });
            }
          };
        };
      });
    } finally {
      db.close();
    }
  });
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip({ 'New.md': Buffer.from('new') }));
  await expect(page.getByRole('alert')).toContainText(
    'Há 20 registros pendentes neste cofre.',
  );
  expect(await exported(page)).toEqual({
    'First.md': new Uint8Array(source['First.md']),
  });
  await expect(recovery(page).locator('article')).toHaveCount(20);
  page.once('dialog', (dialog) => dialog.accept());
  await recovery(page)
    .getByRole('button', { name: 'Esquecer registro' })
    .first()
    .click();
  await expect(recovery(page).locator('article')).toHaveCount(19);
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip({ 'New.md': Buffer.from('new') }));
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  const files = await exported(page);
  expect(Buffer.from(files['New.md'] ?? []).toString()).toBe('new');
  expect(Buffer.from(files['First.md'] ?? [])).toEqual(source['First.md']);
});
