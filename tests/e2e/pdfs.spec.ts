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

test('closing a PDF cancels late reads and releases its worker without losing the note', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'pdf.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Nota.md': Buffer.from('[Manual](manual.pdf)'),
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
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
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
