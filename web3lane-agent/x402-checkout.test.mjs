import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader} from '@x402/core/http';
import {decodeCardanoTransaction} from '@x402/cardano';
import {buildSwapDemoPlan} from './agent/lib/fixtures/swap-demo.ts';
import {createX402Checkout} from './x402-checkout.mjs';
import {reserveApprovedExecution} from './paid-finalization.mjs';
import {inputHash,sha256} from './standard-hash.mjs';

// Preprod enterprise address made only from public fixture data. It is only a parser fixture.
const PAY_TO = 'addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6';
const TRANSACTION = Buffer.from('84a3008001800200a0f5f6','hex').toString('base64');
const CANONICAL_TRANSACTION = decodeCardanoTransaction(TRANSACTION).txHash;

async function fixture(run, {settle, now = () => Date.now()} = {}) {
 const root=await mkdtemp(join(tmpdir(),'x402-checkout-'));
 const previous=process.env.WEB3LANE_APPROVED_PLAN_STORE;
 process.env.WEB3LANE_APPROVED_PLAN_STORE=join(root,'plans');
 const plan=buildSwapDemoPlan();
 await mkdir(process.env.WEB3LANE_APPROVED_PLAN_STORE,{recursive:true});
 await writeFile(join(process.env.WEB3LANE_APPROVED_PLAN_STORE,`${plan.job_id}.json`),JSON.stringify(plan));
 const calls={supported:0,verify:0,settle:0};
 const facilitator={
  async getSupported(){calls.supported++;return {kinds:[{x402Version:2,scheme:'exact',network:'cardano:preprod'}]};},
  async verify(){calls.verify++;return {isValid:true};},
  async settle(payload){calls.settle++;return settle ? settle(payload,calls) : {success:true,network:'cardano:preprod',transaction:CANONICAL_TRANSACTION,extra:{status:'confirmed',confirmations:1}};},
 };
 const config={payTo:PAY_TO,facilitatorUrl:'https://facilitator.example',resourceUrl:'https://qa.example/x402/jobs',directory:join(root,'jobs'),stateDirectory:join(root,'state'),reservationDirectory:join(root,'reservations'),facilitator,now};
 try { await run({plan,calls,checkout:createX402Checkout(config),config,root}); }
 finally {if(previous===undefined)delete process.env.WEB3LANE_APPROVED_PLAN_STORE;else process.env.WEB3LANE_APPROVED_PLAN_STORE=previous;await rm(root,{recursive:true,force:true});}
}
const inputFor=(plan, nonce='a'.repeat(14))=>({identifier_from_purchaser:nonce,input_data:{prompt:'test',approved_job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash}});
const headerFor=(required, changes={})=>encodePaymentSignatureHeader({x402Version:2,resource:{url:required.resource.url},accepted:required.accepts[0],payload:{transaction:TRANSACTION,nonce:'a'.repeat(64)+'#0'},...changes});

test('issues a plan-bound exact Cardano 402 with no chain call',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);const reply=await checkout.checkout(input);
 assert.equal(reply.status,402);assert.equal(reply.body.payment_model,'direct');assert.equal(reply.body.automatic_refunds,false);
 const required=decodePaymentRequiredHeader(reply.headers['PAYMENT-REQUIRED']);
 assert.equal(required.accepts[0].amount,plan.budgets.service.fixed_total_units);
 assert.deepEqual(required.accepts[0].extra.qa.approvedPlanHash,input.input_data.approved_plan_hash);
 assert.equal(calls.verify,0);assert.equal(calls.settle,0);
}));

test('buyer identity owns x402 retries and status reads when supplied by the API',async()=>fixture(async({plan,checkout})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input,undefined,'buyer-a');
 assert.equal(quote.status,402);
 assert.equal((await checkout.checkout(input,undefined,'buyer-b')).status,404);
 assert.equal((await checkout.status(quote.body.job_id,'buyer-b')).status,404);
 assert.equal((await checkout.status(quote.body.job_id,'buyer-a')).status,200);
}));

test('new-plan admission runs once before issuing the first quote',async()=>fixture(async({plan,config})=>{
 const calls=[];const checkout=createX402Checkout({...config,onNewPlan:async (approved,buyerId)=>calls.push([approved.job_id,buyerId])});
 const input=inputFor(plan);assert.equal((await checkout.checkout(input,undefined,'buyer-a')).status,402);
 assert.equal((await checkout.checkout(input,undefined,'buyer-a')).status,402);
 assert.deepEqual(calls,[[plan.job_id,'buyer-a']]);
}));

test('accepts one verified settlement once and returns the cached receipt on replay',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);const header=headerFor(decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']));
 const first=await checkout.checkout(input,header);assert.equal(first.status,200);assert.equal(first.body.transaction,CANONICAL_TRANSACTION);
 assert.equal(decodePaymentResponseHeader(first.headers['PAYMENT-RESPONSE']).transaction,CANONICAL_TRANSACTION);
 const replay=await checkout.checkout(input,header);assert.equal(replay.status,200);assert.deepEqual(replay.body,first.body);
 assert.deepEqual(calls,{supported:1,verify:1,settle:1});
 const status=await checkout.status(first.body.id);assert.equal(status.status,200);assert.equal(status.body.status,'awaiting_execution');
}));

test('rejects invalid and quote-mismatched payment proofs before settlement',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);const required=decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']);
 assert.equal((await checkout.checkout(input,'invalid')).status,400);
 assert.equal((await checkout.checkout(input,headerFor(required,{resource:{url:'https://other.example'}}))).status,409);
 const altered=structuredClone(required.accepts[0]);altered.amount='999';
 assert.equal((await checkout.checkout(input,headerFor(required,{accepted:altered}))).status,409);
 assert.equal(calls.verify,0);assert.equal(calls.settle,0);
}));

test('one canonical transaction cannot pay another quote, including a changed witness nonce',async()=>fixture(async({plan,checkout,calls})=>{
 const firstInput=inputFor(plan,'a'.repeat(14));const firstQuote=await checkout.checkout(firstInput);const required=decodePaymentRequiredHeader(firstQuote.headers['PAYMENT-REQUIRED']);
 assert.equal((await checkout.checkout(firstInput,headerFor(required))).status,200);
 // A different request receives a second unpaid quote, but the body hash remains single-use.
 const other={...inputFor(plan,'b'.repeat(14)),input_data:{...firstInput.input_data,prompt:'different'}};
 const second=await checkout.checkout(other);assert.equal(second.status,402);
 const secondRequired=decodePaymentRequiredHeader(second.headers['PAYMENT-REQUIRED']);
 const alteredWitness=headerFor(secondRequired,{payload:{transaction:TRANSACTION,nonce:'b'.repeat(64)+'#0'}});
 assert.equal((await checkout.checkout(other,alteredWitness)).status,409);
 assert.equal(calls.settle,1);
}));

test('pending settlement is durable, does not re-verify, and resumes after restart',async()=>fixture(async({plan,checkout,config,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);const header=headerFor(decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']));
 calls.settle=0;config.facilitator.settle=async()=>{calls.settle++;throw new Error('timeout');};
 const pending=await checkout.checkout(input,header);assert.equal(pending.status,202);assert.equal(calls.verify,1);
 const resumedCalls={supported:0,verify:0,settle:0};
 config.facilitator={async getSupported(){resumedCalls.supported++;return {kinds:[{x402Version:2,scheme:'exact',network:'cardano:preprod'}]};},async verify(){resumedCalls.verify++;return {isValid:true};},async settle(){resumedCalls.settle++;return {success:true,network:'cardano:preprod',transaction:CANONICAL_TRANSACTION,extra:{status:'confirmed',confirmations:1}};}};
 const resumed=createX402Checkout(config);const done=await resumed.checkout(input,header);
 assert.equal(done.status,200);assert.equal(resumedCalls.verify,0);assert.equal(resumedCalls.settle,1);
}));

test('pre-canonicalization checkout retries preserve the issued hash and payment',async()=>fixture(async({plan,checkout,config,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);
 const file=join(config.directory,`${quote.body.job_id}.json`);
 const saved=JSON.parse(await readFile(file,'utf8'));
 const legacyHash=sha256(`${input.identifier_from_purchaser};${JSON.stringify(input.input_data)}`);
 assert.notEqual(legacyHash,inputHash(input.input_data,input.identifier_from_purchaser));
 saved.inputHash=legacyHash;
 saved.x402.requirements.extra.qa.inputHash=legacyHash;
 saved.x402.paymentRequired.accepts[0].extra.qa.inputHash=legacyHash;
 await writeFile(file,JSON.stringify(saved));
 const resumed=createX402Checkout(config);
 const retry=await resumed.checkout(input);
 assert.equal(retry.status,402);
 const required=decodePaymentRequiredHeader(retry.headers['PAYMENT-REQUIRED']);
 assert.equal(required.accepts[0].extra.qa.inputHash,legacyHash);
 const header=headerFor(required);
 assert.equal((await resumed.checkout(input,header)).status,200);
 assert.equal((await resumed.checkout(input,header)).status,200);
 assert.equal((await resumed.checkout({...input,input_data:{...input.input_data,prompt:'changed'}},header)).status,409);
 assert.equal(calls.settle,1);
 assert.equal(JSON.parse(await readFile(file,'utf8')).inputHash,legacyHash);
}));

test('changed approved plan never charges the buyer',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);const job=quote.body.job_id;
 // Modify the persisted approved plan after quote issuance; payment must not reach verification.
 const changed=structuredClone(plan);changed.budgets.service.fixed_total_units='9999999';
 await writeFile(join(process.env.WEB3LANE_APPROVED_PLAN_STORE,`${plan.job_id}.json`),JSON.stringify(changed));
 const required=decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']);const response=await checkout.checkout(input,headerFor(required));
 assert.equal(response.status,409);assert.equal(calls.verify,0);assert.equal(calls.settle,0);assert.ok(job);
}));

test('an expired quote never verifies or settles',async()=>{
 let clock=1_000_000;
 await fixture(async({plan,checkout,calls})=>{
  const input=inputFor(plan);const quote=await checkout.checkout(input);const required=decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']);
  clock+=600_001;const expired=await checkout.checkout(input,headerFor(required));
  assert.equal(expired.status,410);assert.equal(calls.verify,0);assert.equal(calls.settle,0);
 },{now:()=>clock});
});

test('a changed payment payload and a repeated failed settlement do not create another charge',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);const required=decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']);const header=headerFor(required);
 const pending=await checkout.checkout(input,header);assert.equal(pending.status,202);
 const changed=headerFor(required,{payload:{transaction:Buffer.from('84a3008001800300a0f5f6','hex').toString('base64'),nonce:'a'.repeat(64)+'#0'}});
 assert.equal((await checkout.checkout(input,changed)).status,409);
 assert.equal(calls.verify,1);assert.equal(calls.settle,1);
},{settle:async()=>({success:false,errorReason:'temporarily_unavailable',network:'cardano:preprod',transaction:CANONICAL_TRANSACTION})}));

test('definitive settlement rejection leaves a retry-safe tombstone',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);const header=headerFor(decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']));
 const rejected=await checkout.checkout(input,header);assert.equal(rejected.status,409);assert.equal(rejected.body.status,'payment_rejected');
 const retry=await checkout.checkout(input,header);assert.equal(retry.status,409);assert.equal(calls.settle,1);
},{settle:async()=>({success:false,errorReason:'exact_cardano_settlement_definitively_rejected',network:'cardano:preprod',transaction:CANONICAL_TRANSACTION})}));

test('a legacy Masumi reservation blocks x402 settlement for the same plan',async()=>fixture(async({plan,checkout,calls,config})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);
 await reserveApprovedExecution({id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',input:input.input_data,
  nonceKey:sha256('legacy-nonce'),inputHash:inputHash(input.input_data,'legacy-nonce')},config.reservationDirectory);
 const reply=await checkout.checkout(input,headerFor(decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED'])));
 assert.equal(reply.status,409);assert.match(reply.body.error,/plan already reserved/);assert.equal(calls.settle,0);
}));

test('one purchaser nonce cannot change its approved request body',async()=>fixture(async({plan,checkout,calls})=>{
 const input=inputFor(plan);await checkout.checkout(input);
 const reply=await checkout.checkout({...input,input_data:{...input.input_data,prompt:'different'}});
 assert.equal(reply.status,409);assert.equal(calls.verify,0);assert.equal(calls.settle,0);
}));

test('ambiguous settlement_failed retries the original payload instead of rejecting the job',async()=>fixture(async({plan,checkout,calls,config})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);
 const header=headerFor(decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']));
 const seen=[];
 config.facilitator.settle=async(payload,requirements)=>{
  calls.settle++;seen.push(structuredClone({payload,requirements}));
  return calls.settle===1
   ? {success:false,errorReason:'exact_cardano_settlement_failed',network:'cardano:preprod',transaction:CANONICAL_TRANSACTION,extra:{status:'unknown'}}
   : {success:true,network:'cardano:preprod',transaction:CANONICAL_TRANSACTION,extra:{status:'confirmed',confirmations:1}};
 };
 assert.equal((await checkout.checkout(input,header)).status,202);
 assert.equal((await checkout.checkout(input,header)).status,200);
 assert.equal(calls.verify,1);assert.equal(calls.settle,2);assert.deepEqual(seen[0],seen[1]);
}));

test('concurrent paid retries enter settlement only once',async()=>fixture(async({plan,checkout,calls,config})=>{
 const input=inputFor(plan);const quote=await checkout.checkout(input);
 const header=headerFor(decodePaymentRequiredHeader(quote.headers['PAYMENT-REQUIRED']));
 let enter,release;const entered=new Promise(resolve=>{enter=resolve;});const gate=new Promise(resolve=>{release=resolve;});
 config.facilitator.settle=async()=>{calls.settle++;enter();await gate;
  return {success:true,network:'cardano:preprod',transaction:CANONICAL_TRANSACTION,extra:{status:'confirmed',confirmations:1}};};
 const first=checkout.checkout(input,header);
 await entered;
 try {assert.equal((await checkout.checkout(input,header)).status,409);}
 finally {release();}
 assert.equal((await first).status,200);assert.equal(calls.settle,1);assert.equal(calls.verify,1);
}));
