import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

test('Obsidian block links navigate locally and across notes without changing source bytes, drafts or undo', async ({
  page,
}) => {
  const fixture = await readFile(
    new URL('../conformance/obsidian-blocks.md', import.meta.url),
    'utf8',
  );
  const source =
    '\ufeff' +
    fixture.replace(/\n/g, '\r\n') +
    '\n[[#^lista|Lista]] [[#^item-1|Item]] [[#^citacao|Citação]] [[#^tabela|Tabela]]\n\n[[#^missing|Ausente]] [[#^dup|Duplicado]] [[#^Intro|Caixa diferente]]\n\nPrimeiro ^dup\n\nSegundo ^dup\n\n![[Outra#^destino]]\n';
  const other = 'Destino **formatado**. ^destino\n\n[Voltar](Mapa.md#%5Eintro)';
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'blocks.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Pasta/Mapa.md': Buffer.from(source),
        'Pasta/Outra.md': Buffer.from(other),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Pasta/Mapa.md' })
    .click();
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Leitura Markdown' });
  for (const [label, tag, id] of [
    ['Introdução', 'p', 'intro'],
    ['Lista', 'ul', 'lista'],
    ['Item', 'li', 'item-1'],
    ['Citação', 'blockquote', 'citacao'],
    ['Tabela', 'table', 'tabela'],
  ]) {
    await preview.getByRole('button', { name: label, exact: true }).click();
    await expect(
      preview.locator(`${tag}[id="cosmos-block-${id}"]`),
    ).toBeFocused();
  }
  await expect(preview).not.toContainText('^lista');
  await expect(preview).toContainText('![[Outra#^destino]]');
  await expect(preview.locator('[id="cosmos-block-dup"]')).toHaveCount(0);
  for (const label of ['Ausente', 'Duplicado', 'Caixa diferente']) {
    await preview.getByRole('button', { name: label, exact: true }).click();
    await expect(preview.getByRole('status')).toContainText(
      'não foi encontrado ou seu identificador está repetido',
    );
  }
  for (const label of ['Outra nota', 'Bloco externo']) {
    await preview.getByRole('button', { name: label, exact: true }).click();
    await expect(preview.locator('#cosmos-block-destino')).toBeFocused();
    await expect(preview.locator('#cosmos-block-destino strong')).toHaveText(
      'formatado',
    );
    await preview.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(preview.locator('#cosmos-block-intro')).toBeFocused();
    await expect(preview.getByRole('status')).toHaveCount(0);
  }
  await page
    .getByRole('button', { name: 'Edição e leitura', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('Rascunho com bloco ^draft');
  await expect(preview.locator('#cosmos-block-draft')).toHaveText(
    'Rascunho com bloco',
  );
  await preview
    .getByRole('button', { name: 'Introdução', exact: true })
    .click();
  await expect(preview.locator('#cosmos-block-intro')).toBeFocused();
  page.once('dialog', (dialog) => dialog.dismiss());
  await preview
    .getByRole('button', { name: 'Outra nota', exact: true })
    .click();
  await expect(editor).toContainText('Rascunho com bloco ^draft');
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
  await editor.press('ControlOrMeta+z');
  await expect(preview.locator('#cosmos-block-draft')).toHaveCount(0);
  await expect(editor).toContainText('^intro');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Pasta/Mapa.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  expect(Buffer.from(archive['Pasta/Outra.md'] ?? [])).toEqual(
    Buffer.from(other),
  );
});
