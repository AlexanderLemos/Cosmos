import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

async function importNotes(page: Page, files: Record<string, Uint8Array>) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'live.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(files)),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
}

async function exported(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  return unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
}

test('visual editing reveals selected Markdown and preserves editor identity, undo, drafts and exact bytes', async ({
  page,
}) => {
  const source =
    '\ufeff---\r\ntitle: **YAML**\n---\r\n# Título\n\n**Forte** e *ênfase* e `código`.\r\n\n\\*literal\\* e **incompleto\n\n```md\n# Código\n**bruto**\n```\r\n\nFinal';
  await importNotes(page, { 'Nota.md': Buffer.from(source) });
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Nota.md', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.evaluate((element) =>
    Reflect.set(window, 'originalEditor', element),
  );
  await editor.press('ControlOrMeta+End');
  await page
    .getByRole('button', { name: 'Edição visual', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Leitura Markdown' }),
  ).toHaveCount(0);
  await expect(editor.locator('.cm-live-heading-1')).toHaveText('Título');
  await expect(editor.locator('.cm-live-strong')).toHaveText('Forte');
  await expect(editor.locator('.cm-live-emphasis')).toHaveText('ênfase');
  await expect(editor.locator('.cm-live-code')).toHaveText('código');
  await expect(editor).toContainText('title: **YAML**');
  await expect(editor).toContainText('**bruto**');
  await expect(editor).toContainText('\\*literal\\* e **incompleto');
  await editor.locator('.cm-live-strong').click();
  await expect(editor.locator('.cm-live-strong')).toHaveText('**Forte**');
  await expect(editor.locator('.cm-live-code')).toHaveText('`código`');
  await editor.press('Home');
  await editor.press('ArrowRight');
  await editor.press('ArrowRight');
  await editor.pressSequentially('Muito ');
  await expect(editor.locator('.cm-live-strong')).toHaveText('**Muito Forte**');
  await editor.press('ControlOrMeta+z');
  await expect(editor.locator('.cm-live-strong')).toHaveText('**Forte**');
  await editor.press('ControlOrMeta+a');
  await expect(editor).toContainText('# Título');
  await expect(editor).toContainText('**Forte**');
  await editor.press('ControlOrMeta+End');
  await expect(editor.locator('.cm-live-strong')).toHaveText('Forte');
  expect(Buffer.from((await exported(page))['Nota.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially(' editado');
  await expect(editor).toContainText('Final editado');
  for (const name of ['Editar', 'Ler', 'Edição e leitura', 'Edição visual'])
    await page.getByRole('button', { name, exact: true }).click();
  expect(
    await editor.evaluate(
      (element) => element === Reflect.get(window, 'originalEditor'),
    ),
  ).toBe(true);
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('editado');
  await editor.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Final editado');
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
    page.getByRole('button', { name: 'Visual editing', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toContainText('Final editado');
  await page.getByLabel('Language').selectOption('pt-BR');
  await editor.press('ControlOrMeta+s');
  await expect(
    page.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeDisabled();
  expect(Buffer.from((await exported(page))['Nota.md'] ?? [])).toEqual(
    Buffer.from(`${source} editado`),
  );
});

test('visual editing keeps protected notes read-only and uses raw Markdown above its display limit', async ({
  page,
}) => {
  const large = `# Grande\n${'texto '.repeat(44_000)}`;
  await importNotes(page, {
    'Projeto/project.cosmos.json': Buffer.from('{}'),
    'Projeto/Nota.md': Buffer.from('# Protegida\n\n**Forte**\n\nFinal'),
    'Grande.md': Buffer.from(large),
  });
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Projeto/Nota.md', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Edição visual', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(
    page.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Grande.md', exact: true })
    .click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByText(/A edição visual está limitada/)).toBeVisible();
  await expect(editor.locator('.cm-live-heading-1')).toHaveCount(0);
  await expect(editor).toContainText('# Grande');
});
