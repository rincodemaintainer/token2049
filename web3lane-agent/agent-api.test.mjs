import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { approvePlan } from './agent/lib/plan.ts';
import { buildFixedQuote } from './agent/lib/quote.ts';
import { PREPROD_USDM } from './paid-finalization.mjs';
import { buildSwapDemoPlan } from './agent/lib/fixtures/swap-demo.ts';
import { provisionTestService, buyerFetch, otherApiToken } from './tests/service-fixtures.mjs';

const fixedSource = () => ({chain:'Cardano',network:'Preprod',paymentSourceType:'Web3CardanoV2',pricing:{pricingType:'Fixed',fixed:[{asset:PREPROD_USDM,amount:'1000000'}]}});
const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
for (const differentNonce of [false,true]) test(`concurrent ${differentNonce ? 'different' : 'same'} nonces create one payment per approved plan`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'wallet-api-test-'));
 let paymentWrites=0, registryReads=0, sources=[fixedSource()], child;
 const paymentServer=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/api/v1/registry'){
   registryReads++;
   res.writeHead(200,{'content-type':'application/json'});
   return res.end(JSON.stringify({data:{Assets:[{supportedPaymentSources:sources}]}}));
  }
  let text='';for await(const chunk of req)text+=chunk;
  const request=JSON.parse(text);paymentWrites++;
  assert.equal(request.RequestedFunds,undefined,'Fixed pricing must be derived by MPS');
  // Simulate an uncertainly slow external payment response; second request must not replay.
  await new Promise(resolve=>setTimeout(resolve,50));
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({data:{...request,blockchainIdentifier:'fake-test-escrow',RequestedFunds:[{unit:PREPROD_USDM,amount:'1000000'}],PaymentSource:{network:'Preprod'}}}));
 });
 const paymentPort=await listen(paymentServer);
 const reservation=createServer();const agentPort=await listen(reservation);await close(reservation);
 try {
  const serviceEnv=await provisionTestService(directory);
  let plan=buildSwapDemoPlan();
  const approval=plan.approval;delete plan.approval;
  plan.budgets.service=buildFixedQuote({base_fee_units:'1000000',contingency_percent:0,asset:'USDM'});
  plan=approvePlan(plan,approval);
  await mkdir(join(directory,'.local','approved-plans'),{recursive:true});
  await writeFile(join(directory,'.local','approved-plans',`${plan.job_id}.json`),JSON.stringify(plan));
  await writeFile(join(directory,'.local','registration-state.json'),JSON.stringify({registrationState:'RegistrationConfirmed',agentIdentifier:'fake-test-agent',supportedPaymentSourceIndex:0,sellerVkey:'fake-test-key'}));
  child=spawn(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'agent-api.mjs')],{
   cwd:directory,env:{...serviceEnv,AGENT_API_PORT:String(agentPort),MPS_URL:`http://127.0.0.1:${paymentPort}`,MPS_RUNTIME_TOKEN:'fake-test-token'},stdio:['ignore','pipe','pipe'],
  });
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Test API startup timeout')),5000);
   child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Test API exited ${code}`));});
   child.stdout.on('data',data=>{if(String(data).includes('Agent API running')){clearTimeout(timer);resolve();}});
  });
  const input={identifier_from_purchaser:'1234567890abcdef',input_data:{prompt:'test',approved_job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash}};
  const endpoint=`http://127.0.0.1:${agentPort}/start_job`;
  assert.equal((await fetch(endpoint,{method:'POST',body:JSON.stringify(input)})).status,401);
  assert.equal((await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${otherApiToken}`},body:JSON.stringify(input)})).status,403);
  assert.equal(paymentWrites,0);
  const unsupported=buildSwapDemoPlan({job_id:'browser-unsupported'});
  await writeFile(join(directory,'.local','approved-plans',`${unsupported.job_id}.json`),JSON.stringify(unsupported));
  const unsupportedReply=await buyerFetch(endpoint,{method:'POST',body:JSON.stringify({...input,input_data:{...input.input_data,approved_job_id:unsupported.job_id,approved_plan_hash:unsupported.approval.approved_plan_hash}})});
  assert.equal(unsupportedReply.status,503);assert.equal(paymentWrites,0);
  const start=(nonce=input.identifier_from_purchaser)=>buyerFetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,identifier_from_purchaser:nonce})});
  const invalidSources=[
   [{...fixedSource(),pricing:{pricingType:'Dynamic'}}],
   [{...fixedSource(),pricing:{pricingType:'Fixed',fixed:[{asset:PREPROD_USDM,amount:'2000000'}]}}],
   [{...fixedSource(),pricing:{pricingType:'Fixed',fixed:[{asset:'',amount:'1000000'}]}}],
   [{...fixedSource(),pricing:{pricingType:'Fixed',fixed:[{asset:PREPROD_USDM,amount:'1000000'},{asset:PREPROD_USDM,amount:'1000000'}]}}],
   [{chain:'Cardano',network:'Preprod',paymentSourceType:'Web3CardanoV2',pricing:{pricingType:'Fixed'}}],
   [],
   [{chain:'Cardano',network:'Mainnet',paymentSourceType:'Web3CardanoV2',pricing:{pricingType:'Dynamic'}}],
  ];
  for(const invalid of invalidSources){
   sources=invalid;
   assert.equal((await start()).status,503);assert.equal(paymentWrites,0);
  }
  sources=[fixedSource()];
  const oldPlan=buildSwapDemoPlan();
  await writeFile(join(directory,'.local','approved-plans',`${plan.job_id}.json`),JSON.stringify(oldPlan));
  const oldReply=await buyerFetch(endpoint,{method:'POST',body:JSON.stringify({...input,input_data:{...input.input_data,approved_plan_hash:oldPlan.approval.approved_plan_hash}})});
  assert.equal(oldReply.status,409);assert.equal(paymentWrites,0);
  await writeFile(join(directory,'.local','approved-plans',`${plan.job_id}.json`),JSON.stringify(plan));
  const responses=await Promise.all([start(),start(differentNonce ? 'abcdef1234567890' : input.identifier_from_purchaser)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(paymentWrites,1);
  assert.equal(registryReads,(differentNonce?2:1)+invalidSources.length+1);
  const first=await responses.find(r=>r.status===200).json();
  assert.equal((await fetch(`http://127.0.0.1:${agentPort}/status?job_id=${first.id}`,{headers:{authorization:`Bearer ${otherApiToken}`}})).status,404);
  assert.equal((await buyerFetch(`http://127.0.0.1:${agentPort}/status?job_id=${first.id}`)).status,200);
  const jobFile=join(directory,'.local','standard-jobs',`${first.id}.json`);
  const saved=JSON.parse(await readFile(jobFile,'utf8'));saved.inputHash='legacy-format-hash';await writeFile(jobFile,JSON.stringify(saved));
  const replay=await start(first.identifierFromPurchaser);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),first);
  assert.equal(paymentWrites,1);
  const changed=await buyerFetch(`http://127.0.0.1:${agentPort}/start_job`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,identifier_from_purchaser:first.identifierFromPurchaser,input_data:{...input.input_data,prompt:'changed'}})});
  assert.equal(changed.status,409);assert.equal(paymentWrites,1);
 } finally {
  if(child){child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));}
  await close(paymentServer);await rm(directory,{recursive:true,force:true});
 }
});
