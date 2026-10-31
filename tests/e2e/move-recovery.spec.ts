import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const original = '\ufeff# Recuperação\r\nLinha\n';
const id = '00000000-0000-4000-8000-000000000001';
const base = `.cosmos/moves/${id}`;
const record = {
  format: 1,
  from: 'a.md',
  to: 'moved.md',
  rev: `sha256:${createHash('sha256').update(original).digest('hex')}`,
  backup: 'note.md',
};
const recovery = (page: Page) =>
  page.getByRole('region', { name: 'Cópias de movimentação', exact: true });
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function seed(page: Page, extra: Record<string, string> = {}) {
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'recovery.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries({
            [`${base}/operation.json`]: JSON.stringify(record),
            [`${base}/note.md`]: original,
            'moved.md': original,
            'Project/project.cosmos.json': '{}',
            ...extra,
          }).map(([path, text]) => [path, Buffer.from(text)]),
        ),
      ),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
}
async function review(page: Page) {
  await recovery(page)
    .getByRole('button', { name: 'Revisar movimentações', exact: true })
    .click();
  await expect(
    recovery(page)
      .getByRole('button', { name: 'Conferir movimentação', exact: true })
      .first(),
  ).toBeEnabled();
}
async function inspect(page: Page) {
  await recovery(page)
    .getByRole('button', { name: 'Conferir movimentação', exact: true })
    .click();
  await expect(
    recovery(page).getByText('Conferido em', { exact: false }),
  ).toBeVisible();
}
async function restore(page: Page, target: string) {
  await recovery(page)
    .getByLabel('Restaurar cópia para', { exact: true })
    .fill(target);
  await recovery(page)
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
async function replace(page: Page, path: string, text: string | null) {
  await page.evaluate(
    async ({ path, text }) => {
      let dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('cosmos-vault');
      const parts = path.split('/');
      const name = parts.pop() as string;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      if (text === null) return dir.removeEntry(name);
      const writer = await (
        await dir.getFileHandle(name, { create: true })
      ).createWritable();
      await writer.write(text);
      await writer.close();
    },
    { path, text },
  );
}

test('inspect and restore an actual move keeps the current draft, backup and exact bytes', async ({
  page,
}) => {
  await open(page);
  await seed(page, { 'a.md': original });
  // Remove the fixture record so this scenario uses only a record produced by the app.
  await page.evaluate(async () => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('cosmos-vault');
    await (await root.getDirectoryHandle('.cosmos')).removeEntry('moves', {
      recursive: true,
    });
  });
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'a.md', exact: true })
    .click();
  await page.getByRole('button', { name: 'Mover nota', exact: true }).click();
  await page
    .getByLabel('Caminho de destino', { exact: true })
    .fill('Relocated/note.md');
  await page
    .getByRole('button', { name: 'Confirmar mudança', exact: true })
    .click();
  await expect(page.getByText('Nota movida.', { exact: true })).toBeVisible();
  await page.locator('.cm-content').fill('rascunho mantido');
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Reflect.set(
      window,
      'recoveryEditor',
      document.querySelector('.cm-content'),
    ),
  );
  await review(page);
  await inspect(page);
  await expect(recovery(page).locator('dd')).toHaveText([
    'Ausente',
    'Igual à versão registrada',
    'Igual à versão registrada',
  ]);
  for (const target of ['moved.md', 'MOVED.MD', 'moved.md/child.md']) {
    await restore(page, target);
    await expect(page.getByRole('alert')).toContainText('Já existe');
  }
  await restore(page, 'Project/new.md');
  await expect(page.getByRole('alert')).toContainText('somente leitura na Web');
  for (const target of ['../escape.md', '.COSMOS/new.md', 'bad.png']) {
    await restore(page, target);
    await expect(page.getByRole('alert')).toContainText(
      'Use um caminho .md válido',
    );
  }
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
    page.getByRole('button', { name: 'Restore copy', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Language').selectOption('pt-BR');
  const before = await exported(page);
  await restore(page, 'a.md');
  await expect(
    recovery(page).getByText(
      'Cópia restaurada em a.md. A nota aberta foi mantida.',
    ),
  ).toBeVisible();
  expect(await exported(page)).toEqual({
    ...before,
    'a.md': new Uint8Array(Buffer.from(original)),
  });
  await expect(page.locator('.cm-content')).toHaveText('rascunho mantido');
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.cm-content') ===
        Reflect.get(window, 'recoveryEditor'),
    ),
  ).toBe(true);
  await expect(
    page
      .getByRole('navigation', { name: 'Notas' })
      .getByRole('button', { name: 'a.md', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Buscar', exact: true })
    .fill('Recuperação');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Notas' })
      .getByRole('button', { name: 'a.md', exact: true }),
  ).toBeVisible();
});

test('damaged records and copies remain visible but cannot authorize restoration', async ({
  page,
}) => {
  await open(page);
  await seed(page, { 'moved.md': 'external edit' });
  const before = await exported(page);
  await review(page);
  await inspect(page);
  await expect(recovery(page).locator('dd')).toHaveText([
    'Ausente',
    'Diferente da versão registrada',
    'Igual à versão registrada',
  ]);
  expect(await exported(page)).toEqual(before);
  // A copy changed after inspection must be rejected again at restoration time.
  await replace(page, `${base}/note.md`, 'changed copy');
  await restore(page, 'restored.md');
  await expect(page.getByRole('alert')).toContainText(
    'A cópia está ausente, alterada',
  );
  await inspect(page);
  await expect(
    recovery(page).getByRole('button', {
      name: 'Restaurar cópia',
      exact: true,
    }),
  ).toHaveCount(0);
  await replace(page, `${base}/note.md`, null);
  await inspect(page);
  await expect(recovery(page).locator('dd').last()).toHaveText('Ausente');
  await replace(
    page,
    `${base}/operation.json`,
    JSON.stringify({ ...record, from: '../escape.md' }),
  );
  await recovery(page)
    .getByRole('button', { name: 'Revisar movimentações', exact: true })
    .click();
  await expect(
    recovery(page).getByText('Registro inválido ou incompleto.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    recovery(page).getByRole('button', {
      name: 'Conferir movimentação',
      exact: true,
    }),
  ).toHaveCount(0);
  expect((await exported(page))['restored.md']).toBeUndefined();
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await recovery(page)
    .getByRole('button', { name: 'Revisar movimentações', exact: true })
    .click();
  await expect(
    recovery(page).getByText('Registro inválido ou incompleto.', {
      exact: false,
    }),
  ).toBeVisible();
});

test('record revisions and competing restores never replace the destination or consume the backup', async ({
  page,
  context,
}) => {
  await open(page);
  await seed(page);
  await review(page);
  await inspect(page);
  await replace(
    page,
    `${base}/operation.json`,
    JSON.stringify(record, null, 2),
  );
  await restore(page, 'restored.md');
  await expect(page.getByRole('alert')).toContainText('O registro mudou');
  expect((await exported(page))['restored.md']).toBeUndefined();
  await review(page);
  await inspect(page);
  const other = await context.newPage();
  await open(other);
  await review(other);
  await inspect(other);
  const before = await exported(page);
  await Promise.all([page, other].map((tab) => restore(tab, 'restored.md')));
  await expect
    .poll(
      async () =>
        (await recovery(page)
          .getByText(
            'Cópia restaurada em restored.md. A nota aberta foi mantida.',
          )
          .count()) +
        (await recovery(other)
          .getByText(
            'Cópia restaurada em restored.md. A nota aberta foi mantida.',
          )
          .count()),
    )
    .toBe(1);
  const loser = (await recovery(page)
    .getByText('Cópia restaurada em restored.md. A nota aberta foi mantida.')
    .count())
    ? other
    : page;
  await expect(loser.getByRole('alert')).toContainText('Já existe');
  expect(await exported(loser)).toEqual({
    ...before,
    'restored.md': new Uint8Array(Buffer.from(original)),
  });
  await other.close();
});

test('a failed restore retains its copy across reload and permits another free path', async ({
  page,
}) => {
  await open(page);
  await seed(page);
  await review(page);
  await inspect(page);
  await page.evaluate(() => {
    const original = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (options) {
      if (this.name === 'failed.md')
        throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return original.call(this, options);
    };
  });
  await restore(page, 'failed.md');
  await expect(page.getByRole('alert')).toContainText(
    'A restauração não foi confirmada',
  );
  const interrupted = await exported(page);
  expect(Buffer.from(interrupted[`${base}/note.md`] ?? [])).toEqual(
    Buffer.from(original),
  );
  expect(interrupted['failed.md']).toEqual(new Uint8Array());
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await review(page);
  await inspect(page);
  await restore(page, 'failed.md');
  await expect(page.getByRole('alert')).toContainText('Já existe');
  await restore(page, 'Recovered/copy.md');
  await expect(
    recovery(page).getByText(
      'Cópia restaurada em Recovered/copy.md. A nota aberta foi mantida.',
    ),
  ).toBeVisible();
  expect(await exported(page)).toEqual({
    ...interrupted,
    'Recovered/copy.md': new Uint8Array(Buffer.from(original)),
  });
});

test('recovery listings paginate and reject oversized or unreadable metadata without reading copies', async ({
  page,
}) => {
  await open(page);
  const entries: Record<string, string> = {};
  for (let index = 1; index <= 51; index++) {
    const key = `.cosmos/moves/00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    entries[`${key}/operation.json`] =
      index === 2
        ? ' '.repeat(65537)
        : index === 3
          ? '{'
          : JSON.stringify(record);
  }
  await seed(page, entries);
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (
      name,
      options,
    ) {
      if (name === 'note.md' && !options?.create)
        throw new Error('Copies must not be read during listing');
      return original.call(this, name, options);
    };
  });
  await review(page);
  await expect(recovery(page).getByRole('article')).toHaveCount(50);
  await expect(
    recovery(page).getByText('Registro inválido ou incompleto.', {
      exact: false,
    }),
  ).toHaveCount(2);
  await recovery(page)
    .getByRole('button', { name: 'Carregar mais cópias' })
    .click();
  await expect(recovery(page).getByRole('article')).toHaveCount(51);
  await expect(
    recovery(page).getByRole('button', { name: 'Carregar mais cópias' }),
  ).toHaveCount(0);
});
