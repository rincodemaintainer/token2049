import { test, expect, type Page } from '@playwright/test';

async function mockWallet(page: Page, magic: number | null = 1, reject = false) {
  await page.addInitScript(({ magic, reject }) => {
    const fixture = {
      name: 'Test wallet',
      supportedExtensions: magic === null ? [] : [{ cip: 142 }],
      enable: async () => ({
        getNetworkId: async () => 0,
        getChangeAddress: async () => `60${'11'.repeat(28)}`,
        getBalance: async () => '1a05f5e100',
        getRewardAddresses: async () => [],
        ...(magic !== null ? { cip142: { getNetworkMagic: async () => magic } } : {}),
        signData: async (_address: string, _payload: string) => {
          await new Promise(resolve => setTimeout(resolve, 150));
          if (reject) throw { code: 2, info: 'User declined signing' };
          return { signature: 'abcd', key: '1234' };
        },
      }),
    };
    Object.assign(window, { cardano: { testwallet: fixture } });
  }, { magic, reject });
}

async function connect(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Test wallet', exact: true }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}

test('Preprod connection, signature loading, receipt export and disconnect', async ({ page }) => {
  await mockWallet(page); await connect(page);
  await expect(page.getByText('100.00 tADA')).toBeVisible();
  await page.getByRole('button', { name: 'Approve & request signature' }).click();
  await expect(page.getByRole('button', { name: 'Waiting for wallet approval…' })).toBeDisabled();
  await expect(page.getByText('Message signed. Handoff complete.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download receipt' }).click();
  expect((await download).suggestedFilename()).toBe('web3lane-receipt.html');
  await page.getByRole('button', { name: 'Disconnect wallet' }).click();
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
});

for (const magic of [2, null]) test(`blocks signing when network magic is ${magic}`, async ({ page }) => {
  await mockWallet(page, magic); await connect(page);
  await expect(page.getByRole('button', { name: 'Approve & request signature' })).toBeDisabled();
  await expect(page.getByText(/Signing is blocked/)).toBeVisible();
});

test('wallet rejection recovers without a success receipt', async ({ page }) => {
  await mockWallet(page, 1, true); await connect(page);
  await page.getByRole('button', { name: 'Approve & request signature' }).click();
  await expect(page.getByRole('alert')).toContainText(/declined/);
  await expect(page.getByRole('button', { name: 'Approve & request signature' })).toBeEnabled();
  await expect(page.getByText('Message signed. Handoff complete.')).toHaveCount(0);
});

test('agent prepares but cannot sign; changed message clears old receipt', async ({ page }) => {
  await mockWallet(page); await connect(page);
  const response = await page.evaluate(() => window.web3lane!.call('signature.prepare', { message: 'An agent prepared this test.' }));
  expect(response).toMatchObject({ status: 'awaiting-human-review' });
  await expect(page.getByLabel('Message to sign')).toHaveValue('An agent prepared this test.');
  expect(await page.evaluate(() => window.web3lane!.call('signature.sign').catch((error: Error) => error.message))).toContain('Unknown tool');
  await page.getByRole('button', { name: 'Approve & request signature' }).click();
  await expect(page.getByText('Message signed. Handoff complete.')).toBeVisible();
  await page.getByLabel('Message to sign').fill('New message');
  await expect(page.getByText('Message signed. Handoff complete.')).toHaveCount(0);
});

test('failed refresh preserves the prior signature receipt', async ({ page }) => {
  await mockWallet(page); await connect(page);
  await page.getByRole('button', { name: 'Approve & request signature' }).click();
  await expect(page.getByText('Message signed. Handoff complete.')).toBeVisible();
  await page.evaluate(() => { window.cardano!.testwallet!.enable = async () => { throw new Error('Wallet is locked'); }; });
  await page.getByRole('button', { name: 'Refresh wallet', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Wallet is locked');
  await expect(page.getByText('Message signed. Handoff complete.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download receipt' })).toBeEnabled();
});

test('changing network updates the UI before any signature request', async ({ page }) => {
  await mockWallet(page); await connect(page);
  await page.evaluate(() => {
    const provider = window.cardano!.testwallet!;
    const original = provider.enable;
    provider.enable = async options => { const api = await original(options); api.cip142!.getNetworkMagic = async () => 2; return api; };
  });
  await page.getByRole('button', { name: 'Approve & request signature' }).click();
  await expect(page.getByRole('alert')).toContainText('account or network changed');
  await expect(page.getByText('Preview · unsupported')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve & request signature' })).toBeDisabled();
});

test('leaving the panel marks its wallet snapshot stale', async ({ page }) => {
  await mockWallet(page); await connect(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Approve & request signature' })).toBeDisabled();
  await expect(page.getByText('Wallet state may have changed.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh wallet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve & request signature' })).toBeEnabled();
});

test('no wallet state and responsive layouts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByText(/No wallet found on this page/)).toBeVisible();
  await page.getByRole('button', { name: 'Close wallet picker' }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1080 : 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tests/screenshots/wallet-lab-${width}.png`, fullPage: true });
  }
});
