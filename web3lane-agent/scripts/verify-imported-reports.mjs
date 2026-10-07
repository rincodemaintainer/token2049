import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { verifyEvidenceBundle } from './evidence-bundle.mjs';

const reports = path.resolve(process.argv[2] ?? 'public/evidence');
let entries;
try { entries = await readdir(reports, { withFileTypes: true }); }
catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
for (const entry of entries) {
  if (entry.name.startsWith('.')) continue;
  if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) throw new Error(`Invalid report directory: ${entry.name}`);
  await verifyEvidenceBundle(path.join(reports, entry.name));
}
console.log(`Verified ${entries.filter(entry => !entry.name.startsWith('.')).length} report bundles`);
