import { test as base, devices } from '@playwright/test';

// WebKit's private contexts do not expose persistent origin storage. Exercise
// vaults with an isolated on-disk browser profile, as used by a regular window.
export const test = base.extend({
  context: async ({ context, browserName, playwright }, use, testInfo) => {
    if (browserName !== 'webkit') return use(context);
    const persistent = await playwright.webkit.launchPersistentContext(
      testInfo.outputPath('browser-profile'),
      {
        ...devices['Desktop Safari'],
        headless: true,
        acceptDownloads: true,
        baseURL: 'http://127.0.0.1:5173',
      },
    );
    try {
      await use(persistent);
    } finally {
      await persistent.close();
    }
  },
});
