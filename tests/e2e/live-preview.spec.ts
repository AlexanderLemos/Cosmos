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
    'Projeto/Nota.md': Buffer.from(
      '# Protegida\n\n**Forte**\n\n- [ ] Protegida\n\n| Campo |\n| --- |\n| Protegido |\n\nFinal',
    ),
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
    editor.getByRole('checkbox', { name: 'Tarefa: Protegida', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeDisabled();
  await expect(editor.getByRole('table')).toHaveCount(1);
  await editor
    .getByRole('button', { name: 'Mostrar Markdown da tabela', exact: true })
    .click();
  await expect(editor.getByRole('table')).toHaveCount(0);
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(editor).toContainText('| Protegido |');
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Grande.md', exact: true })
    .click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByText(/A edição visual está limitada/)).toBeVisible();
  await expect(editor.locator('.cm-live-heading-1')).toHaveCount(0);
  await expect(editor).toContainText('# Grande');
});

test('visual tasks support mouse, keyboard and undo without rewriting other Markdown', async ({
  page,
}) => {
  const source =
    '\ufeff---\r\n- [ ] YAML\n---\r\n\n- [ ] Comprar pão\r\n  - [X] Feita\n\n1. [x] Ordenada\r\n\n> - [ ] Citada\n\n~~Antigo~~ e ~literal~\n\n- [-] Estado personalizado\n\n\\- [ ] Escapada\n\n```md\n- [ ] Código\n~~bruto~~\n```\n\n<div>\n- [ ] HTML\n</div>\n\nFinal';
  await importNotes(page, { 'Tarefas.md': Buffer.from(source) });
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Tarefas.md', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.press('ControlOrMeta+End');
  await page
    .getByRole('button', { name: 'Edição visual', exact: true })
    .click();
  await expect(editor.getByRole('checkbox')).toHaveCount(4);
  const task = editor.getByRole('checkbox', {
    name: 'Tarefa: Comprar pão',
    exact: true,
  });
  const done = editor.getByRole('checkbox', {
    name: 'Tarefa: Feita',
    exact: true,
  });
  await expect(task).not.toBeChecked();
  await expect(done).toBeChecked();
  await expect(
    editor.getByRole('checkbox', { name: 'Tarefa: Ordenada', exact: true }),
  ).toBeChecked();
  await expect(editor.locator('.cm-live-strike')).toHaveText('Antigo');
  await expect(editor.locator('.cm-live-strike')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
  for (const literal of [
    '- [ ] YAML',
    '- [-] Estado personalizado',
    '\\- [ ] Escapada',
    '- [ ] Código',
    '~~bruto~~',
    '- [ ] HTML',
    '~literal~',
  ])
    await expect(editor).toContainText(literal);
  await task.click();
  await expect(task).toBeChecked();
  await expect(task).toBeFocused();
  await task.press('Space');
  await expect(task).not.toBeChecked();
  await expect(task).toBeFocused();
  await task.press('ControlOrMeta+z');
  await expect(task).toBeChecked();
  await task.press('ControlOrMeta+Shift+z');
  await expect(task).not.toBeChecked();
  await task.press('Space');
  await task.press('Tab');
  await expect(done).toBeFocused();
  await done.press('Space');
  await expect(done).not.toBeChecked();
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.'),
  ).toBeVisible();
  // Checkbox edits stay in the draft until explicit save.
  expect(Buffer.from((await exported(page))['Tarefas.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  await editor.press('ControlOrMeta+a');
  await expect(editor.getByRole('checkbox')).toHaveCount(0);
  await expect(editor).toContainText('- [x] Comprar pão');
  await expect(editor).toContainText('- [ ] Feita');
  await expect(editor).toContainText('~~Antigo~~');
  await editor.press('ControlOrMeta+End');
  // A preceding edit moves all widget positions. The next toggle must use the new offset.
  await editor.press('ControlOrMeta+Home');
  await editor.pressSequentially('intro ');
  await editor.press('ControlOrMeta+End');
  await done.click();
  await expect(done).toBeChecked();
  await done.press('ControlOrMeta+z');
  await expect(done).not.toBeChecked();
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('intro');
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
  const englishTask = editor.getByRole('checkbox', {
    name: 'Task: Comprar pão',
    exact: true,
  });
  await expect(englishTask).toBeChecked();
  // Saving from the checkbox uses the editor shortcut too.
  await englishTask.press('ControlOrMeta+s');
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Language').selectOption('pt-BR');
  const changed = source
    .replace('[ ] Comprar pão', '[x] Comprar pão')
    .replace('[X] Feita', '[ ] Feita');
  expect(Buffer.from((await exported(page))['Tarefas.md'] ?? [])).toEqual(
    Buffer.from(changed),
  );
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(editor).toContainText('- [x] Comprar pão');
  await expect(editor).toContainText('- [ ] Feita');
});

test('visual tables reveal source for keyboard and cell edits while preserving exact Markdown', async ({
  page,
}) => {
  const source =
    '\ufeff---\r\ntitle: tabela\n---\r\n\n| Nome | Centro | Valor |\r\n| :--- | :---: | ---: |\n| **Forte** | *Meio* | ` código ` |\r\n| | b\\|c | ~~Antigo~~ |\n| Curta |\n| [link](https://example.test) | <b>HTML</b> | &amp; |\n\n> | Citada | Valor |\n> | --- | --- |\n> | literal | 1 |\n\n```md\n| Código | Valor |\n| --- | --- |\n```\n\nFinal';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await importNotes(page, { 'Tabela.md': Buffer.from(source) });
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Tabela.md', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.evaluate((element) =>
    Reflect.set(window, 'tableEditor', element),
  );
  await editor.press('ControlOrMeta+End');
  await page
    .getByRole('button', { name: 'Edição visual', exact: true })
    .click();
  const table = editor.getByRole('table');
  await expect(table).toHaveCount(1);
  await expect(table.getByRole('columnheader')).toHaveText([
    'Nome',
    'Centro',
    'Valor',
  ]);
  await expect(table.getByRole('columnheader').nth(1)).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(table.getByRole('columnheader').nth(2)).toHaveCSS(
    'text-align',
    'right',
  );
  await expect(table.locator('strong')).toHaveText('Forte');
  await expect(table.locator('em')).toHaveText('Meio');
  await expect(table.locator('code')).toHaveText('código');
  await expect(table.locator('s')).toHaveText('Antigo');
  await expect(table.locator('tbody tr').nth(1).getByRole('cell')).toHaveText([
    '',
    'b|c',
    'Antigo',
  ]);
  await expect(table.locator('tbody tr').nth(2).getByRole('cell')).toHaveText([
    'Curta',
    '',
    '',
  ]);
  await expect(table.getByRole('link')).toHaveCount(0);
  await expect(table.locator('b, img')).toHaveCount(0);
  await expect(table).toContainText('<b>HTML</b>');
  await expect(table).toContainText('&amp;');
  await expect(editor).toContainText('> | Citada | Valor |');
  await expect(editor).toContainText('| Código | Valor |');
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
  const reveal = table.getByRole('button', {
    name: 'Show table Markdown',
    exact: true,
  });
  await reveal.focus();
  await reveal.press('Enter');
  await expect(table).toHaveCount(0);
  await expect(editor).toBeFocused();
  await editor.pressSequentially('Novo ');
  await expect(editor).toContainText('| Novo Nome | Centro | Valor |');
  await editor.press('ControlOrMeta+z');
  await editor.press('ControlOrMeta+End');
  await expect(table).toHaveCount(1);
  await page.getByLabel('Language').selectOption('pt-BR');
  expect(Buffer.from((await exported(page))['Tabela.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  await table.getByRole('cell', { name: 'b|c', exact: true }).click();
  await expect(table).toHaveCount(0);
  await editor.pressSequentially('novo ');
  await editor.press('ControlOrMeta+End');
  await expect(
    table.getByRole('cell', { name: 'novo b|c', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.'),
  ).toBeVisible();
  await editor.press('ControlOrMeta+a');
  await expect(table).toHaveCount(0);
  await expect(editor).toContainText('| | novo b\\|c | ~~Antigo~~ |');
  await editor.press('ControlOrMeta+End');
  for (const name of ['Editar', 'Ler', 'Edição e leitura', 'Edição visual'])
    await page.getByRole('button', { name, exact: true }).click();
  expect(
    await editor.evaluate(
      (element) => element === Reflect.get(window, 'tableEditor'),
    ),
  ).toBe(true);
  await editor.press('ControlOrMeta+s');
  await expect(
    page.getByText('Salvo no cofre.', { exact: true }),
  ).toBeVisible();
  expect(Buffer.from((await exported(page))['Tabela.md'] ?? [])).toEqual(
    Buffer.from(source.replace('b\\|c', 'novo b\\|c')),
  );
  expect(errors).toEqual([]);
});

test('visual tables keep oversized, nested and unterminated frontmatter tables as Markdown', async ({
  page,
}) => {
  const rows = `A | B\n--- | ---\n${'linha | valor\n'.repeat(200)}`;
  const columns = `${Array(33).fill('Coluna').join(' | ')}\n${Array(33).fill('---').join(' | ')}\n`;
  const budget = `${Array(25).fill('Coluna').join(' | ')}\n${Array(25).fill('---').join(' | ')}\n${`${Array(25).fill('valor').join(' | ')}\n`.repeat(99)}`;
  const small = '| Pequena |\n| --- |\n| visível |';
  const source = `${rows}\n${columns}\n${budget}\n${small}\n\nFinal`;
  await importNotes(page, {
    'Limites.md': Buffer.from(source),
    'YAML.md': Buffer.from(`---\n${small}\n\nFinal`),
  });
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Limites.md', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.press('ControlOrMeta+End');
  await page
    .getByRole('button', { name: 'Edição visual', exact: true })
    .click();
  await editor.press('ControlOrMeta+End');
  await expect(editor.getByRole('table')).toHaveCount(1);
  await expect(editor.getByRole('columnheader')).toHaveText('Pequena');
  expect(Buffer.from((await exported(page))['Limites.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'YAML.md', exact: true })
    .click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.press('ControlOrMeta+End');
  await expect(editor.getByRole('table')).toHaveCount(0);
  await expect(editor).toContainText('| Pequena |');
});
