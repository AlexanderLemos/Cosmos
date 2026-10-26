import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const zip = (entries: Record<string, Uint8Array>) => ({
  name: 'source.zip',
  mimeType: 'application/zip',
  buffer: Buffer.from(zipSync(entries)),
});
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function exported(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  return unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
}

test('resume after a partial ZIP import and reload keeps exact bytes and the active draft', async ({
  page,
}) => {
  const source = {
    'First.md': Buffer.from('\ufeff# Primeira\r\nLinha\n'),
    'Second.md': Buffer.from('# Segunda\n'),
    'asset.bin': Buffer.from([0, 255, 1, 2]),
    '.obsidian/app.json': Buffer.from('{ "x": true }\r\n'),
  };
  await open(page);
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (
      name,
      options,
    ) {
      if (name === 'Second.md' && options?.create)
        throw new DOMException('Injected interruption', 'QuotaExceededError');
      return original.call(this, name, options);
    };
  });
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(page.getByRole('alert')).toContainText('Injected interruption');
  expect(await exported(page)).toEqual({
    'First.md': new Uint8Array(source['First.md']),
  });
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Retomar importação', exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(page.getByRole('alert')).toContainText('Já existe um arquivo');
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'First.md', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially('Rascunho local');
  await page
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(
    page.getByText(
      'Importação retomada: 3 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  await expect(editor).toContainText('Rascunho local');
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Rascunho local');
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(
    page.getByText(
      'Importação retomada: 0 arquivo(s) adicionado(s), 4 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  const archive = await exported(page);
  for (const [path, bytes] of Object.entries(source))
    expect(Buffer.from(archive[path] ?? [])).toEqual(bytes);
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
  await page.getByLabel('Idioma').selectOption('en');
  await expect(
    page.getByRole('checkbox', { name: 'Resume import', exact: true }),
  ).toBeChecked();
});

test('resume rejects changed, empty and incompatible destinations before writing and respects protected projects', async ({
  page,
}) => {
  const source = {
    'Keep.md': Buffer.from('original'),
    'Empty.md': Buffer.alloc(0),
    'Folder/Child.md': Buffer.from('child'),
    'Project/project.cosmos.json': Buffer.from('{"id":"example"}'),
    'Project/context.md': Buffer.from('memory'),
  };
  await open(page);
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  for (const [path, value] of [
    ['Keep.md', 'modified'],
    ['Empty.md', 'nonempty'],
    ['Folder', 'file'],
    ['Keep.md/child.md', 'child'],
  ]) {
    await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(
      zip({
        'MustNotExist.md': Buffer.from('new'),
        [path as string]: Buffer.from(value as string),
      }),
    );
    await expect(page.getByRole('alert')).toContainText(
      `caminho incompatível: ${path}`,
    );
    await expect(page.getByRole('alert')).toContainText(
      'O destino foi preservado',
    );
    const archive = await exported(page);
    expect(archive['MustNotExist.md']).toBeUndefined();
    for (const [name, bytes] of Object.entries(source))
      expect(Buffer.from(archive[name] ?? [])).toEqual(bytes);
  }
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip(source));
  await expect(
    page.getByText(
      'Importação retomada: 0 arquivo(s) adicionado(s), 5 idêntico(s) mantido(s).',
    ),
  ).toBeVisible();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(
    zip({
      'MustNotExist.md': Buffer.from('new'),
      'Project/new.md': Buffer.from('memory'),
    }),
  );
  await expect(page.getByRole('alert')).toContainText(
    'A memória de projetos é somente leitura na Web.',
  );
  const archive = await exported(page);
  expect(archive['MustNotExist.md']).toBeUndefined();
  expect(archive['Project/new.md']).toBeUndefined();
});

test('two tabs resuming the same import serialize writes and keep existing data', async ({
  page,
  context,
}) => {
  await open(page);
  await page
    .getByLabel('Importar ZIP', { exact: true })
    .setInputFiles(zip({ 'Keep.md': Buffer.from('keep') }));
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  const other = await context.newPage();
  await open(other);
  const source = zip({
    'Keep.md': Buffer.from('keep'),
    'New.md': Buffer.from('new'),
  });
  for (const tab of [page, other])
    await tab
      .getByRole('checkbox', { name: 'Retomar importação', exact: true })
      .check();
  await Promise.all(
    [page, other].map((tab) =>
      tab.getByLabel('Importar ZIP', { exact: true }).setInputFiles(source),
    ),
  );
  for (const tab of [page, other])
    await expect(tab.getByText(/Importação retomada:/)).toBeVisible();
  const reports = await Promise.all(
    [page, other].map((tab) =>
      tab.getByText(/Importação retomada:/).textContent(),
    ),
  );
  expect(reports.sort()).toEqual([
    'Importação retomada: 0 arquivo(s) adicionado(s), 2 idêntico(s) mantido(s).',
    'Importação retomada: 1 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
  ]);
  expect(await exported(page)).toEqual({
    'Keep.md': new Uint8Array(Buffer.from('keep')),
    'New.md': new Uint8Array(Buffer.from('new')),
  });
});

test('folder retries add missing files while preserving the selected source', async ({
  page,
}) => {
  const temp = await mkdtemp(join(tmpdir(), 'cosmos-resume-'));
  const folder = join(temp, 'Folder');
  const original = '\ufeff# Original\r\n';
  try {
    await mkdir(folder);
    await writeFile(join(folder, 'Note.md'), original);
    await writeFile(join(folder, 'New.md'), 'new');
    await open(page);
    await page
      .getByLabel('Importar ZIP', { exact: true })
      .setInputFiles(zip({ 'Folder/Note.md': Buffer.from(original) }));
    await expect(
      page.getByText('Importação concluída sem alterar os originais.'),
    ).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'Retomar importação', exact: true })
      .check();
    await page
      .getByLabel('Importar pasta', { exact: true })
      .setInputFiles(folder);
    await expect(
      page.getByText(
        'Importação retomada: 1 arquivo(s) adicionado(s), 1 idêntico(s) mantido(s).',
      ),
    ).toBeVisible();
    const archive = await exported(page);
    expect(Buffer.from(archive['Folder/Note.md'] ?? [])).toEqual(
      Buffer.from(original),
    );
    expect(Buffer.from(archive['Folder/New.md'] ?? []).toString()).toBe('new');
    expect(await readFile(join(folder, 'Note.md'), 'utf8')).toBe(original);
    expect(await readFile(join(folder, 'New.md'), 'utf8')).toBe('new');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('a destination appearing during source validation is preserved by the final create check', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('checkbox', { name: 'Retomar importação', exact: true })
    .check();
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this);
      if (this.name === 'Later.md') {
        const root = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('cosmos-vault');
        const target = await root.getFileHandle('First.md', { create: true });
        const writer = await target.createWritable();
        await writer.write('External version');
        await writer.close();
      }
      return bytes;
    };
  });
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles(
    zip({
      'First.md': Buffer.from('Incoming version'),
      'Later.md': Buffer.from('later'),
    }),
  );
  await expect(page.getByRole('alert')).toContainText(
    'caminho incompatível: First.md',
  );
  expect(await exported(page)).toEqual({
    'First.md': new Uint8Array(Buffer.from('External version')),
  });
});
