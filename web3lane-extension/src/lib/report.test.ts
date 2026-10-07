import test from 'node:test';
import assert from 'node:assert/strict';
import { reportHtml } from './report.ts';
test('HTML evidence escapes untrusted wallet and event content', () => {
  const html = reportHtml({ schemaVersion: 1, network: 'preprod', wallet: null, receipt: null, events: [{ id: '1', time: 'now', title: '<script>alert(1)</script>', detail: '<img src=x onerror=alert(1)>', status: 'error' }], verification: 'not-performed' });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Cryptographic verification was not performed'));
});
