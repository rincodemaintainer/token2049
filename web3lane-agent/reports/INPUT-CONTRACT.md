# Evidence report input contract

Run `npm run report:pack -- reports/swap-demo.input.json .local/reports/swap-01` from `web3lane-agent`. The optional second argument selects an output directory under `.local` (default `.local/evidence-report`). The builder writes `index.html`, `report-data.json`, `manifest.json`, evidence files, and `evidence.zip`. Open `index.html` directly or import the verified bundle into the separate Next.js app. The archive includes the HTML and an export-time source snapshot. The builder rejects `.env*`, browser profiles, paths outside the project, and known wallet credentials in text. Review video content before publishing; the recording input is allowlisted to `.local/safe-recordings/`.

The host runs this command after recording and reconciliation. Eve does not author the report, choose outcomes, assemble evidence, or supply artifact digests. The packer derives the page data from recorded files; the optional agent input below is interpretation only. This v1 packer handles one recorded Qwap swap attempt, not arbitrary journey formats. It rejects multi-case/retry reports instead of silently choosing one result.

The input is JSON with `schemaVersion: 1`. Paths are relative to `web3lane-agent` and must remain inside that directory. Required fields:

| Field | Meaning |
| --- | --- |
| `title` | Human-readable run title |
| `report` | Playwright JSON reporter output; original test status remains authoritative |
| `runDirectory` | Playwright output directory for this test; contains screenshots, `swap-result.json`, and error context |
| `recovery` | Separate explorer reconciliation JSON; must record provenance and verification time |
| `rpcProof` | Raw RPC transaction, receipt, and block JSON for an RPC-confirmed run; builder validates it against the browser request and recovery record |

Optional fields: `followup` (separate connection test JSON), `evalSummary` (Eve evaluation summary), `runnerLog` (raw terminal log), `trace` (Playwright trace ZIP), `approvedPlan` (a buyer-approved plan JSON under `.local/approved-plans/`), and `recordings` (array of `{ "path": "...webm", "label": "...", "scope": "..." }`). When `approvedPlan` is supplied, the builder recomputes its core plan hash and requires it to match `approval.approved_plan_hash`; it exports that artifact and adds the job ID, plan version, and hash to `report-data.json`. Omitting it preserves historical exports with an explicit `unbound` job state. The builder discovers `recording-*` and `swap-trace` Playwright attachments when the explicit media fields are empty. A recording's scope must state what it actually shows. Empty or null means unavailable, and the page says so. Never point this contract at a wallet onboarding recording that might contain a seed phrase.

After a signed run, reconcile its hash before export. `node scripts/capture-rpc-proof.mjs <hash> .local/swap-test-results/<run>/rpc-proof.json` saves the raw read-only RPC responses for `rpcProof`; the builder checks transaction, receipt, block, decoded calldata, and USDC Transfer amount against the journal and recovery record.

The builder's `report-data.json` is the finalizer interface. It contains `job`, `run`, `recovery`, `verdict`, `stages`, `checks`, `metrics`, `timeline`, `media`, `files`, and `generatedAt`. `job.binding_state` is `bound` only when its exported approved-plan artifact recomputes to the stated hash; otherwise it is explicitly `unbound`. `verdict` is evidence-derived: it reports `PASS` only when both browser assertions and chain reconciliation agree; otherwise it reports `INCONCLUSIVE` with separate chain, app, wallet, and retry-evidence facts. It does not infer buyer approval or retry history. Status values are `pass`, `warn`, `fail`, or `unknown`. A later on-chain success never changes the raw browser test result. `manifest.json` hashes every exported content file, including `index.html` and `report-data.json`; the manifest and archive cannot hash themselves. Paths in exported JSON are sanitized; screenshots and recordings are copied without image edits. The source snapshot is captured at export time; the report marks exact run-time source provenance unavailable when it was not saved at run start.

## Optional QA-agent commentary

Set `agentCommentary` in the pack input to a recorded `.local/*.json` file:

```json
{
  "schemaVersion": 1,
  "author": "web3lane",
  "createdAt": "2026-10-07T12:00:00Z",
  "summary": "The recorded browser case failed after the swap settled.",
  "comments": [
    { "section": "run", "text": "Review the explorer-tab assertion in the runner log." }
  ]
}
```

Allowed sections are `run`, `recovery`, `verdict`, and `checks`. Text is plain text, not HTML. Unknown fields are rejected; commentary cannot set outcomes, job binding, payment state, or evidence references. The packer includes the original note as `logs/agent-commentary.json` and exposes it as `report-data.agentCommentary`. Without a note this field is `null`; packing never requires an agent call. Next.js renders the notes separately from recorded facts. Summary text does not change any result or payment gate.

## Verified bundle interface

`scripts/evidence-bundle.mjs` exports `verifyEvidenceBundle(bundleDir)` returning `{ report, manifest, manifestHash, executionRecord }`. It verifies every manifest file's byte length and SHA-256, rejects duplicate/unsafe paths and symlinks, checks report artifact references, and recomputes an included approved plan's hash. `manifestHash` hashes the actual manifest bytes. This verifies integrity, not the authenticity of the recorder or buyer; paid finalization separately requires the trusted host's plan and execution record.

`manifest.json` has `{ schemaVersion: 1, files: [{ path, bytes, sha256, label, kind, source }], ... }`. Paths are relative to the bundle. The typed page interface is maintained in the separate `web3lane-reports` app. Historical bundles may remain `unbound` for viewing; they cannot establish an approved paid execution.

## Paid execution record

Paid bundles additionally require `executionRecord`, pointing to a `.local/*.json` file written by the trusted runner with this interface:

```ts
interface ExecutionRecord {
  schemaVersion: 1;
  payment_job_id: string;
  input_hash: string;
  approved_job_id: string;
  plan_version: number;
  approved_plan_hash: string;
  session_id: string; // Issued by the host begin command.
  started_at: string; // Exact host authorization timestamp.
  recorded_at: string;
  observations: StepObservation[]; // agent/lib/types.ts; never model-authored.
}
```

The packer includes this as `logs/execution-record.json`. `report-data.execution` contains the binding fields plus `record_artifact` and `record_sha256`; observations stay in the recorded file. The browser interval must fall within the execution interval. Absence is allowed only for historical viewing.

For bound executions, `caseResults` and the primary verdict are derived from the approved plan and recorded observations with the same deterministic runner used by paid finalization. If outcomes differ, the primary label is `MIXED`; individual outcomes remain visible. Raw browser/chain facts never override those approved case assertions. The verifier recomputes this assessment, and paid finalization compares the same cases before submission. Historical exports without an execution record retain the browser/reconciliation verdict described above.

The subsequent host registration file has the same fields except `schemaVersion`, plus `bundle_dir` and `artifacts: Array<{ id, path, sha256, byte_size }>`. The trusted runner maps planned evidence IDs (including `session-log`) to distinct actual manifest paths. Registration/finalization requires the host-issued session, exact approval/payment input binding, observation equality, and `approval <= started_at <= recorded_at <= now < submission deadline`. The bundle is independently re-verified before payment submission. This interface does not implement the browser recorder adapter or establish provenance for arbitrary operator-supplied JSON.

## Import and static generation

```sh
# From web3lane-agent, after packing:
npm run report:import -- .local/reports/swap-01 swap-01
# Optional third argument overrides the destination Next.js app directory.

# From web3lane-reports:
npm run build
```

Import copies only verified manifest entries plus `manifest.json` into `web3lane-reports/public/evidence/swap-01/`. It verifies copied bytes again and refuses to overwrite an existing slug; revisions use a new slug. Unlisted files and the unhashed source ZIP are not imported. `prebuild` re-verifies imported bundles. Next.js reads local JSON during static generation and exports `/reports` and `/reports/swap-01` to `out/`. No agent, payment API, or runtime fetch is needed to view a report. Importing/building is local; publication is a separate action.
