# web3lane Wallet lab

A Chromium Manifest V3 side panel built with React, TypeScript, Tailwind CSS and Vite. Uses the existing web3lane sage, forest-green, lime and Plus Jakarta Sans theme.

Scope: connect a Cardano wallet, confirm **Preprod**, review a message, request its signature, and export HTML/JSON evidence. Staking and transaction signing are deferred.

## Run and install

```sh
cd web3lane-extension
npm ci
npm run dev
```

The development URL is a regular web preview. Its wallet connection uses the wallet injected into that page.

```sh
npm run build
```

1. Open `chrome://extensions` (or your Chromium browser’s extension manager).
2. Enable Developer mode and choose **Load unpacked**.
3. Select this folder’s **dist/** directory.
4. Open your dApp in an HTTP(S) tab. Set your Cardano wallet to **Preprod**.
5. Click the web3lane toolbar icon. In the side panel, choose **Connect wallet**.
6. Choose the wallet and approve its connection prompt. Review the exact payload, choose **Approve & request signature**, then approve or reject in the wallet.

Chrome 114+ is required. Browsers without the Chromium sidePanel API are unsupported. Click the toolbar icon on the intended dApp tab to grant temporary activeTab permission; restricted browser pages cannot host wallet injection.

## Network and signing

- CIP-30 `enable`, account reads and `signData` provide the wallet bridge.
- CIP-142 is requested when advertised by the provider. Both network ID **0** and network magic **1** are required to sign. Preview (2), Mainnet and unknown network magic are blocked. CIP-30 network ID alone cannot distinguish Preprod from Preview.
- A wallet without CIP-142 can connect for diagnostics but cannot sign. Provider detection is dynamic; no named wallet compatibility is claimed without a real-wallet test.
- Message signing follows CIP-8 through CIP-30 `signData(address, UTF-8 payload hex)`. It never calls `signTx` or `submitTx`.
- The reviewed payload includes purpose, Preprod, origin, unique nonce and timestamp. The local UI expires unsigned challenges after five minutes. This is a QA message, not a production login/session protocol.
- The account, network and originating tab are checked again before signing. EMURGO Cardano Serialization Lib decodes CBOR balances and Cardano addresses. Wallet keys never enter this app.
- A returned signature is recorded, **not cryptographically verified**. Receipts say so explicitly. No wallet extension or chain provider is impersonated by the live app.

The MAIN-world API is supplied by the active website and wallet. A hostile website can tamper with its environment. Use a trusted dApp origin; receipts record wallet responses, not independently attested chain facts.

## Agent interface

The panel and web preview expose a small local tool interface:

```js
window.web3lane.tools // descriptions + input schemas
await window.web3lane.call('session.inspect')
await window.web3lane.call('wallet.discover')
await window.web3lane.call('signature.prepare', { message: 'Testing my Preprod connection.' })
await window.web3lane.call('receipt.read')
```

`signature.prepare` requires 1–160 UTF-8 bytes and stages a message for review. No signing tool is exposed. The UI’s review button still invokes wallet consent. A browser agent with full UI control can click buttons; the actual authorization boundary is the wallet’s approval prompt, not this convenience API.

Semantic buttons, labels, `data-action` hooks and `#web3lane-agent-state` JSON also support browser agents. This is an agent-ready local surface, not a connected LLM or remote MCP service. The existing agent backend is not wired in.

## State and privacy

Wallet snapshots, signature receipts and timeline events stay in panel memory. Closing/reloading clears them. Explicit exports include the public signing address, message, signature and public key. Disconnect clears the local connection, while prior activity remains in the session; revoke the site’s permission separately in your wallet.

No broad host permissions, analytics, API keys, remote executable code or wallet secrets. Fonts and SDK code ship locally. Permissions: `activeTab`, `scripting`, `sidePanel`.

## Validate

```sh
npm run build
npm test
npm run test:e2e
```

Build first: the MV3 browser tests load `dist/`. Unit and browser tests use explicit fake wallet responses. They cover Preprod gating, account/origin changes, rejection, pending state, exports and narrow layout. The MAIN-world regression uses a temporary extension copy with a localhost-only test permission; the production manifest remains unchanged. A real installed wallet’s approval flow still needs a manual acceptance run; mocked tests cannot establish that a wallet implements CIP-142 correctly.

See [research.md](./research.md) for sources and product decisions.
