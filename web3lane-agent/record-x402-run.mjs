import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  beginX402Execution,
  finalizeX402RecordedJob,
  registerX402RecordedRun,
  saveX402Job,
} from './paid-finalization.mjs';
import { verifyEvidenceBundle } from './scripts/evidence-bundle.mjs';

// Offline trusted-host commands. They only journal a facilitator-confirmed
// receipt and runner evidence; they never launch a browser or call a payment API.
const [command, jobFile, recordingFile] = process.argv.slice(2);
if (!['begin','record','finalize'].includes(command) || !jobFile ||
    (command === 'record' ? !recordingFile || process.argv.length !== 5 : process.argv.length !== 4)) {
  throw new Error('Usage: node record-x402-run.mjs begin <saved-x402-job.json> | record <saved-x402-job.json> <recorded-run.json> | finalize <saved-x402-job.json>');
}
const file = resolve(jobFile);
const job = JSON.parse(await readFile(file,'utf8'));
let output;
if (command === 'begin') output = await beginX402Execution({job});
if (command === 'record') output = await registerX402RecordedRun({job,run:JSON.parse(await readFile(resolve(recordingFile),'utf8'))});
if (command === 'finalize') {
  const finalized = await finalizeX402RecordedJob({job,verifyBundle:verifyEvidenceBundle});
  job.result = finalized.result;
  job.resultHash = finalized.resultHash;
  job.evidenceManifestHash = finalized.manifestHash;
  job.phase = 'x402-complete';
  job.status = 'completed';
  output = finalized;
}
await saveX402Job(file,job);
console.log(JSON.stringify(output));
