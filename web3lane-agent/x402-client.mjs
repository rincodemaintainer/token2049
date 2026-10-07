import { x402Client } from '@x402/fetch';
import { ExactCardanoScheme } from '@x402/cardano/exact/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { inputHash } from './standard-hash.mjs';

function validateUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
    throw new Error('Use HTTPS, or localhost HTTP, for agent payments');
  }
}

// Caller supplies its own Cardano signer. Save the returned attempt before submitting it.
// The explicit asset, amount and recipient are the buyer's approved spending policy.
export async function prepareX402Job({url,input,signer,payTo,asset,amount,fetchImpl=fetch}) {
  validateUrl(url);
  if (!/^[1-9][0-9]*$/.test(amount || '')) throw new Error('Expected exact approved amount in atomic units');
  const body = JSON.stringify(input);
  const response = await fetchImpl(url, {method:'POST',headers:{'content-type':'application/json'},body,redirect:'error'});
  if (response.status !== 402) return {response};
  const header = response.headers.get('PAYMENT-REQUIRED');
  if (!header) throw new Error('Missing x402 v2 payment requirements');
  const required = decodePaymentRequiredHeader(header);
  if (required.x402Version !== 2 || required.resource?.url !== url || required.accepts?.length !== 1) {
    throw new Error('Unexpected payment resource or protocol');
  }
  const requirements = required.accepts[0];
  const qa = requirements.extra?.qa;
  if (requirements.scheme !== 'exact' || requirements.network !== 'cardano:preprod' ||
      requirements.payTo !== payTo || requirements.asset !== asset || requirements.amount !== amount ||
      requirements.maxTimeoutSeconds !== 600 ||
      requirements.extra?.assetTransferMethod || requirements.extra?.paymentFlow ||
      requirements.extra?.confirmationPolicy?.l1Confirmations !== 1 ||
      qa?.inputHash !== inputHash(input.input_data,input.identifier_from_purchaser) ||
      qa.approvedJobId !== input.input_data.approved_job_id || qa.planVersion !== input.input_data.plan_version ||
      qa.approvedPlanHash !== input.input_data.approved_plan_hash || !/^[0-9a-f-]{36}$/.test(qa.jobId || '')) {
    throw new Error('Quote differs from the buyer-approved plan, recipient or price');
  }
  const client = new x402Client().register('cardano:preprod',new ExactCardanoScheme(signer))
    .setSpendControls({allowedAssets:[{network:'cardano:preprod',asset,maxAmountPerPayment:amount}]});
  const payload = await client.createPaymentPayload(required);
  return {attempt:{url,body,paymentHeader:encodePaymentSignatureHeader(payload),jobId:qa.jobId}};
}

// Safe to call again after a timeout or 202: no signing and no new transaction.
export async function submitX402Job(attempt, {fetchImpl=fetch} = {}) {
  validateUrl(attempt.url);
  return fetchImpl(attempt.url, {method:'POST',headers:{'content-type':'application/json',
    'PAYMENT-SIGNATURE':attempt.paymentHeader},body:attempt.body,redirect:'error'});
}
