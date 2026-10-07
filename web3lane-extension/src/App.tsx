import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight, Circle, Code2, Copy, Fingerprint, FlaskConical, Globe2, Info, LoaderCircle, LockKeyhole, Plug, RotateCcw, ShieldCheck, Unplug, Wallet, X } from 'lucide-react';
import { connectWallet, discoverWallets, refreshWallet, signMessage, type SignatureReceipt, type WalletProvider, type WalletSnapshot } from './lib/wallet';
import { downloadFile, reportHtml, type Evidence, type LabEvent } from './lib/report';
import { runChecks } from './lib/checks';

type Tab = 'session' | 'activity' | 'guide';
type Busy = 'discover' | 'connect' | 'refresh' | 'sign' | null;
const DEFAULT_MESSAGE = 'I am testing my wallet connection with web3lane.';
const toolDefinitions = [
  { name: 'session.inspect', description: 'Read the current wallet, network, approval state and evidence.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'wallet.discover', description: 'List CIP-30 wallets on the active dApp tab. Does not connect.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'signature.prepare', description: 'Prepare a test message for human review. Cannot sign.', inputSchema: { type: 'object', properties: { message: { type: 'string', minLength: 1, maxLength: 160 } }, required: ['message'], additionalProperties: false } },
  { name: 'receipt.read', description: 'Return structured evidence for this session.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];
declare global { interface Window { web3lane?: { version: string; tools: typeof toolDefinitions; call: (name: string, args?: { message?: string }) => Promise<unknown> } } }
const formatAda = (value: string) => `${(BigInt(value) / 1000000n).toLocaleString()}.${(BigInt(value) % 1000000n).toString().padStart(6, '0').slice(0, 2)}`;

export default function App() {
  const [tab, setTab] = useState<Tab>('session');
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [receipt, setReceipt] = useState<SignatureReceipt | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [challenge, setChallenge] = useState<{ nonce: string; issuedAt: string } | null>(null);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const [walletStale, setWalletStale] = useState(false);
  const lock = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preprod = wallet?.networkId === 0 && wallet?.networkMagic === 1;
  const messageValid = message.trim().length > 0 && new TextEncoder().encode(message).length <= 160;
  const payload = wallet && challenge ? `web3lane wallet connection test\nNetwork: Cardano Preprod\nOrigin: ${wallet.origin}\nNonce: ${challenge.nonce}\nIssued at: ${challenge.issuedAt}\nMessage: ${message}` : '';
  const evidence: Evidence = { schemaVersion: 1, network: 'preprod', wallet, receipt, events, verification: 'not-performed' };
  const state = { connected: Boolean(wallet), walletStale, observedAt: wallet?.observedAt, network: preprod ? 'preprod' : wallet ? 'unsupported-or-unconfirmed' : 'not-connected', busy, needsHumanApproval: Boolean(wallet && !receipt), message, payload, checks: wallet ? runChecks(wallet) : [], evidence };

  function log(title: string, detail: string, status: LabEvent['status'] = 'info') {
    setEvents(previous => [...previous, { id: crypto.randomUUID(), time: new Date().toISOString(), title, detail, status }]);
  }
  function renewChallenge() { setChallenge({ nonce: crypto.randomUUID(), issuedAt: new Date().toISOString() }); }
  async function operation<T>(kind: Busy, action: () => Promise<T>) {
    if (lock.current) return;
    lock.current = true; setBusy(kind); setError('');
    try { return await action(); }
    catch (cause) { const detail = cause instanceof Error ? cause.message : 'The wallet request failed. Please try again.'; setError(detail); log('Request stopped', detail, 'error'); }
    finally { lock.current = false; setBusy(null); }
  }
  async function discover() {
    await operation('discover', async () => {
      const found = await discoverWallets(); setProviders(found); setPicker(true);
      log('Wallet discovery', `${found.length} wallet provider${found.length === 1 ? '' : 's'} found on the active page.`);
    });
  }
  async function connect(id: string) {
    await operation('connect', async () => {
      log('Connection requested', 'Waiting for permission in your wallet.');
      const connected = await connectWallet(id);
      setWallet(connected); setWalletStale(false); setReceipt(null); renewChallenge(); setPicker(false);
      log('Wallet connected', `${connected.walletName} · ${connected.origin} · network magic ${connected.networkMagic ?? 'unavailable'}`, 'success');
    });
  }
  async function refresh() {
    if (!wallet) return;
    await operation('refresh', async () => {
      setWalletStale(true);
      const current = await refreshWallet(wallet); setWallet(current); setWalletStale(false); setReceipt(null); renewChallenge();
      log('Wallet refreshed', 'Account and network read again from the connected tab.', 'success');
    });
  }
  async function sign() {
    if (!wallet || !preprod || walletStale || !messageValid || !challenge) return;
    await operation('sign', async () => {
      if (Date.now() - Date.parse(challenge.issuedAt) > 5 * 60 * 1000) {
        renewChallenge(); throw new Error('The test message expired. Review the refreshed message, then request the signature again.');
      }
      const current = await refreshWallet(wallet).catch(cause => { setWalletStale(true); throw cause; });
      setWallet(current);
      if (current.signingAddress !== wallet.signingAddress || current.networkId !== wallet.networkId || current.networkMagic !== wallet.networkMagic) {
        setReceipt(null); renewChallenge();
        throw new Error('Your wallet account or network changed. Review the updated wallet and message before requesting a signature.');
      }
      setReceipt(null); log('Signature requested', 'Message reviewed. Waiting for your approval in the wallet.');
      const result = await signMessage(current, payload); setReceipt(result);
      log('Signature returned', 'Wallet returned a COSE signature and public key. Cryptographic verification has not been performed.', 'success');
    });
  }
  function disconnect() {
    if (lock.current) return;
    setWallet(null); setReceipt(null); setChallenge(null); setError(''); setPicker(false);
    log('Session disconnected', 'Local connection cleared. Revoke site access inside your wallet if needed.');
  }
  function editMessage(value: string) { setMessage(value); setReceipt(null); renewChallenge(); }
  async function copyEvidence() {
    try { await navigator.clipboard.writeText(JSON.stringify(evidence, null, 2)); setCopied(true); copyTimer.current = setTimeout(() => setCopied(false), 2000); }
    catch { setError('Clipboard unavailable. Download the JSON receipt instead.'); }
  }
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => {
    const markStale = () => { if (wallet && !lock.current) setWalletStale(true); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') markStale(); };
    window.addEventListener('blur', markStale);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('blur', markStale); document.removeEventListener('visibilitychange', onVisibility); };
  }, [wallet]);
  useEffect(() => {
    window.web3lane = { version: '1.0', tools: toolDefinitions, call: async (name, args = {}) => {
      if (name === 'session.inspect') return state;
      if (name === 'receipt.read') return evidence;
      if (name === 'wallet.discover') return discoverWallets();
      if (name === 'signature.prepare') {
        if (lock.current) throw new Error('A wallet request is in progress.');
        if (typeof args.message !== 'string' || !args.message.trim() || new TextEncoder().encode(args.message).length > 160) throw new Error('Provide a message between 1 and 160 UTF-8 bytes.');
        editMessage(args.message); setTab('session');
        log('Agent prepared a message', 'Human review and wallet approval are required.');
        return { status: 'awaiting-human-review', message: args.message };
      }
      throw new Error('Unknown tool. Signing is available only through the review button.');
    } };
    return () => { delete window.web3lane; };
  });

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setTab('session'); }} aria-label="web3lane home"><img src="./mark.svg" alt="" width="36" height="36" /><span>web3lane<span className="brand-dot">.</span></span></a>
      <div className="workspace-label"><span className="status-dot" /> Developer workspace</div>
      <nav aria-label="Main navigation">
        <button className={tab === 'session' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('session')}><FlaskConical size={19} /> Wallet lab <ChevronRight className="nav-arrow" size={15} /></button>
        <button className={tab === 'activity' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('activity')}><RotateCcw size={19} /> Activity {events.length > 0 && <span className="count">{events.length}</span>}</button>
        <button className={tab === 'guide' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('guide')}><Code2 size={19} /> Agent guide</button>
      </nav>
      <div className="sidebar-bottom"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} /> Your wallet. Your approval.</div><p>Agents prepare the next step.<br />You stay in control of signatures.</p><div className="version">LOCAL WORKSPACE <span>v0.1</span></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={13} /><strong>{tab === 'session' ? 'Wallet lab' : tab === 'activity' ? 'Activity' : 'Agent guide'}</strong></div><span className="network-badge"><span className="status-dot" /> Cardano Preprod</span></header>
      <main id="main-content">
        <div className="page-heading"><div><h1>{tab === 'session' ? 'A good connection\nstarts here.' : tab === 'activity' ? 'Every step, accounted for.' : 'Built for your agent, too.'}</h1><p>{tab === 'session' ? 'Connect your wallet. Test a signature. See exactly what happened.' : tab === 'activity' ? 'A local trail of requests, approvals, and wallet responses.' : 'Structured actions, readable state, and a human at the signing step.'}</p></div><div className="lab-stamp"><FlaskConical size={19} /><span>Wallet lab<br /><strong>Preprod only</strong></span></div></div>

        {error && <div className="error-banner" role="alert"><Info size={19} /><div><strong>Let’s get you unstuck</strong><p>{error}</p></div><button aria-label="Dismiss error" onClick={() => setError('')}><X size={18} /></button></div>}

        {tab === 'session' && <>
          <div className="session-grid">
            <section className="runbook" aria-labelledby="runbook-title">
              <div className="section-top"><h2 id="runbook-title">Your wallet test</h2><span className="subtle">{receipt ? '2 of 2 complete' : wallet ? '1 of 2 complete' : 'Ready when you are'}</span></div>
              <section className="run-step" aria-labelledby="connect-title">
                <div className={`step-number ${wallet ? 'complete' : ''}`}>{wallet ? <Check size={17} /> : '1'}</div>
                <div className="step-content"><div className="step-heading"><h3 id="connect-title">Connect a wallet</h3><span className={`small-status ${wallet ? 'success' : ''}`}>{wallet ? walletStale ? 'Refresh needed' : 'Connected' : 'Start here'}</span></div><p>Open a dApp in this browser, then connect its Cardano wallet. Switch your wallet to Preprod first.</p>
                  {!wallet ? <><button className="button primary" data-action="wallet-connect" disabled={!!busy} onClick={discover}>{busy === 'discover' || busy === 'connect' ? <LoaderCircle className="spin" size={18} /> : <Wallet size={18} />}{busy === 'connect' ? 'Approve in your wallet…' : busy === 'discover' ? 'Looking for wallets…' : 'Connect wallet'}{!busy && <ArrowRight size={17} />}</button><span className="button-note">Connection requests account access only.</span></> : <div className="connected-wallet"><div className="wallet-symbol"><Wallet size={21} /></div><div><strong>{wallet.walletName}</strong><span>{walletStale ? 'Refresh wallet to continue' : preprod ? 'Last checked: Preprod' : wallet.networkId === 1 ? 'Mainnet · unsupported' : wallet.networkMagic === 2 ? 'Preview · unsupported' : 'Preprod not confirmed'}</span></div><button className="icon-button" disabled={!!busy} onClick={refresh} aria-label="Refresh wallet">{busy === 'refresh' ? <LoaderCircle className="spin" size={18} /> : <RotateCcw size={18} />}</button><button className="icon-button" disabled={!!busy} onClick={disconnect} aria-label="Disconnect wallet"><Unplug size={18} /></button></div>}
                  {picker && !wallet && <div className="wallet-picker"><div className="flex items-center justify-between"><strong>Choose your wallet</strong><button className="icon-button" aria-label="Close wallet picker" disabled={!!busy} onClick={() => setPicker(false)}><X size={16} /></button></div>{providers.length ? providers.map(provider => <button key={provider.id} className="provider" disabled={!!busy} onClick={() => connect(provider.id)}><Wallet size={18} /><span>{provider.name}</span><ArrowRight size={16} /></button>) : <div className="empty-wallet"><p>No wallet found on this page. Open a normal HTTPS dApp tab with a CIP-30 wallet installed, then click the extension icon again.</p><button className="text-button" disabled={!!busy} onClick={discover}>Try again <RotateCcw size={14} /></button></div>}</div>}
                </div>
              </section>
              <section className={`run-step ${!wallet ? 'waiting' : ''}`} aria-labelledby="sign-title">
                <div className={`step-number ${receipt ? 'complete' : ''}`}>{receipt ? <Check size={17} /> : '2'}</div><div className="step-content"><div className="step-heading"><h3 id="sign-title">Try a message signature</h3><span className={`small-status ${receipt ? 'success' : ''}`}>{receipt ? 'Received' : wallet ? 'Your approval' : 'Up next'}</span></div><p>A small message to test the wallet handoff. No transaction, fees, or funds moved.</p>
                  <label htmlFor="test-message" className="field-label">Message to sign</label><textarea id="test-message" value={message} disabled={!!busy} onChange={event => editMessage(event.target.value)} rows={3} aria-describedby="message-help" />
                  <div id="message-help" className="field-hint"><span>{messageValid ? 'A unique nonce and page origin are added.' : 'Enter 1–160 UTF-8 bytes.'}</span><span>{new TextEncoder().encode(message).length}/160</span></div>
                  {walletStale && <div className="network-warning"><Info size={17} /><p>Wallet state may have changed. Use Refresh wallet above to recheck the account and network.</p></div>}
                  {wallet && !preprod && <div className="network-warning"><Info size={17} /><p>{wallet.networkMagic === null ? 'This wallet cannot confirm Preprod. Use a wallet with CIP-142 network detection, then reconnect.' : 'Only Preprod is supported. Switch your wallet to Preprod, then refresh.'} Signing is blocked.</p></div>}
                  {wallet && <details className="payload-review" open><summary>Review exact signing payload <Fingerprint size={15} /></summary><pre>{payload}</pre></details>}
                  <button className="button secondary" data-action="signature-request" disabled={!preprod || walletStale || !messageValid || !!busy || !!receipt} onClick={sign}>{busy === 'sign' ? <LoaderCircle className="spin" size={18} /> : receipt ? <CheckCircle2 size={18} /> : <Fingerprint size={18} />}{busy === 'sign' ? 'Waiting for wallet approval…' : receipt ? 'Signature received' : 'Approve & request signature'}{!receipt && !busy && <ArrowRight size={17} />}</button>
                  {!wallet && <span className="button-note"><LockKeyhole size={12} /> Connect your wallet to continue</span>}
                  {busy === 'sign' && <p className="pending-note" role="status">Open your wallet’s request window. Approve or reject there to finish this step.</p>}
                  {receipt && <div className="receipt-success" role="status"><CheckCircle2 size={19} /><div><strong>Message signed. Handoff complete.</strong><p>Signature and public key received. Cryptographic verification was not performed.</p><button className="text-button" onClick={() => downloadFile('web3lane-receipt.html', reportHtml(evidence), 'text/html')}>Download receipt <ArrowDownToLine size={14} /></button></div></div>}
                </div>
              </section>
              <div className="runbook-footer"><ShieldCheck size={16} /><span>Every signature is approved in your wallet.</span></div>
            </section>

            <aside className="context-column" aria-label="Session context">
              <section className="agent-note"><div className="agent-note-heading"><span className="agent-mark"><Plug size={18} /></span><strong>Your next move</strong><span className="live-indicator" /></div><h2>{busy ? 'Your wallet has the floor.' : receipt ? 'You’re connected.\nAnd you have proof.' : wallet ? preprod && !walletStale ? 'Ready for a\nlittle handshake.' : 'One network\ncheck to resolve.' : 'Let’s meet\nyour wallet.'}</h2><p>{busy ? 'The request is in progress. We’ll update this session when your wallet responds.' : receipt ? 'Keep the receipt for your agent or QA report. Your signature stays local until you export it.' : wallet ? preprod && !walletStale ? 'Review the exact message, then ask your wallet to sign it. You approve the final request.' : 'We need confirmed Preprod before requesting a signature. Check the wallet status for the next step.' : 'Start with a connection. We’ll check the network and prepare a message for you to review.'}</p><div className="agent-note-foot"><span className="status-dot" /> {busy ? 'Waiting for response' : 'Local workflow · no AI backend'}</div></section>
              <section className="session-facts"><h2>Session at a glance</h2><dl><div><dt>Network</dt><dd>Preprod <span className="tiny-tag">ONLY</span></dd></div><div><dt>Wallet</dt><dd>{wallet?.walletName ?? 'Not connected'}</dd></div><div><dt>Network check</dt><dd>{walletStale ? 'Refresh needed' : preprod ? 'Last read: magic 1' : wallet ? 'Not confirmed' : 'Waiting for wallet'}</dd></div><div><dt>Signature</dt><dd>{receipt ? 'Received' : busy === 'sign' ? 'Awaiting approval' : 'Not requested'}</dd></div>{wallet && <><div><dt>Balance</dt><dd>{formatAda(wallet.balanceLovelace)} {preprod ? 'tADA' : 'ADA units'}</dd></div><div className="origin-row"><dt>Connected page</dt><dd title={wallet.origin}>{wallet.origin}</dd></div></>}</dl></section>
              <div className="quiet-note"><Info size={17} /><p>Staking comes later. This lab focuses on wallet connection and message signatures.</p></div>
            </aside>
          </div>
          <section className="evidence-strip"><div className="evidence-icon"><Code2 size={22} /></div><div><h2>Made for humans. Readable by agents.</h2><p>Clear actions in the UI. Structured evidence for whatever comes next.</p></div><button className="text-button" onClick={() => setTab('guide')}>Explore agent tools <ArrowUpRight size={16} /></button></section>
        </>}

        {tab === 'activity' && <section className="content-sheet"><div className="section-top"><h2>Session timeline</h2><span className="subtle">Cleared when this panel closes</span></div>{events.length ? <ol className="event-list">{events.map(event => <li key={event.id}><span className={`event-icon ${event.status}`}>{event.status === 'success' ? <Check size={15} /> : event.status === 'error' ? <X size={15} /> : <Circle size={10} />}</span><div><h3>{event.title}</h3><p>{event.detail}</p><time dateTime={event.time}>{new Date(event.time).toLocaleTimeString()}</time></div></li>)}</ol> : <div className="empty-state"><RotateCcw size={32} /><h3>Your first run starts with a connection.</h3><p>Wallet requests and responses will appear here as they happen.</p><button className="button primary" onClick={() => setTab('session')}>Go to wallet lab <ArrowRight size={16} /></button></div>}<div className="export-row"><button className="button secondary" disabled={!events.length} onClick={() => downloadFile('web3lane-receipt.html', reportHtml(evidence), 'text/html')}><ArrowDownToLine size={16} /> HTML receipt</button><button className="button secondary" disabled={!events.length} onClick={() => downloadFile('web3lane-receipt.json', JSON.stringify(evidence, null, 2), 'application/json')}><Code2 size={16} /> JSON evidence</button><button className="icon-button" disabled={!events.length} onClick={copyEvidence} aria-label="Copy JSON evidence">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>{receipt && <details className="raw-receipt"><summary>Inspect signature receipt</summary><pre>{JSON.stringify(receipt, null, 2)}</pre></details>}</section>}

        {tab === 'guide' && <div className="guide-grid"><section className="content-sheet"><h2>One workflow. Two ways in.</h2><p className="guide-intro">A browser agent can inspect state, discover wallets, and prepare a message using the page’s tool interface. A person reviews the message and approves the wallet prompt.</p><pre className="code-example">{'await window.web3lane.call("session.inspect");\n\nawait window.web3lane.call("signature.prepare", {\n  message: "Testing my Preprod wallet connection."\n});'}</pre><h3 className="mt-8 mb-3">Available tools</h3><div className="tool-list">{toolDefinitions.map(tool => <div key={tool.name}><code>{tool.name}</code><p>{tool.description}</p></div>)}</div><p className="guide-intro mt-6">The interface lives in this panel or the local web preview. It is not injected into dApps and is not a remote MCP server. Browser agents can also use named buttons and <code>data-action</code> attributes.</p></section><aside className="guide-aside"><ShieldCheck size={25} /><h2>Approval is a boundary.</h2><p>There is no signing tool exposed to an agent. Message signing is requested from the review button and requires wallet consent.</p><h3>Preprod, explicitly</h3><p>We require network ID 0 and network magic 1. A wallet that cannot report the network magic can connect for inspection, but signing stays blocked.</p><h3>Useful references</h3><a href="https://cips.cardano.org/cip/CIP-30" target="_blank" rel="noreferrer">CIP-30 wallet bridge <ArrowUpRight size={14} /></a><a href="https://cips.cardano.org/cip/CIP-0142" target="_blank" rel="noreferrer">CIP-142 network detection <ArrowUpRight size={14} /></a><a href="https://developers.cardano.org/docs/get-started/testnets-and-devnets/" target="_blank" rel="noreferrer">Cardano test networks <ArrowUpRight size={14} /></a></aside></div>}
        <footer className="page-footer"><span>web3lane <span className="footer-divider">/</span> Small tests. Clear evidence.</span><span><Globe2 size={13} /> Cardano Preprod</span></footer>
      </main>
    </div>
    <script type="application/json" id="web3lane-agent-state">{JSON.stringify(state).replace(/</g, '\\u003c')}</script>
  </div>;
}
