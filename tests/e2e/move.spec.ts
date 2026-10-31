import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const original = '\ufeff# Órbita\r\nLinha\n![imagem](asset.png)\r\n';
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function seed(page: Page) {
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'move.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'a.md': Buffer.from(original),
        'existing.md': Buffer.from('existing'),
        'links.md': Buffer.from('[[a]]'),
        'asset.png': Buffer.from([137, 80, 78, 71]),
        'Project/project.cosmos.json': Buffer.from('{}'),
        'Project/context.md': Buffer.from('protected'),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
}
const notes = (page: Page) => page.getByRole('navigation', { name: 'Notas' });
async function select(page: Page, path = 'a.md') {
  await notes(page).getByRole('button', { name: path, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: path.split('/').at(-1), exact: true }),
  ).toBeVisible();
  await expect(
    notes(page).getByRole('button', { name: path, exact: true }),
  ).toBeEnabled();
}
async function moveTo(page: Page, path: string) {
  await page.getByLabel('Caminho de destino', { exact: true }).fill(path);
  await page
    .getByRole('button', { name: 'Confirmar mudança', exact: true })
    .click();
}
async function exported(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  return unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
}
function checkBackup(files: Record<string, Uint8Array>, target: string) {
  const backups = Object.keys(files).filter((path) =>
    /^\.cosmos\/moves\/[^/]+\/note.md$/.test(path),
  );
  expect(backups).toHaveLength(1);
  const backup = backups[0] as string;
  expect(Buffer.from(files[backup] ?? [])).toEqual(Buffer.from(original));
  expect(
    JSON.parse(
      Buffer.from(
        files[backup.replace('note.md', 'operation.json')] ?? [],
      ).toString(),
    ),
  ).toMatchObject({
    format: 1,
    from: 'a.md',
    to: target,
    backup: 'note.md',
    rev: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  });
}

test('move and rename preserve bytes, attachments and recovery copies with protected destinations and drafts', async ({
  page,
}) => {
  await open(page);
  await seed(page);
  await select(page, 'Project/context.md');
  await expect(
    page.getByRole('button', { name: 'Mover nota', exact: true }),
  ).toBeDisabled();
  await select(page);
  await page.locator('.cm-content').press('ControlOrMeta+End');
  await page.locator('.cm-content').pressSequentially('draft');
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mover nota', exact: true }),
  ).toBeDisabled();
  await page.locator('.cm-content').press('ControlOrMeta+z');
  await page.getByRole('button', { name: 'Mover nota', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page.getByLabel('Caminho de destino', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Mover nota', exact: true }).click();
  for (const target of [
    'a.md',
    'existing.md',
    'EXISTING.MD',
    'project/new.md',
    'existing.md/child.md',
  ]) {
    await moveTo(page, target);
    await expect(page.getByRole('alert')).toContainText('Já existe');
  }
  await moveTo(page, 'Project/new.md');
  await expect(page.getByRole('alert')).toContainText('somente leitura na Web');
  for (const target of ['../escape.md', '.COSMOS/new.md', 'image.png']) {
    await moveTo(page, target);
    await expect(page.getByRole('alert')).toContainText(
      'Use um caminho .md válido',
    );
  }
  // Validation failures do not create backups or destinations.
  expect(
    Object.keys(await exported(page)).some((path) =>
      path.startsWith('.cosmos/'),
    ),
  ).toBe(false);
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
    page.getByRole('button', { name: 'Confirm move', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Language').selectOption('pt-BR');
  await moveTo(page, 'Universos/Órbita/renamed.md');
  await expect(page.getByText('Nota movida.', { exact: true })).toBeVisible();
  await expect(
    notes(page).getByRole('button', { name: 'a.md', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'renamed.md', exact: true }),
  ).toBeVisible();
  const files = await exported(page);
  expect(files['a.md']).toBeUndefined();
  expect(Buffer.from(files['Universos/Órbita/renamed.md'] ?? [])).toEqual(
    Buffer.from(original),
  );
  expect(Buffer.from(files['links.md'] ?? []).toString()).toBe('[[a]]');
  expect(files['asset.png']).toEqual(new Uint8Array([137, 80, 78, 71]));
  checkBackup(files, 'Universos/Órbita/renamed.md');
  await page
    .getByRole('textbox', { name: 'Buscar', exact: true })
    .fill('Órbita');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(notes(page).getByRole('button')).toHaveText([
    'Universos/Órbita/renamed.md',
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await select(page, 'Universos/Órbita/renamed.md');
  await page.getByRole('button', { name: 'Mover nota', exact: true }).click();
  await moveTo(page, 'renamed-again.md');
  await expect(page.getByText('Nota movida.', { exact: true })).toBeVisible();
  expect(Buffer.from((await exported(page))['renamed-again.md'] ?? [])).toEqual(
    Buffer.from(original),
  );
});

test('two tabs serialize moves and a stale writer retains its draft without recreating the source', async ({
  page,
  context,
}) => {
  await open(page);
  await seed(page);
  await select(page);
  const second = await context.newPage();
  await open(second);
  await select(second);
  for (const tab of [page, second]) {
    await tab.getByRole('button', { name: 'Mover nota', exact: true }).click();
    await tab
      .getByLabel('Caminho de destino', { exact: true })
      .fill('moved.md');
  }
  await Promise.all(
    [page, second].map((tab) =>
      tab
        .getByRole('button', { name: 'Confirmar mudança', exact: true })
        .click(),
    ),
  );
  for (const tab of [page, second])
    await expect(
      tab.getByRole('button', { name: 'Salvar', exact: true }),
    ).toBeDisabled();
  await expect
    .poll(
      async () =>
        (await page.getByText('Nota movida.', { exact: true }).count()) +
        (await second.getByText('Nota movida.', { exact: true }).count()),
    )
    .toBe(1);
  const loser = (await page.getByText('Nota movida.', { exact: true }).count())
    ? second
    : page;
  await expect(loser.getByRole('alert')).toContainText('O arquivo mudou');
  await loser.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await loser.locator('.cm-content').fill('draft after move');
  await expect(
    loser.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
  await loser.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(loser.getByRole('alert')).toContainText('O arquivo mudou');
  await expect(loser.locator('.cm-content')).toHaveText('draft after move');
  const files = await exported(loser);
  expect(files['a.md']).toBeUndefined();
  checkBackup(files, 'moved.md');
  await loser
    .getByRole('button', { name: 'Salvar cópia como…', exact: true })
    .click();
  await loser
    .getByLabel('Caminho de destino', { exact: true })
    .fill('rescued.md');
  await loser.getByRole('button', { name: 'Criar cópia', exact: true }).click();
  await expect(
    loser.getByText('Cópia salva em rescued.md. A nota em edição foi mantida.'),
  ).toBeVisible();
});

for (const stage of [
  'backup',
  'destination',
  'verification',
  'source-change',
  'delete',
]) {
  test(`interrupted move preserves recoverable bytes at ${stage}`, async ({
    page,
  }) => {
    await open(page);
    await seed(page);
    await select(page);
    await page.evaluate((stage) => {
      const get = FileSystemDirectoryHandle.prototype.getFileHandle;
      FileSystemDirectoryHandle.prototype.getFileHandle = async function (
        name,
        options,
      ) {
        if (
          options?.create &&
          ((stage === 'backup' && name === 'note.md') ||
            (stage === 'destination' && name === 'moved.md'))
        )
          throw new DOMException(
            'Injected quota failure',
            'QuotaExceededError',
          );
        if (
          !options?.create &&
          name === 'moved.md' &&
          ['verification', 'source-change'].includes(stage) &&
          !Reflect.get(window, 'moveFaultApplied')
        ) {
          Reflect.set(window, 'moveFaultApplied', true);
          const target = stage === 'source-change' ? 'a.md' : 'moved.md';
          const writer = await (await get.call(this, target)).createWritable();
          await writer.write('concurrent change');
          await writer.close();
        }
        return get.call(this, name, options);
      };
      if (stage === 'delete') {
        const remove = FileSystemDirectoryHandle.prototype.removeEntry;
        FileSystemDirectoryHandle.prototype.removeEntry = async function (
          name,
          options,
        ) {
          if (name === 'a.md')
            throw new DOMException(
              'Injected deletion failure',
              'NotAllowedError',
            );
          return remove.call(this, name, options);
        };
      }
    }, stage);
    await page.getByRole('button', { name: 'Mover nota', exact: true }).click();
    await moveTo(page, 'moved.md');
    await expect(page.getByRole('alert')).toContainText(
      stage === 'backup'
        ? 'Injected quota failure'
        : 'Uma cópia verificada foi preservada',
    );
    await expect(
      page.getByRole('heading', { name: 'a.md', exact: true }),
    ).toBeVisible();
    const files = await exported(page);
    expect(Buffer.from(files['a.md'] ?? [])).toEqual(
      Buffer.from(stage === 'source-change' ? 'concurrent change' : original),
    );
    if (stage !== 'backup') checkBackup(files, 'moved.md');
    if (['backup', 'destination'].includes(stage))
      expect(files['moved.md']).toBeUndefined();
    else
      expect(Buffer.from(files['moved.md'] ?? [])).toEqual(
        Buffer.from(stage === 'verification' ? 'concurrent change' : original),
      );
    await page.reload();
    await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
    expect(await exported(page)).toEqual(files);
  });
}

test('closing the moving tab before deletion keeps both copies and its recovery record', async ({
  page,
  context,
}) => {
  await open(page);
  await seed(page);
  await select(page);
  await page.evaluate(() => {
    const remove = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = async function (
      name,
      options,
    ) {
      if (name === 'a.md') {
        Reflect.set(window, 'movePaused', true);
        await new Promise(() => {});
      }
      return remove.call(this, name, options);
    };
  });
  await page.getByRole('button', { name: 'Mover nota', exact: true }).click();
  await moveTo(page, 'moved.md');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'movePaused')))
    .toBe(true);
  const other = await context.newPage();
  await page.close();
  await open(other);
  const files = await exported(other);
  expect(files['a.md']).toEqual(files['moved.md']);
  checkBackup(files, 'moved.md');
});
