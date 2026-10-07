import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSwapDemoPlan, swapDemoObservations } from './agent/lib/fixtures/swap-demo.ts';
import { runPlanWithObservations } from "./agent/lib/runner.ts";
import { persistApprovedPlan } from './agent/lib/approved-plan-store.ts';
import { approvedPlanForJob, paymentQuoteForPlan, x402QuoteForPlan, reserveApprovedExecution, beginPaidExecution, beginX402Execution, assertEscrow, assertX402Settlement, registerRecordedRun, registerX402RecordedRun, finalizeRecordedJob, finalizeX402RecordedJob, submitRecordedResult } from './paid-finalization.mjs';
import { inputHash, resultHash, sha256 } from './standard-hash.mjs';
async function fixture(run) {
 const directory=await mkdtemp(join(tmpdir(),'paid-finalization-')); const previous=process.env.WEB3LANE_APPROVED_PLAN_STORE;
 process.env.WEB3LANE_APPROVED_PLAN_STORE=join(directory,'plans');
 try {
  const plan=buildSwapDemoPlan();
  const job={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',nonce:'1234567890abcd',inputHash:'bound-input',phase:'waiting-payment',input:{prompt:'test',approved_job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash},payment:{blockchainIdentifier:'escrow-1'}};
  job.quote=paymentQuoteForPlan(plan,'registered-agent');
  const payment={inputHash:job.inputHash,agentIdentifier:job.quote.agentIdentifier,RequestedFunds:job.quote.RequestedFunds,PaymentSource:{network:'Preprod'},blockchainIdentifier:'escrow-1',onChainState:'FundsLocked',submitResultTime:Date.now()+3600000,CurrentTransaction:{status:'Confirmed',newOnChainState:'FundsLocked'}};
  const artifacts=[...new Set([...plan.cases.flatMap(c=>c.evidence),'session-log'])].map(id=>({id,path:`evidence/${id}`,sha256:'a'.repeat(64),byte_size:10}));
  const recording={payment_job_id:job.id,input_hash:job.inputHash,approved_job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash,bundle_dir:directory,started_at:new Date().toISOString(),recorded_at:new Date().toISOString(),session_id:'unassigned',observations:swapDemoObservations(),artifacts};
  const verifyBundle=async()=>({executionRecord:executionRecord(recording),report:{caseResults:JSON.parse(JSON.stringify(runPlanWithObservations({plan,observations:recording.observations,session_id:recording.session_id,now:()=>recording.recorded_at}).cases)),run:{startedAt:recording.started_at,endedAt:recording.recorded_at},job:{job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash}},manifestHash:'b'.repeat(64),manifest:{files:artifacts.map(a=>({path:a.path,sha256:a.sha256,bytes:a.byte_size}))}});
  await run({directory,plan,job,payment,recording,verifyBundle});
 } finally {if(previous===undefined)delete process.env.WEB3LANE_APPROVED_PLAN_STORE;else process.env.WEB3LANE_APPROVED_PLAN_STORE=previous;await rm(directory,{recursive:true,force:true});}
}
test('missing/stale/forged approval fails closed',()=>fixture(async({job,plan,payment,directory,recording})=>{
 await assert.rejects(approvedPlanForJob(job),/No approved plan/);await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);
 await assert.rejects(approvedPlanForJob({...job,input:{...job.input,plan_version:2}}),/version/);
 await assert.rejects(approvedPlanForJob({...job,input:{...job.input,approved_plan_hash:'0'.repeat(64)}}),/hash/);
 assert.equal((await approvedPlanForJob(job)).job_id,plan.job_id);
}));
test('escrow must be confirmed, current, matched, with submission time',()=>fixture(async({job,payment})=>{
 for(const change of [{onChainState:'ResultSubmitted'},{CurrentTransaction:{status:'Pending'}},{blockchainIdentifier:'other'},{submitResultTime:NaN},{submitResultTime:Date.now()+60000}])assert.throws(()=>assertEscrow({...payment,...change},job));
}));
test('immutable recording yields deterministic complete report with defect',()=>fixture(async({job,payment,plan,directory,recording,verifyBundle})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);await registerRecordedRun({job,payment,run:recording,directory});await registerRecordedRun({job,payment,run:recording,directory});
 await assert.rejects(registerRecordedRun({job,payment,run:{...recording,bundle_dir:'changed'},directory}),/already exists/);
 const a=await finalizeRecordedJob({job,payment,verifyBundle,directory}),b=await finalizeRecordedJob({job,payment,verifyBundle,directory});assert.deepEqual(a,b);
 const result=JSON.parse(a.result);assert.equal(result.report.delivery_complete,true);assert.equal(result.report.cases.find(c=>c.case_id==='NOTIFY-01').outcome,'FAIL');
}));
test('missing evidence and incomplete recorded work cannot finalize',()=>fixture(async({job,payment,plan,directory,recording,verifyBundle})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);await assert.rejects(finalizeRecordedJob({job,payment,verifyBundle,directory}),/ENOENT/);
 recording.observations=recording.observations.slice(0,1);await registerRecordedRun({job,payment,run:recording,directory});
 await assert.rejects(finalizeRecordedJob({job,payment,verifyBundle,directory}),/incomplete/);
 await assert.rejects(finalizeRecordedJob({job,payment,directory,verifyBundle:async()=>({...await verifyBundle(),manifest:{files:[]}})}),/not verified/);
}));
test('unknown transaction and cross-job recording rejected',()=>fixture(async({job,payment,plan,directory,recording,verifyBundle})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);await assert.rejects(registerRecordedRun({job,payment,run:{...recording,input_hash:'forged'},directory}),/input_hash/);
 recording.observations[2].transaction.status='unknown';await registerRecordedRun({job,payment,run:recording,directory});
 await assert.rejects(finalizeRecordedJob({job,payment,verifyBundle,directory}),/Unknown transaction/);
}));
test('unknown submit persists pending; retry does not duplicate',()=>fixture(async({job,payment})=>{
 let submits=0,saved;const options={job,payment,finalize:async()=>({result:'artifact',resultHash:'hash',manifestHash:'manifest'}),save:async value=>{saved=structuredClone(value)},submit:async()=>{submits++;throw new Error('timeout')}};
 await assert.rejects(submitRecordedResult(options),/timeout/);assert.equal(saved.phase,'submit-pending');assert.equal(await submitRecordedResult(options),false);assert.equal(submits,1);
}));
test('approval binding enters input digest; every input field is committed',()=>{
 const input={prompt:'test',approved_job_id:'job',plan_version:1,approved_plan_hash:'a'.repeat(64)};
 for(const change of [{plan_version:2},{approved_job_id:'other'},{approved_plan_hash:'b'.repeat(64)}])assert.notEqual(inputHash(input,'123'),inputHash({...input,...change},'123'));
 assert.notEqual(inputHash({prompt:'test',ignored:true},'123'),inputHash({prompt:'test'},'123'));
});
test('MIP-004 input hashing uses the canonical JSON preimage',()=>{
 const input={prompt:'test',approved_job_id:'job-1',plan_version:1,approved_plan_hash:'a'.repeat(64)};
 assert.equal(inputHash(input,'1234567890abcd'),'2534c0270f9eeafa80930266a22b03968bb959af3ce9897938f2441b43bef22b');
 assert.equal(inputHash(Object.fromEntries(Object.entries(input).reverse()),'1234567890abcd'),inputHash(input,'1234567890abcd'));
 const nested={z:[{b:2,a:1},'é'],a:{'2':2,'10':10}};
 assert.equal(inputHash(nested,'nonce'),sha256('nonce;{"a":{"10":10,"2":2},"z":[{"a":1,"b":2},"é"]}'));
 assert.notEqual(inputHash({...nested,z:[...nested.z].reverse()},'nonce'),inputHash(nested,'nonce'));
 assert.equal(inputHash({prompt:'test'},'123'),sha256('123;{"prompt":"test"}'));
 assert.equal(resultHash('raw result\n','123'),sha256('123;raw result\n'));
});

test('recording requires prior host-funded execution authorization',()=>fixture(async({job,payment,plan,directory,recording})=>{
 await persistApprovedPlan(plan);
 await assert.rejects(registerRecordedRun({job,payment,run:recording,directory}),/ENOENT/);
 await authorize(job,payment,directory,recording);
 await assert.rejects(beginPaidExecution({job,payment,directory}),/already authorized/);
 await assert.rejects(registerRecordedRun({job,payment,run:{...recording,recorded_at:'2020-01-01T00:00:00.000Z'},directory}),/must follow/);
}));

test('approved quote maps exact fee and rejects unsupported payment terms',()=>{
 const plan=buildSwapDemoPlan();
 assert.deepEqual(paymentQuoteForPlan(plan,'agent').RequestedFunds,[{unit:'lovelace',amount:plan.budgets.service.fixed_total_units}]);
 assert.deepEqual(x402QuoteForPlan(plan),{network:'cardano:preprod',asset:'lovelace',amount:plan.budgets.service.fixed_total_units});
 const usdm={...plan,budgets:{...plan.budgets,service:{...plan.budgets.service,asset:'USDM'}}};
 assert.equal(paymentQuoteForPlan(usdm,'agent').RequestedFunds[0].unit,'16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d');
 assert.equal(x402QuoteForPlan(usdm).asset,'16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde.0014df10745553444d');
 for(const change of [{network:'Mainnet'},{decimals:18},{asset:'USDC'},{fixed_total_units:'0'},{fixed_total_units:'1.5'}])assert.throws(()=>paymentQuoteForPlan({...plan,budgets:{...plan.budgets,service:{...plan.budgets.service,...change}}},'agent'),/Unsupported/);
});
test('escrow terms cannot drift from bound approved quote',()=>fixture(async({job,payment,plan})=>{
 for(const change of [{inputHash:'different'},{agentIdentifier:'different'},{PaymentSource:{network:'Mainnet'}},{RequestedFunds:[{...job.quote.RequestedFunds[0],amount:'1000000'}]},{RequestedFunds:[{...job.quote.RequestedFunds[0],unit:'other'}]}])assert.throws(()=>assertEscrow({...payment,...change},job),/quote/);
 await persistApprovedPlan(plan);
 await assert.rejects(approvedPlanForJob({...job,quote:{...job.quote,RequestedFunds:[{...job.quote.RequestedFunds[0],amount:'1000000'}]}}),/service fee/);
}));
test('MPS normalized ADA unit matches the approved quote without relaxing token or amount checks',()=>fixture(async({job,payment,plan})=>{
 const normalized={...payment,RequestedFunds:[{...payment.RequestedFunds[0],unit:''}]};
 assert.doesNotThrow(()=>assertEscrow(normalized,job));
 assert.throws(()=>assertEscrow({...normalized,RequestedFunds:[{unit:'',amount:'1'}]},job),/quote/);
 const usdm={...plan,budgets:{...plan.budgets,service:{...plan.budgets.service,asset:'USDM'}}};
 assert.throws(()=>assertEscrow(normalized,{...job,quote:paymentQuoteForPlan(usdm,'registered-agent')}),/quote/);
}));

function executionRecord(recording) {
 const record={schemaVersion:1};
 for(const key of ['payment_job_id','input_hash','approved_job_id','plan_version','approved_plan_hash','session_id','started_at','recorded_at','observations'])record[key]=structuredClone(recording[key]);
 return record;
}
async function authorize(job,payment,directory,recording) {
 const authorized=await beginPaidExecution({job,payment,directory});
 recording.session_id=authorized.session_id;recording.started_at=authorized.started_at;recording.recorded_at=new Date().toISOString();
 return authorized;
}
function x402Job(job,plan) {
 const quote=x402QuoteForPlan(plan);const transaction='a'.repeat(64);
 return {...structuredClone(job),paymentProtocol:'x402',quote,phase:'x402-ready',status:'awaiting_execution',x402:{
  requirements:{scheme:'exact',network:quote.network,amount:quote.amount,asset:quote.asset,payTo:'addr_test1seller',extra:{confirmationPolicy:{l1Confirmations:1},qa:{jobId:job.id,inputHash:job.inputHash,approvedJobId:job.input.approved_job_id,planVersion:job.input.plan_version,approvedPlanHash:job.input.approved_plan_hash}}},
  transaction,settlement:{success:true,network:quote.network,transaction,extra:{status:'confirmed',confirmations:1}}
 }};
}
test('different purchaser nonces atomically reserve only one approved execution',()=>fixture(async({job,directory})=>{
 const results=await Promise.allSettled([reserveApprovedExecution({...job,nonceKey:'a'},directory),reserveApprovedExecution({...job,id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',nonceKey:'b'},directory)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 await assert.rejects(reserveApprovedExecution({...job,nonceKey:'c'},directory),/already reserved/);
}));
test('future, expired, unapproved or wrong-session recording rejected',()=>fixture(async({job,payment,plan,directory,recording})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);
 for(const change of [{recorded_at:new Date(Date.now()+3600000).toISOString()},{recorded_at:new Date(Number(payment.submitResultTime)+1).toISOString()},{started_at:'2020-01-01T00:00:00.000Z'},{session_id:'forged'}])await assert.rejects(registerRecordedRun({job,payment,run:{...recording,...change},directory}),/must follow/);
}));
test('different evidence IDs cannot alias one verified artifact',()=>fixture(async({job,payment,plan,directory,recording,verifyBundle})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);recording.artifacts[1]={...recording.artifacts[0],id:recording.artifacts[1].id};
 await registerRecordedRun({job,payment,run:recording,directory});await assert.rejects(finalizeRecordedJob({job,payment,verifyBundle,directory}),/Duplicate artifact path/);
}));
test('verified execution observations and bundle interval must match trusted run',()=>fixture(async({job,payment,plan,directory,recording,verifyBundle})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);await registerRecordedRun({job,payment,run:recording,directory});
 for(const change of [undefined,{...executionRecord(recording),session_id:'other'},{...executionRecord(recording),observations:[]}])await assert.rejects(finalizeRecordedJob({job,payment,directory,verifyBundle:async()=>({...await verifyBundle(),executionRecord:change})}),/execution record/);
 const verified=await verifyBundle();
 for(const times of [{startedAt:'2020-01-01T00:00:00.000Z',endedAt:recording.recorded_at},{startedAt:recording.started_at,endedAt:new Date(Date.now()+3600000).toISOString()}])await assert.rejects(finalizeRecordedJob({job,payment,directory,verifyBundle:async()=>({...verified,report:{...verified.report,run:times}})}),/timestamps/);
}));

test('static bundle case outcomes cannot differ from the paid assessment',()=>fixture(async({job,payment,plan,directory,recording,verifyBundle})=>{
 await persistApprovedPlan(plan);await authorize(job,payment,directory,recording);await registerRecordedRun({job,payment,run:recording,directory});
 const verified=await verifyBundle();
 const forged=structuredClone(verified);forged.report.caseResults.find(c=>c.case_id==='NOTIFY-01').outcome='PASS';
 await assert.rejects(finalizeRecordedJob({job,payment,directory,verifyBundle:async()=>forged}),/case results differ/);
}));
test('direct x402 receipt rejects pending, forged, and mismatched payment claims',()=>fixture(async({job,plan})=>{
 const direct=x402Job(job,plan);
 const pending=structuredClone(direct);pending.x402.settlement.extra={status:'pending',confirmations:0};
 const forged=structuredClone(direct);forged.x402.settlement.transaction='b'.repeat(64);
 const mismatched=structuredClone(direct);mismatched.x402.requirements.amount='999';
 const escrow=structuredClone(direct);escrow.x402.requirements.extra.assetTransferMethod='masumi';
 assert.throws(()=>assertX402Settlement(pending),/confirmed receipt/);
 assert.throws(()=>assertX402Settlement(forged),/confirmed receipt/);
 assert.throws(()=>assertX402Settlement(mismatched),/terms/);
 assert.throws(()=>assertX402Settlement(escrow),/terms/);
}));
test('direct x402 finalization creates a sealed completed report without MPS',()=>fixture(async({job,plan,recording,verifyBundle,directory})=>{
 await persistApprovedPlan(plan);
 const direct=x402Job(job,plan);
 const authorization=await beginX402Execution({job:direct,directory});
 recording.session_id=authorization.session_id;recording.started_at=authorization.started_at;recording.recorded_at=new Date().toISOString();
 await registerX402RecordedRun({job:direct,run:recording,directory});
 const finalized=await finalizeX402RecordedJob({job:direct,verifyBundle,directory});
 const result=JSON.parse(finalized.result);
 assert.equal(result.report.payment_state,'x402-settled');
 assert.equal(result.report.review.require_live_protocol_deadline,false);
 assert.equal(result.report.review.note,'Direct x402 payment settled. No automatic escrow refund is available.');
 assert.equal(result.report.execution_bundle_hash.length,64);
}));
test('concurrent direct x402 begins get one durable authorization',()=>fixture(async({job,plan,directory})=>{
 await persistApprovedPlan(plan);
 const first=x402Job(job,plan),second=structuredClone(first);
 const results=await Promise.allSettled([beginX402Execution({job:first,directory}),beginX402Execution({job:second,directory})]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.filter(result=>result.status==='rejected').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.message,'Execution already authorized; inspect before rerunning');
 assert.equal(first.status==='running'||second.status==='running',true);
}));
