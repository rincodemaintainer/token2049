import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { PaymentPayloadV2Schema } from '@x402/core/schemas';
import { ExactCardanoScheme } from '@x402/cardano/exact/server';
import { addressCredentials, decodeCardanoPayload, decodeCardanoTransaction } from '@x402/cardano';
import { approvedPlanForJob, reserveApprovedExecution, x402QuoteForPlan, assertX402Settlement } from './paid-finalization.mjs';
import { inputHash, sha256 } from './standard-hash.mjs';
import { createJsonOnce, serviceDataPath, writeJsonAtomic } from './service-storage.mjs';

const requestSchema = z.object({
  identifier_from_purchaser: z.string().regex(/^(?:[a-f0-9]{2}){7,13}$/),
  input_data: z.object({
    prompt: z.string().min(1).max(16000).refine(value => value.trim().length > 0),
    approved_job_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    plan_version: z.number().int().positive(), approved_plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();
const json = (status, body, headers = {}) => ({ status, body, headers: {'cache-control':'no-store', ...headers} });
// One API process per local journal. Persistent claims survive a restart; locks must not.
const activeCheckouts = new Set();
const read = async file => {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
};
async function save(file, value) {
  await writeJsonAtomic(file, value);
}
async function claim(file, value) {
  try { await createJsonOnce(file, value); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!isDeepStrictEqual(await read(file), value)) throw new Error('Payment already belongs to another job');
  }
}

// No wallet key is needed on the seller. Only the trusted facilitator submits.
export function createX402Checkout({ payTo, facilitatorUrl, resourceUrl,
  directory = serviceDataPath('x402-jobs'), stateDirectory = serviceDataPath('x402-checkout'),
  reservationDirectory = serviceDataPath('approved-executions'), facilitator, onNewPlan = async () => {},
  now = Date.now,
}) {
  if (!payTo?.startsWith('addr_test1')) throw new Error('X402_PAY_TO must be a Cardano testnet address');
  addressCredentials(payTo);
  for (const value of [facilitatorUrl, resourceUrl]) {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
      throw new Error('x402 URLs require HTTPS (HTTP permitted only on localhost)');
    }
  }
  const server = new x402ResourceServer(facilitator ?? new HTTPFacilitatorClient({url:facilitatorUrl,timeoutMs:90000}))
    .register('cardano:preprod', new ExactCardanoScheme());
  let initialization;
  const ready = async () => {
    initialization ??= server.initialize().catch(error => { initialization = undefined; throw error; });
    await initialization;
  };
  const path = id => join(directory, `${id}.json`);
  const publicJob = job => ({
    id:job.id, status:job.status, payment_protocol:'x402', payment_model:'direct',
    automatic_refunds:false, transaction:job.x402.transaction,
    status_url:`/x402/status?job_id=${job.id}`,
    ...(job.status === 'completed' ? {result:job.result} : {}),
  });
  const pending = job => json(202, {...publicJob(job), error:'settlement_pending',
    retry:'Repeat the same POST body and original PAYMENT-SIGNATURE. Do not sign another payment.'}, {'retry-after':'5'});
  const paid = job => json(200, publicJob(job), {'PAYMENT-RESPONSE':encodePaymentResponseHeader(job.x402.settlement)});
  const required = job => json(402, {...job.x402.paymentRequired, job_id:job.id, payment_model:'direct',automatic_refunds:false},
    {'PAYMENT-REQUIRED':encodePaymentRequiredHeader(job.x402.paymentRequired)});

  async function checkout(input, paymentHeader, buyerId) {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return json(400, {error:'Expected purchaser nonce and exact host-approved plan binding'});
    const nonce = parsed.data.identifier_from_purchaser;
    const nonceKey = sha256(nonce);
    const bindingHash = inputHash(parsed.data.input_data, nonce);
    await mkdir(directory, {recursive:true,mode:0o700});
    await mkdir(stateDirectory, {recursive:true,mode:0o700});
    const lock = resolve(stateDirectory, nonceKey);
    if (activeCheckouts.has(lock)) return json(409, {error:'Checkout busy; retry unchanged'}, {'retry-after':'5'});
    activeCheckouts.add(lock);
    try {
      const indexPath = join(stateDirectory, `${nonceKey}.json`);
      const index = await read(indexPath);
      let job = index && await read(path(index.id));
      if (index && !job) return json(409, {error:'Incomplete checkout journal requires inspection'});
      // Compare saved input so retries preserve previously issued payment hashes.
      if (job && inputHash(job.input, nonce) !== bindingHash) return json(409, {error:'Nonce already used with another input'});
      if (job && buyerId && job.buyerId !== buyerId) return json(404, {error:'Job not found'});
      if (!job) {
        if (paymentHeader) return json(409, {error:'Request a quote before submitting a signed payment'});
        let plan;
        try { plan = await approvedPlanForJob({input:parsed.data.input_data}); }
        catch { return json(409, {error:'Missing or stale host-approved plan'}); }
        await onNewPlan(plan, buyerId);
        const quote = x402QuoteForPlan(plan);
        await ready();
        job = {id:randomUUID(),paymentProtocol:'x402',nonce,nonceKey,input:parsed.data.input_data,
          inputHash:bindingHash,quote,phase:'x402-quoted',status:'awaiting_payment',
          ...(buyerId ? {buyerId} : {}),x402:{facilitatorUrl,expiresAt:now()+600000}};
        const [requirements] = await server.buildPaymentRequirements({
          scheme:'exact',network:quote.network,payTo,price:{amount:quote.amount,asset:quote.asset},maxTimeoutSeconds:600,
          extra:{confirmationPolicy:{l1Confirmations:1},areFeesSponsored:false,
            qa:{jobId:job.id,inputHash:job.inputHash,approvedJobId:job.input.approved_job_id,
              planVersion:job.input.plan_version,approvedPlanHash:job.input.approved_plan_hash}},
        });
        job.x402.requirements = requirements;
        job.x402.paymentRequired = await server.createPaymentRequiredResponse([requirements], {
          url:resourceUrl,description:'One approved web3lane run. Direct payment; no automatic escrow refund.',mimeType:'application/json',
        });
        await save(path(job.id), job);
        await claim(indexPath, {id:job.id});
      }
      // A completed payment can be reconciled even if its approval later changes.
      if (!paymentHeader) {
        if (job.x402.settlement?.success) { assertX402Settlement(job); return paid(job); }
        if (job.x402.transaction) return pending(job);
        if (job.x402.expiresAt <= now()) return json(410, {error:'Quote expired; request a new quote with a new purchaser nonce'});
        return required(job);
      }
      if (typeof paymentHeader !== 'string' || paymentHeader.length > 100000) return json(400, {error:'Invalid PAYMENT-SIGNATURE'});
      let payload, transaction;
      try {
        payload = PaymentPayloadV2Schema.parse(decodePaymentSignatureHeader(paymentHeader));
        const cardano = decodeCardanoPayload(payload.payload);
        transaction = decodeCardanoTransaction(cardano.transaction).txHash;
      } catch { return json(400, {error:'Invalid Cardano x402 v2 payment'}); }
      if (!isDeepStrictEqual(payload.accepted, job.x402.requirements) ||
          payload.resource?.url !== job.x402.paymentRequired.resource.url) {
        return json(409, {error:'Payment does not match the issued quote'});
      }
      if (job.x402.payload && !isDeepStrictEqual(payload, job.x402.payload)) return json(409, {error:'Retry must use the original payment payload'});
      if (job.x402.settlement?.success) { assertX402Settlement(job); return paid(job); }
      if (job.phase === 'x402-rejected') return json(409, {...publicJob(job),error:'Payment rejected; inspect before attempting another payment'});
      if (job.x402.facilitatorUrl !== facilitatorUrl) return json(503, {error:'Restore the original facilitator to reconcile this payment'});
      await ready();
      if (!job.x402.payload) {
        if (job.x402.expiresAt <= now()) return json(410, {error:'Quote expired; payment was not submitted'});
        try { await approvedPlanForJob(job); }
        catch { return json(409, {error:'Approved plan changed; payment was not submitted'}); }
        const verified = await server.verifyPayment(payload, job.x402.requirements);
        if (!verified.isValid) return json(402, {...job.x402.paymentRequired,error:'Payment verification failed'},
          {'PAYMENT-REQUIRED':encodePaymentRequiredHeader(job.x402.paymentRequired)});
        job.x402.payload = payload; job.x402.transaction = transaction;
        job.phase = 'x402-verified';
        await save(path(job.id), job);
      }
      // Claim by canonical transaction BODY hash; changing witnesses/nonce cannot buy another job.
      try { await claim(join(stateDirectory, `tx-${transaction}.json`), {jobId:job.id,inputHash:job.inputHash}); }
      catch { return json(409, {error:'Payment already belongs to another job'}); }
      if (job.phase === 'x402-verified') {
        try { await approvedPlanForJob(job); }
        catch { return json(409, {error:'Approved plan changed; payment was not submitted'}); }
        try { await reserveApprovedExecution(job, reservationDirectory); }
        catch {
          const key = sha256(JSON.stringify([job.input.approved_job_id,job.input.plan_version,job.input.approved_plan_hash]));
          const reservation = await read(join(reservationDirectory, `${key}.json`));
          if (reservation?.payment_job_id !== job.id || reservation.input_hash !== job.inputHash || reservation.nonce_key !== job.nonceKey) {
            return json(409, {error:'Approved plan already reserved; payment was not submitted'});
          }
        }
      }
      // Persist before broadcast. Unknown outcomes retry settle only, never verify/sign again.
      job.phase = 'x402-settling'; job.status = 'payment_pending';
      await save(path(job.id), job);
      let settlement;
      try { settlement = await server.settlePayment(job.x402.payload, job.x402.requirements); }
      catch { return pending(job); }
      if (settlement.success) {
        job.x402.settlement = settlement;
        try { assertX402Settlement(job); }
        catch { delete job.x402.settlement; return pending(job); }
        job.phase = 'x402-ready'; job.status = 'awaiting_execution';
      } else if (settlement.errorReason === 'exact_cardano_settlement_definitively_rejected' ||
          (settlement.errorReason === 'exact_cardano_settlement_failed' && settlement.extra?.status === 'expired')) {
        job.phase = 'x402-rejected'; job.status = 'payment_rejected';
        job.x402.settlement = settlement;
      }
      await save(path(job.id), job);
      return settlement.success ? paid(job) : job.phase === 'x402-rejected'
        ? json(409, {...publicJob(job),error:'Payment rejected; inspect before attempting another payment'}) : pending(job);
    } finally { activeCheckouts.delete(lock); }
  }
  async function status(id, buyerId) {
    if (!/^[0-9a-f-]{36}$/.test(id || '')) return json(400, {error:'Invalid job_id'});
    const job = await read(path(id));
    if (job && buyerId && job.buyerId !== buyerId) return json(404, {error:'Job not found'});
    return job ? json(200, publicJob(job)) : json(404, {error:'Job not found'});
  }
  return {checkout,status};
}
