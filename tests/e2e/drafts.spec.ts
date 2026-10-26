import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { test } from './storage-fixture';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function note(page: Page, content = 'original') {
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'draft.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync({ 'a.md': Buffer.from(content) })),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'a.md', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'true',
  );
}
async function edit(page: Page, text: string) {
  await page.locator('.cm-content').fill(text);
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
}
async function disk(page: Page, content?: string | null) {
  return page.evaluate(async (value) => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('cosmos-vault');
    if (value === null) {
      await root.removeEntry('a.md');
      return '';
    }
    const file = await root.getFileHandle('a.md');
    if (value !== undefined) {
      const writer = await file.createWritable();
      await writer.write(value);
      await writer.close();
    }
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await (await file.getFile()).arrayBuffer(),
    );
  }, content);
}
async function reopen(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}

test('recover a confirmed local draft after reload, preserve raw bytes and clear it only after saving', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await open(page);
  const original = '\ufeff# Nota\r\nOutra linha\n';
  await note(page, original);
  await page.locator('.cm-content').press('ControlOrMeta+End');
  await page.locator('.cm-content').pressSequentially('Rascunho recuperável');
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toBeVisible();
  expect(await disk(page)).toBe(original);
  await reopen(page);
  await page
    .getByRole('button', { name: 'Recuperar rascunho', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText(
    'Rascunho recuperável',
  );
  expect(await disk(page)).toBe(original);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar nota', exact: true }).click();
  expect(
    await readFile((await (await downloading).path()) as string, 'utf8'),
  ).toBe(`${original}Rascunho recuperável`);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByText('Salvo no cofre.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Atualizar rascunhos', exact: true })
    .click();
  expect(await disk(page)).toBe(`${original}Rascunho recuperável`);
  // Recovery forks a copy; deleting the original requires its own confirmation.
  await expect(
    page.getByRole('button', { name: 'Excluir rascunho', exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Excluir rascunho', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Excluir rascunho', exact: true }),
  ).toHaveCount(0);
  await reopen(page);
  await expect(
    page.getByRole('button', { name: 'Atualizar rascunhos' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
  ).toHaveCount(0);
});

test('two tabs retain separate drafts and recovery never overwrites an external edit', async ({
  page,
  context,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await open(page);
  await note(page);
  const second = await context.newPage();
  second.on('dialog', (dialog) => dialog.accept());
  await open(second);
  await second
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'a.md', exact: true })
    .click();
  await expect(second.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await edit(page, 'primeira cópia');
  await edit(second, 'segunda cópia');
  await reopen(page);
  await expect(
    page.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
  ).toHaveCount(2);
  await edit(second, 'segunda cópia atualizada');
  await page
    .getByRole('button', { name: 'Excluir rascunho', exact: true })
    .first()
    .click();
  await expect(page.getByRole('alert')).toContainText('mudou em outra janela');
  await page
    .getByRole('button', { name: 'Atualizar rascunhos', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
  ).toHaveCount(2);
  await disk(page, 'alteração externa');
  await page
    .getByRole('button', { name: 'Recuperar rascunho', exact: true })
    .first()
    .click();
  await expect(page.locator('.cm-content')).toContainText(
    'segunda cópia atualizada',
  );
  await expect(
    page.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(
    'alterada fora do COSMOS',
  );
  expect(await disk(page)).toBe('alteração externa');
  await expect(
    page.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
  ).toHaveCount(2);
  await second.close();
});

test('a missing source still permits recovery and download of the draft', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await open(page);
  await note(page);
  await edit(page, 'não perder esta cópia');
  await disk(page, null);
  await reopen(page);
  await page
    .getByRole('button', { name: 'Recuperar rascunho', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText(
    'não perder esta cópia',
  );
  await expect(
    page.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeDisabled();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar nota', exact: true }).click();
  expect(
    await readFile((await (await downloading).path()) as string, 'utf8'),
  ).toBe('não perder esta cópia');
});

test('folders with the same name keep separate recoverable drafts across reloads', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
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
  await note(page);
  await edit(page, 'rascunho da pasta A');
  await page.getByRole('button', { name: 'Fechar cofre' }).click();
  await page.evaluate(() => Reflect.set(window, 'selectedFolder', 'B'));
  await page.getByRole('button', { name: 'Abrir pasta do computador' }).click();
  await expect(
    page.getByRole('button', { name: 'Atualizar rascunhos' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Abrir pasta do computador' }).click();
  await page
    .getByRole('button', { name: 'Recuperar rascunho', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText(
    'rascunho da pasta A',
  );
});

test('unavailable draft storage is explicit and leaves manual saving available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', {
      configurable: true,
      value: () => {
        throw new DOMException('Storage unavailable', 'QuotaExceededError');
      },
    });
  });
  await open(page);
  expect(
    await page.evaluate(() => {
      try {
        indexedDB.open('cosmos-drafts');
        return 'unexpected success';
      } catch (error) {
        return error instanceof DOMException ? error.name : String(error);
      }
    }),
  ).toBe('QuotaExceededError');
  await note(page);
  await page.locator('.cm-content').fill('edição ainda disponível');
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível proteger',
  );
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByText('Salvo no cofre.', { exact: true }),
  ).toBeVisible();
  expect(await disk(page)).toBe('edição ainda disponível');
});
