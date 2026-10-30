import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const pdf = await readFile(
  new URL('../fixtures/pdfs/two-pages.pdf', import.meta.url),
);

test('local PDFs open on demand with page navigation, text and keyboard focus while preserving notes and attachments', async ({
  page,
}) => {
  const source =
    '\ufeff# PDF\r\n\n[Manual](../assets/manual.pdf)\n\n![[manual.pdf#page=2|Segunda]]\n\n[[missing.pdf|Ausente]]\n\n[[duplicate.pdf|Ambíguo]]\n\n[Inválido](../bad.pdf)\n\n[Grande](../large.pdf)\n\n[[manual.pdf#page=3|Página ausente]]\n';
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  const remote: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:5173') &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      remote.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'pdfs.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Folder/Nota.md': Buffer.from(source),
        'assets/manual.pdf': pdf,
        'A/duplicate.pdf': pdf,
        'B/duplicate.pdf': pdf,
        'bad.pdf': Buffer.from('<html>Not a PDF</html>'),
        'large.pdf': new Uint8Array(16 * 1024 * 1024 + 1),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Folder/Nota.md' })
    .click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially('Rascunho PDF');
  await expect(editor).toContainText('Rascunho PDF');
  await page
    .getByRole('button', { name: 'Edição e leitura', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const manual = page.getByRole('button', {
    name: 'Abrir PDF: Manual',
    exact: true,
  });
  await manual.click();
  const reader = page.getByRole('dialog', { name: 'Leitor de PDF' });
  await expect(
    reader.getByRole('img', { name: 'Página 1 do PDF' }),
  ).toBeVisible();
  expect(
    await reader.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext('2d')
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels?.some((value, index) => index % 4 !== 3 && value < 128);
    }),
  ).toBe(true);
  await reader.getByText('Texto da página', { exact: true }).click();
  await expect(reader).toContainText('COSMOS PDF first page');
  await reader.getByRole('button', { name: 'Próxima página' }).click();
  await expect(
    reader.getByRole('img', { name: 'Página 2 do PDF' }),
  ).toBeVisible();
  await expect(reader).toContainText('COSMOS PDF second page');
  await expect(
    reader.getByRole('button', { name: 'Próxima página' }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(manual).toBeFocused();
  await expect(editor).toContainText('Rascunho PDF');
  await page
    .getByRole('button', { name: 'Abrir PDF: Segunda', exact: true })
    .click();
  await expect(
    reader.getByRole('img', { name: 'Página 2 do PDF' }),
  ).toBeVisible();
  await reader.getByRole('button', { name: 'Fechar PDF' }).click();
  for (const [name, message] of [
    ['Ausente', 'não foi encontrado'],
    ['Ambíguo', 'ambíguo'],
    ['Inválido', 'Não foi possível exibir'],
    ['Grande', '16 MiB'],
    ['Página ausente', 'não existe'],
  ]) {
    await page
      .getByRole('button', { name: `Abrir PDF: ${name}`, exact: true })
      .click();
    await expect(reader.getByRole('alert')).toContainText(message as string);
    await reader.getByRole('button', { name: 'Fechar PDF' }).click();
  }
  expect(dialogs).toBe(0);
  expect(remote).toEqual([]);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Folder/Nota.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  expect(Buffer.from(archive['assets/manual.pdf'] ?? [])).toEqual(pdf);
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Rascunho PDF');
});

for (const mode of ['Ler', 'Edição visual']) {
  test(`closing a PDF in ${mode} cancels late reads and releases its worker without losing the note`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
    await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
      name: 'pdf.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync({
          'Nota.md': Buffer.from('[Manual](manual.pdf)\n\nFinal'),
          'manual.pdf': pdf,
        }),
      ),
    });
    await expect(
      page.getByText('Importação concluída sem alterar os originais.'),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Notas' })
      .getByRole('button', { name: 'Nota.md', exact: true })
      .click();
    await expect(page.locator('.cm-content')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    await page.locator('.cm-content').press('ControlOrMeta+End');
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.evaluate(() => {
      Reflect.set(window, 'pdfWorkers', new Set<Worker>());
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (String(url).includes('pdf.worker'))
            Reflect.get(window, 'pdfWorkers').add(this);
        }
        terminate() {
          Reflect.get(window, 'pdfWorkers').delete(this);
          super.terminate();
        }
      };
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        if (this.name === 'manual.pdf')
          await new Promise<void>((resolve) =>
            Reflect.set(window, 'releasePdf', resolve),
          );
        return read.call(this);
      };
    });
    const open = page.getByRole('button', {
      name: 'Abrir PDF: Manual',
      exact: true,
    });
    await open.click();
    await expect
      .poll(() => page.evaluate(() => typeof Reflect.get(window, 'releasePdf')))
      .toBe('function');
    await page.getByRole('button', { name: 'Fechar PDF' }).click();
    await page.evaluate(() => Reflect.get(window, 'releasePdf')());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() => Reflect.get(window, 'pdfWorkers').size),
    ).toBe(0);
    await page.evaluate(() => Reflect.deleteProperty(window, 'releasePdf'));
    await open.click();
    await expect
      .poll(() => page.evaluate(() => typeof Reflect.get(window, 'releasePdf')))
      .toBe('function');
    await page.evaluate(() => Reflect.get(window, 'releasePdf')());
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    expect(
      await page.evaluate(() => Reflect.get(window, 'pdfWorkers').size),
    ).toBe(1);
    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'pdfWorkers').size))
      .toBe(0);
    await expect(open).toBeFocused();
  });
}

test('visual PDF controls preserve source, drafts and editor identity with native modal focus', async ({
  page,
}) => {
  const source =
    '\ufeff---\r\nlink: [[manual.pdf|YAML]]\n---\r\n\n[Manual](assets/manual.pdf)\n\n[[manual.pdf#page=2|Segunda]]\r\n\n![[manual.pdf|Embed]]\n\n[[missing.pdf|Ausente]]\n\n\\![[manual.pdf|Escapado]]\n\n`[[manual.pdf|Código]]`\n\n[Remoto](https://example.com/manual.pdf)\n\n![[Rótulo](assets/manual.pdf)](imagem.png)\n\nFinal';
  const protectedSource =
    '# Protegida\n\n![[manual.pdf#page=2|Protegido]]\n\nFinal';
  const remote: string[] = [];
  page.on('request', (request) => {
    if (!/^(http:\/\/127\.0\.0\.1:5173|blob:|data:)/.test(request.url()))
      remote.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'visual-pdf.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Nota.md': Buffer.from(source),
        'assets/manual.pdf': pdf,
        'Projeto/project.cosmos.json': Buffer.from('{}'),
        'Projeto/Nota.md': Buffer.from(protectedSource),
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  const notes = page.getByRole('navigation', { name: 'Notas' });
  await notes.getByRole('button', { name: 'Nota.md', exact: true }).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.evaluate((element) => Reflect.set(window, 'pdfEditor', element));
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially(' rascunho');
  await expect(
    page.getByText('Rascunho protegido neste dispositivo.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Edição visual', exact: true })
    .click();
  await expect(editor.locator('.cm-live-link-open')).toHaveText([
    'Abrir PDF: Manual',
    'Abrir PDF: Segunda',
    'Abrir PDF: Embed',
    'Abrir PDF: Ausente',
  ]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await editor
    .getByRole('button', {
      name: 'Mostrar Markdown do link: Embed',
      exact: true,
    })
    .click();
  await expect(editor).toContainText('![[manual.pdf|Embed]]');
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+End');
  const manual = editor.getByRole('button', {
    name: 'Abrir PDF: Manual',
    exact: true,
  });
  await manual.press('Enter');
  const reader = page.getByRole('dialog', { name: 'Leitor de PDF' });
  await expect(
    reader.getByRole('img', { name: 'Página 1 do PDF' }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(manual).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Edição visual', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Tema').selectOption('hemera');
  await editor
    .getByRole('button', { name: 'Abrir PDF: Segunda', exact: true })
    .click();
  await expect(
    reader.getByRole('img', { name: 'Página 2 do PDF' }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await reader.getByRole('button', { name: 'Fechar PDF' }).click();
  await expect(
    editor.getByRole('button', { name: 'Abrir PDF: Segunda', exact: true }),
  ).toBeFocused();
  await editor
    .getByRole('button', { name: 'Abrir PDF: Ausente', exact: true })
    .click();
  await expect(reader.getByRole('alert')).toContainText('não foi encontrado');
  await reader.getByRole('button', { name: 'Fechar PDF' }).click();
  expect(
    await editor.evaluate(
      (element) => element === Reflect.get(window, 'pdfEditor'),
    ),
  ).toBe(true);
  await expect(editor).toContainText('Final rascunho');
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('rascunho');
  await notes
    .getByRole('button', { name: 'Projeto/Nota.md', exact: true })
    .click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await page.getByLabel('Idioma').selectOption('en');
  await editor
    .getByRole('button', { name: 'Open PDF: Protegido', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'PDF page 2' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  expect(remote).toEqual([]);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export vault (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Nota.md'] ?? [])).toEqual(Buffer.from(source));
  expect(Buffer.from(archive['Projeto/Nota.md'] ?? [])).toEqual(
    Buffer.from(protectedSource),
  );
  expect(Buffer.from(archive['assets/manual.pdf'] ?? [])).toEqual(pdf);
});
