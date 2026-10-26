import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { test } from './storage-fixture';

const png = await readFile(
  new URL('../fixtures/images/pixels.png', import.meta.url),
);

test('Obsidian image dimensions stay within the reading pane and never rewrite the source', async ({
  page,
}) => {
  const source =
    '\ufeff# Dimensões\r\n\r\nAntes ![[width.png|300]] depois.\n\n![[box.png|300x180]]\r\n\r\n![[invalid.png|4097]]\n';
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'sizes.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Nota.md': Buffer.from(source),
        'width.png': png,
        'box.png': png,
        'invalid.png': png,
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Nota.md' })
    .click();
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Leitura Markdown' });
  for (const name of ['width.png', 'box.png', 'invalid.png']) {
    await preview
      .getByRole('button', { name: `Mostrar imagem: ${name}`, exact: true })
      .click();
    await expect
      .poll(() =>
        preview
          .getByRole('img', { name, exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(2);
  }
  const width = preview.getByRole('img', { name: 'width.png', exact: true });
  const box = preview.getByRole('img', { name: 'box.png', exact: true });
  await expect(width).toHaveAttribute('width', '300');
  await expect(width).not.toHaveAttribute('height');
  expect(
    await width.evaluate((img) =>
      Math.round(img.getBoundingClientRect().height),
    ),
  ).toBe(150);
  await expect(box).toHaveAttribute('width', '300');
  await expect(box).toHaveAttribute('height', '180');
  await expect(box).toHaveCSS('object-fit', 'contain');
  await expect(
    preview.getByRole('img', { name: 'invalid.png', exact: true }),
  ).not.toHaveAttribute('width');
  await expect(preview).toContainText('Antes');
  await expect(preview).toContainText('depois.');
  const displayed = await width.getAttribute('src');
  await page
    .getByRole('button', { name: 'Edição e leitura', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('![[width.png|300]]');
  await expect(width).toHaveAttribute('src', displayed as string);
  await page.getByLabel('Idioma').selectOption('en');
  await expect(
    page.getByRole('img', { name: 'width.png', exact: true }),
  ).toHaveAttribute('width', '300');
  await page.setViewportSize({ width: 360, height: 720 });
  for (const name of ['width.png', 'box.png']) {
    const fits = await page
      .getByRole('img', { name, exact: true })
      .evaluate(
        (img) =>
          img.getBoundingClientRect().width <=
          (img.parentElement?.getBoundingClientRect().width ?? 0) + 1,
      );
    expect(fits).toBe(true);
    expect(
      await page
        .getByRole('img', { name, exact: true })
        .evaluate((img) => img.getBoundingClientRect().width),
    ).toBeLessThan(300);
  }
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export vault (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Nota.md'] ?? [])).toEqual(Buffer.from(source));
  expect(Buffer.from(archive['width.png'] ?? [])).toEqual(png);
});

test('local image attachments load only on request, preserve vault bytes and release blob URLs', async ({
  page,
}) => {
  const source =
    '\ufeff# Imagens\r\n\n![Local](assets/pixels.png)\n\n![Pai](../assets/raiz.png)\n\n![[única.png]]\n\n![Ausente](missing.png)\n\n![[duplicada.png]]\n\n![SVG renomeado](bad.png)\n\n![Grande](large.png)\n\n![Truncada](truncated.png)\n\n![Remota](https://images.invalid/a.png)\n\n![SVG](unsafe.svg)\n\n[![Ligada](assets/pixels.png)](https://example.org)\n';
  const requests: string[] = [];
  await page.route('https://images.invalid/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await page.evaluate(() => {
    const live = new Set<string>();
    Reflect.set(window, 'imageURLs', live);
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      live.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      live.delete(url);
      revoke(url);
    };
  });
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'images.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'Folder/Mapa.md': Buffer.from(source),
        'Outra.md': Buffer.from('# Outra'),
        'Folder/assets/pixels.png': png,
        'assets/raiz.png': png,
        'assets/única.png': png,
        'A/duplicada.png': png,
        'B/duplicada.png': png,
        'Folder/bad.png': Buffer.from(
          '<svg onload="window.imageExecuted=true"/>',
        ),
        'Folder/unsafe.svg': Buffer.from('<svg/>'),
        'Folder/large.png': new Uint8Array(8 * 1024 * 1024 + 1),
        'Folder/truncated.png': png.subarray(0, 8),
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
  await expect(preview.locator('img')).toHaveCount(0);
  for (const name of ['Local', 'Pai', 'única.png']) {
    await preview
      .getByRole('button', { name: `Mostrar imagem: ${name}`, exact: true })
      .click();
    await expect(preview.getByRole('img', { name, exact: true })).toBeVisible();
    await expect
      .poll(() =>
        preview
          .getByRole('img', { name, exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(2);
    await expect(
      preview.getByRole('img', { name, exact: true }),
    ).toHaveAttribute('src', /^blob:/);
  }
  for (const [name, message] of [
    ['Ausente', 'não foi encontrada'],
    ['duplicada.png', 'ambíguo'],
    ['SVG renomeado', 'Não foi possível exibir'],
    ['Grande', '8 MiB'],
    ['Truncada', 'Não foi possível exibir'],
  ]) {
    const button = preview.getByRole('button', {
      name: `Mostrar imagem: ${name}`,
      exact: true,
    });
    await button.click();
    await expect(button.locator('..').getByRole('status')).toContainText(
      message,
    );
  }
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() => Reflect.get(window, 'imageExecuted')),
  ).toBeUndefined();
  await expect(
    preview.getByRole('button', {
      name: /Mostrar imagem: (Remota|SVG|Ligada)$/,
    }),
  ).toHaveCount(0);
  await expect(preview.getByRole('link', { name: 'Ligada' })).toHaveAttribute(
    'href',
    'https://example.org/',
  );
  for (const theme of ['nyx', 'hemera']) {
    await page.getByLabel('Tema').selectOption(theme);
    await expect(
      preview.getByRole('img', { name: 'Local', exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await preview
    .getByRole('button', { name: 'Ocultar imagem: Local', exact: true })
    .click();
  await expect(
    preview.getByRole('img', { name: 'Local', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'Outra.md' })
    .click();
  await expect(preview.getByRole('heading', { name: 'Outra' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'imageURLs').size)).toBe(
    0,
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar cofre (.zip)' }).click();
  const archive = unzipSync(
    await readFile((await (await downloading).path()) as string),
  );
  expect(Buffer.from(archive['Folder/Mapa.md'] ?? [])).toEqual(
    Buffer.from(source),
  );
  expect(Buffer.from(archive['Folder/assets/pixels.png'] ?? [])).toEqual(png);
});

test('late image reads are discarded after cancellation or changing the note', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar cofre no navegador' }).click();
  await page.getByLabel('Importar ZIP', { exact: true }).setInputFiles({
    name: 'late.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'A.md': Buffer.from('![Lenta](delayed.png)'),
        'B.md': Buffer.from('# Destino'),
        'delayed.png': png,
      }),
    ),
  });
  await expect(
    page.getByText('Importação concluída sem alterar os originais.'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notas' })
    .getByRole('button', { name: 'A.md' })
    .click();
  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this);
      if (this.name === 'delayed.png')
        await new Promise<void>((resolve) =>
          Reflect.set(window, 'releaseImage', resolve),
        );
      return bytes;
    };
    const create = URL.createObjectURL.bind(URL);
    Reflect.set(window, 'imageURLsCreated', 0);
    URL.createObjectURL = (blob) => {
      Reflect.set(
        window,
        'imageURLsCreated',
        Reflect.get(window, 'imageURLsCreated') + 1,
      );
      return create(blob);
    };
  });
  const preview = page.getByRole('region', { name: 'Leitura Markdown' });
  for (const action of ['cancel', 'navigate']) {
    await preview
      .getByRole('button', { name: 'Mostrar imagem: Lenta', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => typeof Reflect.get(window, 'releaseImage')),
      )
      .toBe('function');
    if (action === 'cancel')
      await preview
        .getByRole('button', { name: 'Cancelar imagem: Lenta', exact: true })
        .click();
    else {
      await page
        .getByRole('navigation', { name: 'Notas' })
        .getByRole('button', { name: 'B.md' })
        .click();
      await expect(
        preview.getByRole('heading', { name: 'Destino' }),
      ).toBeVisible();
    }
    await page.evaluate(() => {
      Reflect.get(window, 'releaseImage')();
      Reflect.deleteProperty(window, 'releaseImage');
    });
    await expect(preview.locator('img')).toHaveCount(0);
    expect(
      await page.evaluate(() => Reflect.get(window, 'imageURLsCreated')),
    ).toBe(0);
  }
});
