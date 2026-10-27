import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const zip = (entries: Record<string, Uint8Array>) => ({
  name: 'source.zip',
  mimeType: 'application/zip',
  buffer: Buffer.from(zipSync(entries)),
});
const recovery = (page: Page) =>
  page.getByRole('region', { name: 'Importações pendentes', exact: true });
const inspection = (page: Page) =>
  page.getByRole('region', { name: 'Conferência dos arquivos', exact: true });
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function interrupted(page: Page, entries: Record<string, Uint8Array>) {
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
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(entries));
  await expect(page.getByRole('alert')).toContainText('Test interruption');
  await expect(recovery(page)).toContainText(
    'Última tentativa sem confirmação: Stop.md',
  );
}
async function jsonDownload(page: Page, name: string) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
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

test('checking import files distinguishes current bytes from recorded progress and never changes the vault or journal', async ({
  page,
}) => {
  const entries = {
    'First.md': Buffer.from('\ufeff# Secret original content\r\n'),
    'Changed.md': Buffer.from('aaaa'),
    'Removed.md': Buffer.from('remove'),
    'Clash.bin': Buffer.from('file'),
    'Unreadable.md': Buffer.from('permission'),
    'Size.bin': Buffer.from('x'),
    'Stop.md': Buffer.from('stopped'),
    'Future.bin': Buffer.from([0, 255, 42]),
  };
  await open(page);
  await interrupted(page, entries);
  const originalReport = await jsonDownload(
    page,
    'Baixar relatório da importação',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'First.md', exact: true })
    .click();
  await page
    .locator('.cm-content')
    .fill('Rascunho preservado durante a conferência');

  await page.evaluate(async () => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('cosmos-vault');
    for (const [path, content] of [
      ['Changed.md', 'bbbb'],
      ['Size.bin', 'longer replacement'],
    ]) {
      const file = await root.getFileHandle(path as string);
      const writer = await file.createWritable();
      await writer.write(content as string);
      await writer.close();
    }
    // A write may have completed without its journal confirmation.
    const stopped = await root.getFileHandle('Stop.md', { create: true });
    const stoppedWriter = await stopped.createWritable();
    await stoppedWriter.write('stopped');
    await stoppedWriter.close();
    await root.removeEntry('Removed.md');
    await root.removeEntry('Clash.bin');
    await root.getDirectoryHandle('Clash.bin', { create: true });
    const read = File.prototype.arrayBuffer;
    Reflect.set(window, 'originalRead', read);
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'Unreadable.md' || this.name === 'Size.bin')
        throw new DOMException('Cannot read', 'NotReadableError');
      return read.call(this);
    };
    const write = FileSystemFileHandle.prototype.createWritable;
    Reflect.set(window, 'inspectionWrites', 0);
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      Reflect.set(
        window,
        'inspectionWrites',
        Reflect.get(window, 'inspectionWrites') + 1,
      );
      return write.apply(this, args);
    };
  });
  await recovery(page)
    .getByRole('button', { name: 'Conferir arquivos' })
    .click();
  const table = inspection(page).getByRole('table', {
    name: 'Arquivos conferidos',
  });
  for (const [path, state] of [
    ['First.md', 'Idêntico à origem'],
    ['Changed.md', 'Diferente da origem'],
    ['Removed.md', 'Ausente'],
    ['Clash.bin', 'Caminho incompatível'],
    ['Unreadable.md', 'Não foi possível ler'],
    ['Size.bin', 'Diferente da origem'],
    ['Stop.md', 'Idêntico à origem'],
    ['Future.bin', 'Ausente'],
  ]) {
    await expect(
      table
        .locator('tbody tr')
        .filter({ hasText: path as string })
        .getByRole('cell')
        .last(),
    ).toHaveText(state as string);
  }
  await expect(
    table
      .locator('tbody tr')
      .filter({ hasText: 'Stop.md' })
      .getByRole('cell')
      .first(),
  ).toHaveText('Sem confirmação');
  await expect(page.locator('.cm-content')).toContainText(
    'Rascunho preservado durante a conferência',
  );
  const checked = await jsonDownload(page, 'Baixar conferência');
  expect(checked.header).toEqual(originalReport.header);
  expect(checked.checkedAt).toBeGreaterThanOrEqual(checked.startedAt);
  expect(JSON.stringify(checked)).not.toContain('Secret original content');
  expect(
    checked.entries.find(
      (entry: { path: string }) => entry.path === 'Changed.md',
    ).current.rev,
  ).not.toBe(
    checked.entries.find(
      (entry: { path: string }) => entry.path === 'Changed.md',
    ).rev,
  );
  expect(
    checked.entries.find((entry: { path: string }) => entry.path === 'Size.bin')
      .current,
  ).toEqual({ state: 'different', size: 18 });
  expect(
    await page.evaluate(() => Reflect.get(window, 'inspectionWrites')),
  ).toBe(0);
  expect(await jsonDownload(page, 'Baixar relatório da importação')).toEqual(
    originalReport,
  );
  await page.evaluate(async () => {
    File.prototype.arrayBuffer = Reflect.get(window, 'originalRead');
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('cosmos-vault');
    const writer = await (
      await root.getFileHandle('First.md')
    ).createWritable();
    await writer.write('user edit after inspection');
    await writer.close();
  });
  // Downloading retains the labelled snapshot until the user explicitly checks again.
  expect(await jsonDownload(page, 'Baixar conferência')).toEqual(checked);
  await recovery(page)
    .getByRole('button', { name: 'Conferir arquivos' })
    .click();
  await expect(
    table
      .locator('tbody tr')
      .filter({ hasText: 'First.md' })
      .getByRole('cell')
      .last(),
  ).toHaveText('Diferente da origem');
  const files = await exported(page);
  expect(Buffer.from(files['First.md'] ?? []).toString()).toBe(
    'user edit after inspection',
  );
  expect(Buffer.from(files['Changed.md'] ?? []).toString()).toBe('bbbb');
  expect(files['Removed.md']).toBeUndefined();
  expect(Buffer.from(files['Stop.md'] ?? [])).toEqual(entries['Stop.md']);
  await expect(page.locator('.cm-content')).toContainText(
    'Rascunho preservado durante a conferência',
  );
  expect(files['Future.bin']).toBeUndefined();
  expect(Buffer.from(files['Unreadable.md'] ?? [])).toEqual(
    entries['Unreadable.md'],
  );
  expect(await jsonDownload(page, 'Baixar relatório da importação')).toEqual(
    originalReport,
  );
});

test('file checks paginate and filter large records accessibly in both themes and languages', async ({
  page,
}) => {
  await open(page);
  const entries: Record<string, Uint8Array> = {
    'Stop.md': Buffer.from('stop'),
  };
  for (let i = 0; i < 55; i++)
    entries[`Item${String(i).padStart(2, '0')}.md`] = Buffer.from(`item ${i}`);
  await interrupted(page, entries);
  await recovery(page)
    .getByRole('button', { name: 'Conferir arquivos' })
    .click();
  const table = inspection(page).getByRole('table', {
    name: 'Arquivos conferidos',
  });
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(inspection(page).getByRole('status')).toHaveText(
    'Arquivos 1–50 de 56',
  );
  const scroll = inspection(page).getByRole('region', {
    name: 'Arquivos conferidos',
  });
  await scroll.focus();
  await expect(scroll).toBeFocused();
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
  await inspection(page)
    .getByRole('button', { name: 'Próxima página' })
    .click();
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(inspection(page).getByRole('status')).toHaveText(
    'Arquivos 51–56 de 56',
  );
  await inspection(page)
    .getByRole('combobox', { name: 'Mostrar arquivos' })
    .selectOption('matching');
  await expect(table.locator('tbody tr')).toHaveCount(0);
  await expect(inspection(page).getByRole('status')).toHaveText(
    'Arquivos 0–0 de 0',
  );
  await expect(
    inspection(page).getByRole('button', { name: 'Página anterior' }),
  ).toBeDisabled();
  await expect(
    inspection(page).getByRole('button', { name: 'Próxima página' }),
  ).toBeDisabled();
  await page.getByLabel('Idioma').selectOption('en');
  const english = page.getByRole('region', { name: 'File check', exact: true });
  await english
    .getByRole('combobox', { name: 'Show files' })
    .selectOption('missing');
  await expect(english.getByRole('status')).toHaveText('Files 1–50 of 56');
  const all = await jsonDownload(page, 'Download file check');
  expect(all.entries).toHaveLength(56);
});

test('inconsistent record paths, hashes and counts are rejected before any recorded file is read', async ({
  page,
}) => {
  await open(page);
  await interrupted(page, {
    'First.md': Buffer.from('first'),
    'Stop.md': Buffer.from('stop'),
  });
  const initial = await jsonDownload(page, 'Baixar relatório da importação');
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    Reflect.set(window, 'inspectionReads', 0);
    File.prototype.arrayBuffer = async function () {
      Reflect.set(
        window,
        'inspectionReads',
        Reflect.get(window, 'inspectionReads') + 1,
      );
      return read.call(this);
    };
  });
  let previous = 'First.md';
  for (const change of [
    { path: '../outside.md' },
    { rev: `sha256:${'0'.repeat(64)}` },
    { state: 'kept' },
  ]) {
    await page.evaluate(
      async ({ id, previous, change, original }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('cosmos-imports', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('entries', 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
            const store = tx.objectStore('entries');
            store.delete([id, previous]);
            store.add({ ...original, ...change, operation: id });
          });
        } finally {
          db.close();
        }
      },
      {
        id: initial.header.id,
        previous,
        change,
        original: initial.entries.find(
          (entry: { path: string }) => entry.path === 'First.md',
        ),
      },
    );
    previous = 'path' in change ? change.path : 'First.md';
    await recovery(page)
      .getByRole('button', { name: 'Conferir arquivos' })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'O registro contém dados inconsistentes.',
    );
    await expect(inspection(page)).toHaveCount(0);
    expect(
      await page.evaluate(() => Reflect.get(window, 'inspectionReads')),
    ).toBe(0);
  }
});

test('a stale check cannot reuse a record completed by another tab', async ({
  page,
  context,
}) => {
  const source = {
    'First.md': Buffer.from('first'),
    'Stop.md': Buffer.from('stop'),
  };
  await open(page);
  await interrupted(page, source);
  await recovery(page)
    .getByRole('button', { name: 'Conferir arquivos' })
    .click();
  await expect(inspection(page)).toBeVisible();
  const other = await context.newPage();
  await open(other);
  await other
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  await other
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(
    other.getByText(
      'Importação retomada: 1 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  await recovery(page)
    .getByRole('button', { name: 'Conferir arquivos' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'O registro da importação mudou ou já foi concluído.',
  );
  await expect(inspection(page)).toHaveCount(0);
  expect(await exported(page)).toEqual({
    'First.md': new Uint8Array(source['First.md']),
    'Stop.md': new Uint8Array(source['Stop.md']),
  });
});
