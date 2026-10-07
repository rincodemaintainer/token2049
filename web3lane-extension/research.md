# Agent-first wallet lab: research and decisions

Research date: 7 October 2026. User-confirmed MVP: wallet connection and message signing, **Preprod only**. Staking is later.

## Product contract

An agent-native product needs inspectable state, bounded tools, a visible approval boundary, and evidence of outcomes. We apply those principles as a deterministic local workflow: discover → connect → prepare → review → request signature → receipt. A chat box or autonomous model is not needed for this first slice. Structured tool descriptions and input schemas make the next agent integration concrete.

OpenAI’s [Agents SDK documentation](https://developers.openai.com/api/docs/guides/agents/sdk) and [agent tooling overview](https://openai.com/index/new-tools-for-building-agents/) describe tools, guardrails and tracing. Our design inference: human and agent entry points should share the same state; sensitive steps must remain visible and produce useful evidence.

## Cardano standards and SDK reuse

[CIP-30](https://cips.cardano.org/cip/CIP-30) specifies `window.cardano`, `enable`, CBOR wallet reads and `signData`. [CIP-8](https://cips.cardano.org/cip/CIP-8) defines the COSE signing format. Message signing is distinct from authorizing a transaction; this lab never constructs or submits one.

[CIP-142](https://cips.cardano.org/cip/CIP-0142) adds `api.cip142.getNetworkMagic()`. Preprod magic is 1; Preview is 2. The proposal’s implementation coverage is limited, so we inspect provider capabilities and fail closed if the network cannot be established. [Cardano’s network documentation](https://developers.cardano.org/docs/get-started/testnets-and-devnets/) supplies the Preprod context.

We reuse [EMURGO Cardano Serialization Lib](https://github.com/Emurgo/cardano-serialization-lib) to decode native Cardano structures instead of writing a CBOR parser. Its ASM.js package works without remote code or WebAssembly CSP allowances. [Mesh’s BrowserWallet SDK](https://meshjs.dev/apis/wallets/browserwallet) is a useful higher-level alternative for a regular dApp. Here the extension must reach a wallet injected into another page, so a small serialized CIP-30 bridge is still necessary; bundling a full transaction SDK into the host page adds machinery outside this slice.

## Chromium architecture

The side panel is the stable task surface. Chrome’s [sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) opens it from the extension action. The React page cannot assume another extension injects `window.cardano` into its `chrome-extension://` origin. We use temporary activeTab permission and [`scripting.executeScript`](https://developer.chrome.com/docs/extensions/reference/api/scripting) to call a self-contained function in the active dApp’s MAIN world and return serializable results.

[Chrome’s content-script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) explains isolated versus MAIN worlds; MAIN shares the host environment. Consequently the bridge checks the bound origin before wallet calls, avoids exposing a permanent global message bridge, and treats responses as wallet-reported evidence. It cannot turn a hostile page into a trusted one.

The [MV3 service worker](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers) only configures the side panel. No wallet state or signing job depends on its lifetime. The panel keeps a local session in memory and provides explicit exports.

## UX decisions

- Keep the existing brand palette and typography.
- A two-step runbook gives the next click a clear location.
- Show exact payload, origin and nonce before approval.
- Separate connection permission, signing approval, pending response, rejection and returned receipt.
- Make unsupported networks and unknown network magic explicit. Never label network ID 0 alone as confirmed Preprod.
- Export readable HTML and structured JSON with the same observations. Do not claim cryptographic verification or chain submission.

## Later

Staking would require an independently configured Preprod provider, live protocol parameters, pool validation, transaction construction, explicit fee/deposit review, wallet signing, submission and chain confirmation. None of those steps are presented as implemented in this build.
