import { expect, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { test } from './storage-fixture';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
}
async function select(page: Page, path = 'a.md') {
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: path, exact: true })
    .click();
  await expect(page.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'true',
  );
}
async function copyTo(page: Page, path: string) {
  await page.getByLabel('Caminho de destino', { exact: true }).fill(path);
  await page.getByRole('button', { name: 'Criar cópia', exact: true }).click();
}
async function read(page: Page, path: string) {
  return page.evaluate(async (path) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(
      'cosmos-vault',
    );
    const parts = path.split('/');
    const name = parts.pop();
    if (!name) throw new Error('Missing fixture filename');
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(name)).getFile();
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await file.arrayBuffer(),
    );
  }, path);
}
async function importNotes(page: Page, notes: Record<string, string>) {
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'copy.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(notes).map(([path, content]) => [
            path,
            Buffer.from(content),
          ]),
        ),
      ),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
}

test('copy preserves exact source bytes and never replaces an existing or protected destination', async ({
  page,
}) => {
  await open(page);
  const original = '\ufeff# Original\r\nLinha dois\n';
  await importNotes(page, {
    'a.md': original,
    'empty.md': '',
    'Project/project.cosmos.json': '{}',
  });
  await select(page);
  await page.evaluate(() =>
    Reflect.set(window, 'sourceEditor', document.querySelector('.cm-content')),
  );
  await page
    .getByRole('button', { name: 'Salvar cópia como…', exact: true })
    .click();
  await page
    .getByLabel('Caminho de destino', { exact: true })
    .fill('cancelled.md');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Notas' })
      .getByRole('button', { name: 'cancelled.md', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Salvar cópia como…', exact: true })
    .click();
  await copyTo(page, 'a.md');
  await expect(page.getByRole('alert')).toContainText(
    'Escolha um caminho diferente',
  );
  await copyTo(page, 'empty.md');
  await expect(page.getByRole('alert')).toContainText('Já existe');
  expect(await read(page, 'empty.md')).toBe('');
  await copyTo(page, 'Project/copy.md');
  await expect(page.getByRole('alert')).toContainText('somente leitura na Web');
  await copyTo(page, '../escape.md');
  await expect(page.getByRole('alert')).toContainText(
    'Use um caminho .md válido',
  );
  await copyTo(page, 'Copies/Órbita.md');
  await expect(
    page.getByText(
      'Cópia salva em Copies/Órbita.md. A nota em edição foi mantida.',
    ),
  ).toBeVisible();
  expect(await read(page, 'Copies/Órbita.md')).toBe(original);
  expect(await read(page, 'a.md')).toBe(original);
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.cm-content') ===
        Reflect.get(window, 'sourceEditor'),
    ),
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'a.md', exact: true }),
  ).toBeVisible();
});

test('two tabs creating the same copy preserve both drafts and the external source', async ({
  page,
  context,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await open(page);
  await importNotes(page, { 'a.md': 'original' });
  await select(page);
  const second = await context.newPage();
  second.on('dialog', (dialog) => dialog.accept());
  await open(second);
  await select(second);
  await page.locator('.cm-content').fill('rascunho um');
  await second.locator('.cm-content').fill('rascunho dois');
  for (const tab of [page, second]) {
    await expect(
      tab.getByText('Rascunho protegido neste dispositivo.', { exact: true }),
    ).toBeVisible();
    await tab
      .getByRole('button', { name: 'Salvar cópia como…', exact: true })
      .click();
    await tab.getByLabel('Caminho de destino', { exact: true }).fill('copy.md');
  }
  await page.evaluate(async () => {
    const dir = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('cosmos-vault');
    const writer = await (await dir.getFileHandle('a.md')).createWritable();
    await writer.write('versão externa');
    await writer.close();
  });
  await Promise.all(
    [page, second].map((tab) =>
      tab.getByRole('button', { name: 'Criar cópia', exact: true }).click(),
    ),
  );
  for (const tab of [page, second])
    await expect(
      tab
        .locator('[role="status"], [role="alert"]')
        .filter({ hasText: /Cópia salva em|Já existe/ }),
    ).toHaveCount(1);
  const saved = await read(page, 'copy.md');
  expect(['rascunho um', 'rascunho dois']).toContain(saved);
  const winner = saved === 'rascunho um' ? page : second;
  const loser = saved === 'rascunho um' ? second : page;
  await expect(
    winner.getByText('Cópia salva em copy.md. A nota em edição foi mantida.'),
  ).toBeVisible();
  await expect(loser.getByRole('alert')).toContainText('Já existe');
  expect(await read(page, 'a.md')).toBe('versão externa');
  await expect(page.locator('.cm-content')).toHaveText('rascunho um');
  await expect(second.locator('.cm-content')).toHaveText('rascunho dois');
  await winner.reload();
  await winner.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await expect(
    winner.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
  ).toHaveCount(2);
  await second.close();
});
