import type { WalletSnapshot, SignatureReceipt } from './wallet';

export type LabEvent = { id: string; time: string; title: string; detail: string; status: 'info' | 'success' | 'error' };
export type Evidence = { schemaVersion: 1; network: 'preprod'; wallet: WalletSnapshot | null; receipt: SignatureReceipt | null; events: LabEvent[]; verification: 'not-performed' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function reportHtml(evidence: Evidence): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>web3lane · Wallet test receipt</title><style>body{font:16px/1.6 system-ui;background:#e8ebe6;color:#21351b;max-width:850px;margin:40px auto;padding:24px}h1,h2{color:#163300}article{padding:16px 0;border-bottom:1px solid #c8d1c4}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f9faf7;padding:24px}small{color:#5c6b57}</style></head><body><h1>Wallet test receipt</h1><p>web3lane · Cardano Preprod · ${evidence.receipt ? 'Signature returned by wallet' : 'No signature recorded'}</p><p>This receipt records wallet responses. Cryptographic verification was not performed. No transaction was signed or submitted.</p><h2>Session timeline</h2>${evidence.events.map(event => `<article><small>${escape(event.time)} · ${escape(event.status)}</small><h3>${escape(event.title)}</h3><p>${escape(event.detail)}</p></article>`).join('')}<h2>Machine-readable evidence</h2><pre>${escape(JSON.stringify(evidence, null, 2))}</pre></body></html>`;
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
