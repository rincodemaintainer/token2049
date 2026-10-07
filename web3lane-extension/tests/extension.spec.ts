import { test, expect, chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('built MV3 extension starts under its real content security policy', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'web3lane-extension-test-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/index.html`);
    await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.web3lane?.tools.length)).toBe(4);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('MAIN-world wallet rejection retains recovery details through Chrome', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'web3lane-bridge-test-'));
  const extension = resolve(root, 'extension');
  await cp(resolve('dist'), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  // Test-only localhost grant replaces the toolbar's activeTab gesture in headless Chromium.
  // The production manifest remains unchanged and has no host permissions.
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(resolve(root, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const dapp = await context.newPage();
    await dapp.addInitScript(() => {
      Object.assign(window, { cardano: { fixture: { name: 'Bridge fixture', supportedExtensions: [{ cip: 142 }], enable: async () => ({
        getNetworkId: async () => 0,
        getChangeAddress: async () => `60${'11'.repeat(28)}`,
        getBalance: async () => '1a05f5e100',
        getRewardAddresses: async () => [],
        cip142: { getNetworkMagic: async () => 1 },
        signData: async () => { throw { code: 2, info: 'User declined signing' }; },
      }) } } });
    });
    await dapp.goto('http://127.0.0.1:4173');
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${id}/index.html`);
    await expect(panel.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
    await dapp.bringToFront();
    // DOM clicks leave the dApp active, as it would be when using an actual side panel.
    await panel.evaluate(() => document.querySelector<HTMLButtonElement>('[data-action="wallet-connect"]')!.click());
    await expect(panel.getByRole('button', { name: 'Bridge fixture' })).toBeVisible();
    await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.provider')!.click());
    await expect(panel.getByText('100.00 tADA')).toBeVisible();
    await panel.evaluate(() => document.querySelector<HTMLButtonElement>('[data-action="signature-request"]')!.click());
    await expect(panel.getByRole('alert')).toContainText('declined');
    await expect(panel.getByText('Message signed. Handoff complete.')).toHaveCount(0);
  } finally {
    await context.close();
    await rm(root, { recursive: true, force: true });
  }
});
