import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

test('Obsidian callouts support keyboard, nested navigation and accessibility without changing source or drafts', async ({
  page,
}) => {
  const fixture = await readFile(
    new URL('../conformance/obsidian-callouts.md', import.meta.url),
    'utf8',
  );
  const source =
    '\ufeff' +
    fixture.replace(/\n/g, '\r\n') +
    '\n> [!unknown]\n> Genérico\n\n[[Outra#^deep|Outra nota]]\n';
  const other =
    '> [!note]- Exterior\n>\n> > [!tip]- Interior\n> > Destino profundo. ^deep\n\n[[Mapa#^callout|Voltar]]';
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'callouts.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Mapa.md': Buffer.from(source),
        'Outra.md': Buffer.from(other),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Mapa.md', exact: true })
    .click();
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Leitura Markdown' });
  const folded = preview.locator('details[data-callout="warning"]');
  const summary = folded.locator(':scope > summary');
  await expect(summary).toHaveText('Recolhido');
  await expect(folded).not.toHaveAttribute('open');
  await expect(preview.getByRole('heading', { name: 'Dentro' })).toBeHidden();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(folded).toHaveAttribute('open');
  await expect(preview.locator('details[data-callout="tip"]')).toHaveAttribute(
    'open',
  );
  await page.keyboard.press('Space');
  await expect(folded).not.toHaveAttribute('open');
  await preview.getByRole('button', { name: 'Título', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Dentro' })).toBeFocused();
  await expect(folded).toHaveAttribute('open');
  await summary.click();
  await preview.getByRole('button', { name: 'Bloco', exact: true }).click();
  await expect(preview.locator('#cosmos-block-interno')).toBeFocused();
  await expect(folded).toHaveAttribute('open');
  await expect(preview.locator('[data-callout-default="note"]')).toHaveText(
    'Nota',
  );
  await expect(preview).toContainText('[!note] Literal');
  await expect(
    preview.locator('summary button, summary a, summary img'),
  ).toHaveCount(0);
  for (const theme of ['nyx', 'hemera']) {
    await page.getByLabel('Tema').selectOption(theme);
    await expect(folded).toHaveAttribute('open');
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.locator('[data-callout-default="note"]')).toHaveText(
    'Note',
  );
  await page.getByLabel('Language').selectOption('pt-BR');
  await preview
    .getByRole('button', { name: 'Outra nota', exact: true })
    .click();
  await expect(preview.locator('#cosmos-block-deep')).toBeFocused();
  await expect(preview.locator('details[open]')).toHaveCount(2);
  await preview.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(folded).toBeFocused();
  await expect(folded).toHaveAttribute('open');
  await page
    .getByRole('button', { name: 'Edição e leitura', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('Rascunho preservado');
  await expect(preview).toContainText('Rascunho preservado');
  await summary.click();
  await summary.click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await preview
    .getByRole('button', { name: 'Outra nota', exact: true })
    .click();
  await expect(editor).toContainText('Rascunho preservado');
  await editor.press('ControlOrMeta+z');
  await expect(preview).not.toContainText('Rascunho preservado');
  await expect(editor).toContainText('[!warning]- Recolhido');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Mapa.md'] ?? [])).toEqual(Buffer.from(source));
  expect(Buffer.from(archive['Outra.md'] ?? [])).toEqual(Buffer.from(other));
});
