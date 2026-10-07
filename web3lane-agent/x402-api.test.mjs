import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {approvePlan} from './agent/lib/plan.ts';
import {buildFixedQuote} from './agent/lib/quote.ts';
import {PREPROD_USDM} from './paid-finalization.mjs';
import {buildSwapDemoPlan} from './agent/lib/fixtures/swap-demo.ts';
import {provisionTestService,buyerFetch} from './tests/service-fixtures.mjs';

const source=dirname(fileURLToPath(import.meta.url));
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
const input=plan=>({identifier_from_purchaser:'1234567890abcd',input_data:{prompt:'test',approved_job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash}});

test('disabled x402 route cannot alter the existing Masumi checkout',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'x402-api-'));let child;
 const mps=createServer(async(req,res)=>{
  if(req.method==='GET'&&new URL(req.url,'http://127.0.0.1').pathname==='/api/v1/registry'){
   res.writeHead(200,{'content-type':'application/json'});
   return res.end(JSON.stringify({data:{Assets:[{supportedPaymentSources:[{chain:'Cardano',network:'Preprod',paymentSourceType:'Web3CardanoV2',pricing:{pricingType:'Fixed',fixed:[{asset:PREPROD_USDM,amount:'1000000'}]}}]}]}}));
  }
  let body='';for await(const part of req)body+=part;
  const request=JSON.parse(body);assert.equal(request.RequestedFunds,undefined);res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({data:{...request,RequestedFunds:[{unit:PREPROD_USDM,amount:'1000000'}],blockchainIdentifier:'legacy-payment',PaymentSource:{network:'Preprod'}}}));
 });
 const mpsPort=await listen(mps);const probe=createServer();const port=await listen(probe);await close(probe);
 try {
  const serviceEnv=await provisionTestService(directory);
  let plan=buildSwapDemoPlan();const approval=plan.approval;delete plan.approval;
  plan.budgets.service=buildFixedQuote({base_fee_units:'1000000',contingency_percent:0,asset:'USDM'});plan=approvePlan(plan,approval);
  await mkdir(join(directory,'.local','approved-plans'),{recursive:true});
  await writeFile(join(directory,'.local','approved-plans',`${plan.job_id}.json`),JSON.stringify(plan));
  await writeFile(join(directory,'.local','registration-state.json'),JSON.stringify({registrationState:'UpdateConfirmed',agentIdentifier:'test-agent',supportedPaymentSourceIndex:0,sellerVkey:'test-seller'}));
  child=spawn(process.execPath,[join(source,'agent-api.mjs')],{cwd:directory,env:{...serviceEnv,AGENT_API_PORT:String(port),MPS_URL:`http://127.0.0.1:${mpsPort}`,MPS_RUNTIME_TOKEN:'test'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('API startup timeout')),5000);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`API exited ${code}`));});child.stdout.on('data',data=>{if(String(data).includes('Agent API running')){clearTimeout(timer);resolve();}});});
  const x402=await buyerFetch(`http://127.0.0.1:${port}/x402/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input(plan))});
  assert.equal(x402.status,503);assert.equal((await x402.json()).error,'x402 checkout is not configured');
  const legacy=await buyerFetch(`http://127.0.0.1:${port}/start_job`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input(plan))});
  assert.equal(legacy.status,200);assert.equal((await legacy.json()).blockchainIdentifier,'legacy-payment');
 } finally {if(child){child.kill();await new Promise(resolve=>child.exitCode===null?child.once('exit',resolve):resolve());}await close(mps);await rm(directory,{recursive:true,force:true});}
});
