import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

test('reading and split views preserve source bytes, drafts and undo; note and heading links navigate safely', async ({
  page,
}) => {
  const source =
    '\ufeff---\r\naliases: [mapa]\n---\r\n# Mapa\n\n**Forte** e *ênfase* e ~~antigo~~.\r\n\n- [x] Feita\n- [ ] Pendente\n\n| Coluna | Valor |\n| --- | --- |\n| Ideia | 42 |\n\n> Uma citação\n\n```js\nconst answer = 42;\n```\n\n[[Órbita#Próximos passos|Ir à órbita]]\n\n[Seção local](#detalhes)\n\n[Ausente](#inexistente)\n\n[[Inexistente]]\n\n## Detalhes\nTexto final.\n';
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'preview.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Folder/Mapa.md': Buffer.from(source),
        'Folder/Órbita.md': Buffer.from(
          '# Órbita\n\n## Próximos passos\nDestino.\n\n[Voltar](Mapa.md#Detalhes)',
        ),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Folder/Mapa.md' })
    .click();
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Leitura Markdown' });
  await expect(page.locator('.cm-content')).toBeHidden();
  await expect(preview.locator('strong')).toHaveText('Forte');
  await expect(preview.locator('em')).toHaveText('ênfase');
  await expect(preview.locator('del')).toHaveText('antigo');
  await expect(preview.getByRole('table')).toContainText('42');
  await expect(
    preview.getByRole('img', { name: 'Tarefa concluída' }),
  ).toBeVisible();
  await expect(preview.locator('pre code')).toHaveText('const answer = 42;\n');
  await expect(
    preview.getByRole('button', {
      name: 'Inexistente · não resolvido',
      exact: true,
    }),
  ).toBeDisabled();
  await preview.getByRole('button', { name: 'Ausente' }).click();
  await expect(preview.getByRole('status')).toContainText('não foi encontrada');
  await preview.getByRole('button', { name: 'Seção local' }).click();
  await expect(
    preview.getByRole('heading', { name: 'Detalhes' }),
  ).toBeFocused();
  await preview.getByRole('button', { name: 'Ir à órbita' }).click();
  await expect(
    preview.getByRole('heading', { name: 'Próximos passos' }),
  ).toBeFocused();
  await preview.getByRole('button', { name: 'Voltar' }).click();
  await expect(
    preview.getByRole('heading', { name: 'Detalhes' }),
  ).toBeFocused();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Folder/Mapa.md'] ?? []).toString()).toBe(source);
  await page
    .getByRole('button', { name: 'Edição e leitura', exact: true })
    .click();
  const editor = page.locator('.cm-content');
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('Rascunho vivo');
  await expect(preview).toContainText('Rascunho vivo');
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await preview.getByRole('button', { name: 'Ir à órbita' }).click();
  await expect(preview).toContainText('Rascunho vivo');
  await page.getByLabel('Idioma').selectOption('en');
  await page.getByLabel('Theme').selectOption('hemera');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toContainText('Rascunho vivo');
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Rascunho vivo');
  await page
    .getByRole('button', { name: 'Edit and read', exact: true })
    .click();
  for (const theme of ['nyx', 'hemera']) {
    await page.getByLabel('Theme').selectOption(theme);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});

test('imported Markdown never executes HTML or requests embedded remote resources', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('https://preview.invalid/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Caminho da nota').fill('Untrusted.md');
  await page.getByRole('button', { name: 'Criar nota', exact: true }).click();
  await expect(page.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await page
    .locator('.cm-content')
    .fill(
      '# Conteúdo importado\n\n<script>window.previewExecuted = true</script>\n\n<img src="https://preview.invalid/raw" onerror="window.previewExecuted = true">\n\n<iframe src="https://preview.invalid/frame"></iframe>\n\n![Remota](https://preview.invalid/image.png)\n\n![Local](file:///tmp/private.png)\n\n[Script](javascript:alert%281%29)\n\n[Arquivo](file:///tmp/private.md)\n\n[Web](https://example.org)\n\n`[[literal]]` ![[embed]]',
    );
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Leitura Markdown' });
  await expect(
    preview.getByRole('heading', { name: 'Conteúdo importado' }),
  ).toBeVisible();
  await expect(
    preview.locator('script, iframe, img, object, style'),
  ).toHaveCount(0);
  await expect(
    preview.getByRole('button', { name: 'Script · não resolvido' }),
  ).toBeDisabled();
  await expect(
    preview.getByRole('button', { name: 'Arquivo · não resolvido' }),
  ).toBeDisabled();
  await expect(preview.getByRole('link', { name: 'Web' })).toHaveAttribute(
    'rel',
    'noreferrer noopener',
  );
  await expect(preview).toContainText('Imagem: Remota');
  await expect(preview).toContainText('![[embed]]');
  await expect(preview).not.toContainText('window.previewExecuted');
  expect(
    await page.evaluate(() => Reflect.get(window, 'previewExecuted')),
  ).toBeUndefined();
  expect(requests).toEqual([]);
});
