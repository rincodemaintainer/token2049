# web3lane reports

Static Next.js site for inspecting imported, verified evidence bundles.

## Bundle contract

Before `npm run build`, copy each bundle to `public/evidence/<slug>/` with:

- `report-data.json`: schema version `1`, recorded fields (`title`, `run`, `recovery`, `verdict`, `stages`, `checks`, `metrics`, `timeline`, `media`, `files`, `job`, `generatedAt`) and optional `agentCommentary`.
- `manifest.json`: artifact inventory produced by the evidence verifier.
- only manifest-listed artifacts, addressed with relative paths such as `assets/run.png`.

`agentCommentary` is rendered separately from recorded facts:

```json
{
  "schemaVersion": 1,
  "summary": "Agent summary",
  "comments": [{ "section": "verdict", "text": "Human-readable context." }],
  "author": "Eve",
  "createdAt": "2026-10-07T00:00:00.000Z"
}
```

The importing process verifies bundle bytes before copying into this directory. The site performs no runtime fetch; pages are generated from local files during `npm run build`. All imported reports render directly on the single page at `/`.
