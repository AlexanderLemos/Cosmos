import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const original = '\ufeff# Lixeira\r\nLinha\n';
const trash = (page: Page) =>
  page.getByRole('region', { name: 'Lixeira', exact: true });
const notes = (page: Page) => page.getByRole('navigation', { name: 'Notas' });
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function seed(page: Page) {
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'trash.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'a.md': Buffer.from(original),
        'other.md': Buffer.from('Other'),
        'Project/project.cosmos.json': Buffer.from('{}'),
        'Project/context.md': Buffer.from('protected'),
        '.cosmos/trash/legacy/old.md': Buffer.from('legacy bytes'),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
}
async function select(page: Page, path = 'a.md') {
  await notes(page).getByRole('button', { name: path, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: path.split('/').at(-1), exact: true }),
  ).toBeVisible();
  await expect(
    notes(page).getByRole('button', { name: path, exact: true }),
  ).toBeEnabled();
}
async function send(page: Page) {
  await page
    .getByRole('button', { name: 'Enviar à lixeira', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirmar envio à lixeira', exact: true })
    .click();
}
async function inspect(page: Page) {
  await trash(page)
    .getByRole('button', { name: 'Revisar lixeira', exact: true })
    .click();
  await trash(page)
    .getByRole('button', { name: 'Conferir item da lixeira', exact: true })
    .click();
  await expect(
    trash(page).getByText('Conferido em', { exact: false }),
  ).toBeVisible();
}
async function restore(page: Page, path: string) {
  await trash(page)
    .getByLabel('Restaurar cópia para', { exact: true })
    .fill(path);
  await trash(page)
    .getByRole('button', { name: 'Restaurar cópia', exact: true })
    .click();
}
async function exported(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  return unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
}
function backup(files: Record<string, Uint8Array>) {
  const paths = Object.keys(files).filter((path) =>
    /^\.cosmos\/trash\/web-v1\/[^/]+\/note.md$/.test(path),
  );
  expect(paths).toHaveLength(1);
  return paths[0] as string;
}
async function replace(page: Page, path: string, text: string) {
  await page.evaluate(
    async ({ path, text }) => {
      let dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('cosmos-vault');
      const parts = path.split('/');
      const name = parts.pop() as string;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      const writer = await (await dir.getFileHandle(name)).createWritable();
      await writer.write(text);
      await writer.close();
    },
    { path, text },
  );
}

test('trash and restore preserve exact bytes, protected projects, current drafts and legacy files', async ({
  page,
}) => {
  await open(page);
  await seed(page);
  await trash(page)
    .getByRole('button', { name: 'Revisar lixeira', exact: true })
    .click();
  await expect(trash(page).getByText('A lixeira está vazia.')).toBeVisible();
  await select(page, 'Project/context.md');
  await expect(
    page.getByRole('button', { name: 'Enviar à lixeira', exact: true }),
  ).toBeDisabled();
  await select(page);
  await page.locator('.cm-content').press('ControlOrMeta+End');
  await page.locator('.cm-content').pressSequentially('dirty');
  await expect(
    page.getByRole('button', { name: 'Enviar à lixeira', exact: true }),
  ).toBeDisabled();
  await page.locator('.cm-content').press('ControlOrMeta+z');
  await page
    .getByRole('button', { name: 'Enviar à lixeira', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await exported(page))['a.md']).toEqual(
    new Uint8Array(Buffer.from(original)),
  );
  await send(page);
  await expect(
    page.getByText('Nota enviada à lixeira.', { exact: true }),
  ).toBeVisible();
  await expect(trash(page).getByText('A lixeira está vazia.')).toHaveCount(0);
  await expect(
    notes(page).getByRole('button', { name: 'a.md', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Buscar', exact: true })
    .fill('Lixeira');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(notes(page).getByRole('button')).toHaveCount(0);
  const before = await exported(page);
  const copy = backup(before);
  expect(before['a.md']).toBeUndefined();
  expect(before[copy]).toEqual(new Uint8Array(Buffer.from(original)));
  expect(
    Buffer.from(before['.cosmos/trash/legacy/old.md'] ?? []).toString(),
  ).toBe('legacy bytes');
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await select(page, 'other.md');
  await page.locator('.cm-content').fill('rascunho preservado');
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Reflect.set(window, 'trashEditor', document.querySelector('.cm-content')),
  );
  await inspect(page);
  await expect(trash(page).locator('dd')).toHaveText([
    'Ausente',
    'Igual à versão registrada',
  ]);
  for (const target of ['other.md', 'OTHER.MD', 'other.md/child.md']) {
    await restore(page, target);
    await expect(page.getByRole('alert')).toContainText('Já existe');
  }
  await restore(page, 'Project/new.md');
  await expect(page.getByRole('alert')).toContainText('somente leitura na Web');
  await restore(page, '../escape.md');
  await expect(page.getByRole('alert')).toContainText(
    'Use um caminho .md válido',
  );
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
    page.getByRole('button', { name: 'Inspect trash item', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Language').selectOption('pt-BR');
  await restore(page, 'a.md');
  await expect(
    trash(page).getByText(
      'Cópia restaurada em a.md. A nota aberta foi mantida.',
    ),
  ).toBeVisible();
  expect(await exported(page)).toEqual({
    ...before,
    'a.md': new Uint8Array(Buffer.from(original)),
  });
  await expect(page.locator('.cm-content')).toHaveText('rascunho preservado');
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.cm-content') ===
        Reflect.get(window, 'trashEditor'),
    ),
  ).toBe(true);
  await page
    .getByRole('textbox', { name: 'Buscar', exact: true })
    .fill('Lixeira');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(notes(page).getByRole('button')).toHaveText(['a.md']);
});

test('competing trash and restore operations keep a stale draft and never overwrite a restored note', async ({
  page,
  context,
}) => {
  await open(page);
  await seed(page);
  await select(page);
  const other = await context.newPage();
  await open(other);
  await select(other);
  await Promise.all([page, other].map((tab) => send(tab)));
  await expect
    .poll(
      async () =>
        (await page
          .getByText('Nota enviada à lixeira.', { exact: true })
          .count()) +
        (await other
          .getByText('Nota enviada à lixeira.', { exact: true })
          .count()),
    )
    .toBe(1);
  const stale = (await page
    .getByText('Nota enviada à lixeira.', { exact: true })
    .count())
    ? other
    : page;
  await expect(stale.getByRole('alert')).toContainText('O arquivo mudou');
  await stale.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await stale.locator('.cm-content').fill('stale draft');
  await expect(
    stale.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
  await stale.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(stale.getByRole('alert')).toContainText('O arquivo mudou');
  for (const tab of [page, other]) await inspect(tab);
  const before = await exported(stale);
  await Promise.all([page, other].map((tab) => restore(tab, 'restored.md')));
  await expect
    .poll(
      async () =>
        (await trash(page)
          .getByText(
            'Cópia restaurada em restored.md. A nota aberta foi mantida.',
          )
          .count()) +
        (await trash(other)
          .getByText(
            'Cópia restaurada em restored.md. A nota aberta foi mantida.',
          )
          .count()),
    )
    .toBe(1);
  const loser = (await trash(page)
    .getByText('Cópia restaurada em restored.md. A nota aberta foi mantida.')
    .count())
    ? other
    : page;
  await expect(loser.getByRole('alert')).toContainText('Já existe');
  expect(await exported(loser)).toEqual({
    ...before,
    'restored.md': new Uint8Array(Buffer.from(original)),
  });
  await expect(stale.locator('.cm-content')).toHaveText('stale draft');
});

for (const stage of ['backup', 'verification', 'source-change', 'delete']) {
  test(`interrupted trash preserves the source or its verified copy at ${stage}`, async ({
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
        if (name === 'note.md' && options?.create && stage === 'backup')
          throw new DOMException(
            'Injected quota failure',
            'QuotaExceededError',
          );
        if (
          name === 'note.md' &&
          !options?.create &&
          ['verification', 'source-change'].includes(stage) &&
          !Reflect.get(window, 'trashFault')
        ) {
          Reflect.set(window, 'trashFault', true);
          const dir =
            stage === 'verification'
              ? this
              : await (
                  await navigator.storage.getDirectory()
                ).getDirectoryHandle('cosmos-vault');
          const writer = await (
            await get.call(dir, stage === 'verification' ? 'note.md' : 'a.md')
          ).createWritable();
          await writer.write('concurrent edit');
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
    await send(page);
    await expect(page.getByRole('alert')).toContainText(
      stage === 'backup'
        ? 'Injected quota failure'
        : stage === 'verification'
          ? 'O arquivo mudou'
          : 'Uma cópia verificada foi preservada',
    );
    await expect(
      page.getByRole('heading', { name: 'a.md', exact: true }),
    ).toBeVisible();
    const files = await exported(page);
    expect(files['a.md']).toEqual(
      new Uint8Array(
        Buffer.from(stage === 'source-change' ? 'concurrent edit' : original),
      ),
    );
    if (stage !== 'backup')
      expect(files[backup(files)]).toEqual(
        new Uint8Array(
          Buffer.from(stage === 'verification' ? 'concurrent edit' : original),
        ),
      );
    await page.reload();
    await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
    await inspect(page);
    await expect(trash(page).locator('dd').last()).toHaveText(
      stage === 'backup'
        ? 'Ausente'
        : stage === 'verification'
          ? 'Diferente da versão registrada'
          : 'Igual à versão registrada',
    );
    if (['backup', 'verification'].includes(stage))
      await expect(
        trash(page).getByRole('button', {
          name: 'Restaurar cópia',
          exact: true,
        }),
      ).toHaveCount(0);
    expect(await exported(page)).toEqual(files);
  });
}

test('closing the trashing tab before deletion leaves an inspectable copy without declaring the source absent', async ({
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
        Reflect.set(window, 'trashPaused', true);
        await new Promise(() => {});
      }
      return remove.call(this, name, options);
    };
  });
  await send(page);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'trashPaused')))
    .toBe(true);
  const other = await context.newPage();
  await page.close();
  await open(other);
  await inspect(other);
  await expect(trash(other).locator('dd')).toHaveText([
    'Igual à versão registrada',
    'Igual à versão registrada',
  ]);
  await restore(other, 'a.md');
  await expect(other.getByRole('alert')).toContainText('Já existe');
  await restore(other, 'recovered.md');
  await expect(
    trash(other).getByText(
      'Cópia restaurada em recovered.md. A nota aberta foi mantida.',
    ),
  ).toBeVisible();
  const files = await exported(other);
  expect(files['recovered.md']).toEqual(files['a.md']);
  expect(files[backup(files)]).toEqual(files['a.md']);
});

test('trash restoration rechecks metadata and backup after inspection', async ({
  page,
}) => {
  await open(page);
  await seed(page);
  await select(page);
  await send(page);
  await expect(
    page.getByText('Nota enviada à lixeira.', { exact: true }),
  ).toBeVisible();
  const before = await exported(page);
  const copy = backup(before);
  const metadata = copy.replace('note.md', 'operation.json');
  await inspect(page);
  await replace(
    page,
    metadata,
    `${Buffer.from(before[metadata] ?? []).toString()} `,
  );
  await restore(page, 'recovered.md');
  await expect(page.getByRole('alert')).toContainText('O registro mudou');
  await inspect(page);
  await replace(page, copy, 'changed backup');
  await restore(page, 'recovered.md');
  await expect(page.getByRole('alert')).toContainText(
    'A cópia está ausente, alterada',
  );
  await replace(page, metadata, '{');
  await trash(page)
    .getByRole('button', { name: 'Revisar lixeira', exact: true })
    .click();
  await expect(
    trash(page).getByText('Registro inválido ou incompleto.', { exact: false }),
  ).toBeVisible();
  expect((await exported(page))['recovered.md']).toBeUndefined();
});
