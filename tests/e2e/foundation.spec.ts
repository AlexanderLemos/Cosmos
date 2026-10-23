import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('Web boots, switches language and theme without network services', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Toda ideia nasce no Caos.',
  );
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Every idea begins in Chaos.',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Theme').selectOption('hemera');
  await expect(page.locator('[data-theme]')).toHaveAttribute(
    'data-theme',
    'hemera',
  );
  expect(errors).toEqual([]);
});
for (const theme of ['nyx', 'hemera']) {
  test(`accessibility: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByLabel('Tema').selectOption(theme);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
