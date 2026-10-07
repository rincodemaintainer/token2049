import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beginPaidExecution, registerRecordedRun } from './paid-finalization.mjs';

// Offline trusted-host commands. No signing, runner launch, or payment writes.
// Payment snapshots and recorded observations must come from the trusted operator/runner.
const [command, jobFile, paymentFile, recordingFile] = process.argv.slice(2);
if (!['begin','record'].includes(command) || !jobFile || !paymentFile ||
    (command === 'record' ? !recordingFile || process.argv.length !== 6 : process.argv.length !== 5)) {
  throw new Error('Usage: node record-paid-run.mjs begin <saved-job.json> <trusted-payment-snapshot.json> | record <saved-job.json> <trusted-payment-snapshot.json> <recorded-run.json>');
}
const readJson = async file => JSON.parse(await readFile(resolve(file), 'utf8'));
const input = {job:await readJson(jobFile),payment:await readJson(paymentFile)};
const result = command === 'begin' ? await beginPaidExecution(input)
  : await registerRecordedRun({...input,run:await readJson(recordingFile)});
console.log(typeof result === 'string' ? result : JSON.stringify(result));
