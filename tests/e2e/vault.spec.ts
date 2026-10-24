import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { test } from './storage-fixture';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  try {
    await expect(
      page.getByRole('heading', { name: 'COSMOS', exact: true }),
    ).toBeVisible();
  } catch (error) {
    throw new Error(
      `${String(error)}\nApplication state: ${await page.locator('body').textContent()}`,
    );
  }
}
async function create(page: Page, path: string, content: string) {
  await page.getByLabel('Caminho da nota').fill(path);
  await page.getByRole('button', { name: 'Criar nota', exact: true }).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill(content);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByText('Salvo no cofre.', { exact: true }),
  ).toBeVisible();
}
test('create, save, reopen, search and navigate backlinks; preferences preserve drafts', async ({
  page,
}) => {
  await open(page);
  await create(
    page,
    'Universos/Pessoal/Órbita.md',
    '# Órbita\nUma ideia local.',
  );
  await create(page, 'Universos/Pessoal/Mapa.md', '# Mapa\n[[Órbita|Destino]]');
  await page.getByRole('button', { name: 'Órbita', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Órbita.md', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Conexões' })
      .getByRole('button', { name: 'Universos/Pessoal/Mapa.md' }),
  ).toBeVisible();
  await page.locator('.cm-content').press('ControlOrMeta+End');
  await page.locator('.cm-content').press('Enter');
  await page.locator('.cm-content').pressSequentially('Rascunho');
  await page.getByLabel('Idioma').selectOption('en');
  await page.getByLabel('Theme').selectOption('hemera');
  await expect(page.locator('.cm-content')).toContainText('Rascunho');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Saved to vault.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Universos/Pessoal/Órbita.md' })
    .click();
  await expect(page.locator('.cm-content')).toContainText('Rascunho');
  await page.getByLabel('Buscar', { exact: true }).fill('local');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Notas' }).getByRole('button'),
  ).toHaveCount(1);
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
});
test('two tabs preserve both edits and surface revision conflict', async ({
  page,
  context,
}) => {
  await open(page);
  await create(page, 'a.md', 'original');
  const second = await context.newPage();
  await open(second);
  await second
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'a.md', exact: true })
    .click();
  await expect(second.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await page.locator('.cm-content').fill('primeira edição');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByText('Salvo no cofre.', { exact: true }),
  ).toBeVisible();
  await second.locator('.cm-content').fill('segunda edição');
  await second.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('O arquivo mudou');
  await expect(second.locator('.cm-content')).toHaveText('segunda edição');
  await expect(second.getByText('Alterações não salvas')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'a.md', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toHaveText('primeira edição');
});
test('Obsidian import/export keeps attachments, canvas, BOM and mixed line endings; memory stays read-only', async ({
  page,
}) => {
  const temp = await mkdtemp(join(tmpdir(), 'cosmos-roundtrip-'));
  const folder = join(temp, 'Obsidian');
  const original =
    '\ufeff---\r\naliases: [ideia]\r\n---\n# Órbita\r\n[[Outra|Nome]]\n';
  const attachment = Buffer.from([0, 1, 254, 255, 42]);
  try {
    await mkdir(join(folder, '.obsidian'), { recursive: true });
    await mkdir(join(folder, 'Projeto'));
    await writeFile(join(folder, 'Nota.md'), original);
    await writeFile(join(folder, 'asset.bin'), attachment);
    await writeFile(
      join(folder, 'mapa.canvas'),
      '{ "nodes": [], "edges": [] }\r\n',
    );
    await writeFile(join(folder, '.obsidian', 'app.json'), '{"x":true}');
    await writeFile(
      join(folder, 'Projeto', 'project.cosmos.json'),
      '{"format_version":1,"id":"prj_fixture"}',
    );
    await writeFile(join(folder, 'Projeto', 'context.md'), '# Memória');
    await open(page);
    await page
      .getByLabel('Importar pasta', { exact: true })
      .setInputFiles(folder);
    await expect(
      page.getByText('Pasta importada sem alterar os originais.'),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Notas' })
      .getByRole('button', { name: 'Obsidian/Nota.md', exact: true })
      .click();
    await expect(page.locator('.cm-content')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    await page.locator('.cm-content').press('ControlOrMeta+End');
    await page.locator('.cm-content').pressSequentially('Fim');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(
      page.getByText('Salvo no cofre.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Notas' })
      .getByRole('button', { name: 'Obsidian/Projeto/context.md', exact: true })
      .click();
    await expect(
      page.getByText(
        'A memória de projetos é somente leitura na Web. Use o Desktop para editar.',
      ),
    ).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
    const download = await downloading;
    const bytes = unzipSync(
      new Uint8Array(await readFile((await download.path()) as string)),
    );
    expect(Buffer.from(bytes['Obsidian/Nota.md'] ?? []).toString('utf8')).toBe(
      `${original}Fim`,
    );
    expect(Buffer.from(bytes['Obsidian/asset.bin'] ?? [])).toEqual(attachment);
    expect(Buffer.from(bytes['Obsidian/mapa.canvas'] ?? []).toString()).toBe(
      '{ "nodes": [], "edges": [] }\r\n',
    );
    expect(
      Buffer.from(bytes['Obsidian/.obsidian/app.json'] ?? []).toString(),
    ).toBe('{"x":true}');
    expect(await readFile(join(folder, 'Nota.md'), 'utf8')).toBe(original);
    // A second import cannot overwrite any existing files.
    await page
      .getByLabel('Importar pasta', { exact: true })
      .setInputFiles(folder);
    await expect(page.getByRole('alert')).toContainText('DESTINATION_EXISTS');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
