import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from '@x402/core/http';
import { prepareX402Job, submitX402Job } from './x402-client.mjs';
import { inputHash } from './standard-hash.mjs';

const url = 'http://127.0.0.1:21950/x402/jobs';
const payTo = 'addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6';
const input = {identifier_from_purchaser:'1234567890abcdef',input_data:{prompt:'QA',approved_job_id:'approved-job',
  plan_version:1,approved_plan_hash:'a'.repeat(64)}};
const requirement = {scheme:'exact',network:'cardano:preprod',asset:'lovelace',amount:'25000000',payTo,maxTimeoutSeconds:600,
  extra:{areFeesSponsored:false,confirmationPolicy:{l1Confirmations:1},qa:{jobId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    inputHash:inputHash(input.input_data,input.identifier_from_purchaser),approvedJobId:input.input_data.approved_job_id,
    planVersion:1,approvedPlanHash:input.input_data.approved_plan_hash}}};
const quote = req => new Response('{}',{status:402,headers:{'PAYMENT-REQUIRED':encodePaymentRequiredHeader({
  x402Version:2,resource:{url,description:'QA',mimeType:'application/json'},accepts:[req]})}});

test('buyer signs once; saved attempt retries identical payload without signing',async()=>{
  let signs=0;
  const signer = {async buildAndSignPaymentTransaction(terms) {
    signs++; assert.equal(terms.amount,requirement.amount);
    return {transaction:Buffer.from('84a3008001800200a0f5f6','hex').toString('base64'),nonce:'b'.repeat(64)+'#0'};
  }};
  const {attempt} = await prepareX402Job({url,input,signer,payTo,asset:'lovelace',amount:requirement.amount,
    fetchImpl:async()=>quote(requirement)});
  assert.equal(signs,1);
  assert.deepEqual(decodePaymentSignatureHeader(attempt.paymentHeader).accepted,requirement);
  const sends=[];
  const fetchImpl=async(target,options)=>{sends.push({target,options});return new Response('{}',{status:202});};
  await submitX402Job(attempt,{fetchImpl});
  await submitX402Job(JSON.parse(JSON.stringify(attempt)),{fetchImpl});
  assert.deepEqual(sends[0],sends[1]); assert.equal(signs,1);
  assert.equal(sends[0].options.redirect,'error');
});

test('buyer rejects changed price, recipient, network, plan or escrow before signing',async()=>{
  let signs=0;
  const signer={async buildAndSignPaymentTransaction(){signs++;throw new Error('Must not sign');}};
  const changes=[{amount:'26000000'},{payTo:payTo+'q'},{network:'cardano:mainnet'},{asset:'different'},{maxTimeoutSeconds:86400},
    {extra:{...requirement.extra,assetTransferMethod:'masumi'}},
    {extra:{...requirement.extra,qa:{...requirement.extra.qa,approvedPlanHash:'f'.repeat(64)}}}];
  for(const change of changes)await assert.rejects(prepareX402Job({url,input,signer,payTo,asset:'lovelace',amount:requirement.amount,
    fetchImpl:async()=>quote({...requirement,...change})}),/differs/);
  assert.equal(signs,0);
});

test('already-paid or pending response never constructs another payment',async()=>{
  for(const status of [200,202]){
    const result=await prepareX402Job({url,input,payTo,asset:'lovelace',amount:requirement.amount,
      signer:{async buildAndSignPaymentTransaction(){assert.fail('must not sign');}},
      fetchImpl:async()=>new Response('{}',{status})});
    assert.equal(result.response.status,status); assert.equal(result.attempt,undefined);
  }
});

test('payment transport refuses insecure remote URLs',async()=>{
  await assert.rejects(submitX402Job({url:'http://qa.example.com/x402/jobs'}),/HTTPS/);
});
