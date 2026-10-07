import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const profile = path.resolve(process.env.ETERNL_TEST_PROFILE_DIR ?? '.local/eternl-qa-profile');
await mkdir(profile, { recursive: true, mode: 0o700 });
const context = await chromium.launchPersistentContext(profile, { headless: false });
const page = context.pages()[0] ?? await context.newPage();
await page.goto('https://eternl.io/');
const setup = page.getByRole('button', { name: 'Start setup' });
await setup.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
if (await setup.isVisible()) {
  await setup.click();
  await page.getByRole('button', { name: /Cardano mainnet/ }).last().click();
  await page.getByRole('button', { name: /Pre-Production testnet/ }).click();
  await page.locator('#modelSetupSettingsBtnNext').click();
}
console.log(`Eternl opened in Playwright Chromium. Profile: ${profile}`);
console.log('Complete PIN, Eternl terms, wallet setup, and Preprod funding yourself. No setup recording is enabled. Type done here when finished.');

const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const keepAlive = setInterval(() => {}, 60_000);
await new Promise(resolve => {
  input.on('line', line => { if (line.trim().toLowerCase() === 'done') resolve(); });
  process.once('SIGINT', resolve);
  process.once('SIGTERM', resolve);
});
clearInterval(keepAlive);
await context.close();
