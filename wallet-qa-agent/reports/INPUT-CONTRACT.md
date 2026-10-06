# Evidence report input contract

Run `node scripts/build-evidence-report.mjs reports/swap-demo.input.json` from `wallet-qa-agent`. The builder writes `.local/evidence-report/index.html`, `report-data.json`, `manifest.json`, evidence files, and `evidence.zip`. Open `index.html` directly or serve the directory. The archive includes the HTML and an export-time source snapshot. The builder rejects `.env*`, browser profiles, paths outside the project, and known wallet credentials in text. Review video content before publishing; the recording input is allowlisted to `.local/safe-recordings/`.

The input is JSON with `schemaVersion: 1`. Paths are relative to `wallet-qa-agent` and must remain inside that directory. Required fields:

| Field | Meaning |
| --- | --- |
| `title` | Human-readable run title |
| `report` | Playwright JSON reporter output; original test status remains authoritative |
| `runDirectory` | Playwright output directory for this test; contains screenshots, `swap-result.json`, and error context |
| `recovery` | Separate explorer reconciliation JSON; must record provenance and verification time |
| `rpcProof` | Raw RPC transaction, receipt, and block JSON for an RPC-confirmed run; builder validates it against the browser request and recovery record |

Optional fields: `followup` (separate connection test JSON), `evalSummary` (Eve evaluation summary), `runnerLog` (raw terminal log), `trace` (Playwright trace ZIP), and `recordings` (array of `{ "path": "...webm", "label": "...", "scope": "..." }`). The builder discovers `recording-*` and `swap-trace` Playwright attachments when the explicit media fields are empty. A recording's scope must state what it actually shows. Empty or null means unavailable, and the page says so. Never point this contract at a wallet onboarding recording that might contain a seed phrase.

After a signed run, reconcile its hash before export. `node scripts/capture-rpc-proof.mjs <hash> .local/swap-test-results/<run>/rpc-proof.json` saves the raw read-only RPC responses for `rpcProof`; the builder checks transaction, receipt, block, decoded calldata, and USDC Transfer amount against the journal and recovery record.

The builder's `report-data.json` is the finalizer interface. It contains `run`, `recovery`, `stages`, `checks`, `metrics`, `timeline`, `media`, `files`, and `generatedAt`. Status values are `pass`, `warn`, `fail`, or `unknown`. A later on-chain success never changes the raw browser test result. `manifest.json` hashes every exported content file, including `index.html` and `report-data.json`; the manifest and archive cannot hash themselves. Paths in exported JSON are sanitized; screenshots and recordings are copied without image edits. The source snapshot is captured at export time; the report marks exact run-time source provenance unavailable when it was not saved at run start.
