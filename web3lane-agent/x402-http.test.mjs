import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { decodeCardanoTransaction } from '@x402/cardano';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { buildSwapDemoPlan } from './agent/lib/fixtures/swap-demo.ts';
import { prepareX402Job, submitX402Job } from './x402-client.mjs';
import { provisionTestService, buyerFetch, otherApiToken } from './tests/service-fixtures.mjs';

const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const stop = async child => {
  if (!child || child.exitCode !== null) return;
  child.kill(); await new Promise(resolve => child.once('exit',resolve));
};

test('SDK buyer and HTTP facilitator reconcile a pending payment after API restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'x402-http-'));
  const payTo='addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6';
  // Structural CBOR fixture only: the mock facilitator stands in for ledger verification.
  const transaction=Buffer.from('84a3008001800200a0f5f6','hex').toString('base64');
  const txId=decodeCardanoTransaction(transaction).txHash;
  let verifies=0,signs=0,child;
  const settlements=[];
  const facilitator=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    let reply;
    if(req.url==='/supported')reply={kinds:[{x402Version:2,scheme:'exact',network:'cardano:preprod',
      extra:{assetTransferMethods:['default'],areFeesSponsored:false,l1Confirmations:{minimum:0,maximum:20}}}],extensions:[],signers:{}};
    else if(req.url==='/verify'){verifies++;reply={isValid:true};}
    else if(req.url==='/settle'){
      settlements.push(JSON.parse(body));
      reply=settlements.length<=2
        ? {success:false,network:'cardano:preprod',transaction:txId,errorReason:'settlement_pending',extra:{status:'pending'}}
        : {success:true,network:'cardano:preprod',transaction:txId,extra:{status:'confirmed',confirmations:1}};
    } else {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));
  });
  const facilitatorPort=await listen(facilitator);
  const reservation=createServer();const port=await listen(reservation);await close(reservation);
  const url=`http://127.0.0.1:${port}/x402/jobs`;
  const serviceEnv=await provisionTestService(directory);
  const start=async()=>{
    child=spawn(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'agent-api.mjs')],{
      cwd:directory,env:{...serviceEnv,AGENT_API_PORT:String(port),X402_PAY_TO:payTo,
        X402_FACILITATOR_URL:`http://127.0.0.1:${facilitatorPort}`,X402_RESOURCE_URL:url},stdio:['ignore','pipe','pipe'],
    });
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('API startup timeout')),5000);
      child.once('exit',code=>{clearTimeout(timer);reject(new Error(`API exited ${code}`));});
      child.stdout.on('data',data=>{if(String(data).includes('Agent API running')){clearTimeout(timer);resolve();}});
    });
  };
  try {
    const plan=buildSwapDemoPlan();
    await mkdir(join(directory,'.local','approved-plans'),{recursive:true});
    await writeFile(join(directory,'.local','approved-plans',`${plan.job_id}.json`),JSON.stringify(plan));
    await start();
    const input={identifier_from_purchaser:'1234567890abcdef',input_data:{prompt:'QA',
      approved_job_id:plan.job_id,plan_version:plan.plan_version,approved_plan_hash:plan.approval.approved_plan_hash}};
    assert.equal((await fetch(url,{method:'POST',body:JSON.stringify(input)})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers:{authorization:`Bearer ${otherApiToken}`},body:JSON.stringify(input)})).status,403);
    assert.equal(signs,0);assert.equal(verifies,0);
    const {attempt}=await prepareX402Job({url,input,payTo,fetchImpl:buyerFetch,asset:'lovelace',amount:plan.budgets.service.fixed_total_units,
      signer:{async buildAndSignPaymentTransaction(){signs++;return {transaction,nonce:'a'.repeat(64)+'#0'};}}});
    assert.equal(signs,1);
    const pending=await submitX402Job(attempt,{fetchImpl:buyerFetch});assert.equal(pending.status,202);await pending.json();
    assert.equal(settlements.length,2);assert.equal(verifies,1);
    await stop(child);await start();
    const completed=await submitX402Job(JSON.parse(JSON.stringify(attempt)),{fetchImpl:buyerFetch});
    assert.equal(completed.status,200);
    assert.equal(decodePaymentResponseHeader(completed.headers.get('PAYMENT-RESPONSE')).transaction,txId);
    const job=await completed.json();assert.equal(job.status,'awaiting_execution');assert.equal(job.automatic_refunds,false);
    assert.equal(verifies,1);assert.equal(signs,1);assert.equal(settlements.length,3);
    for(const request of settlements)assert.deepEqual(request,settlements[0]);
    const replay=await submitX402Job(attempt,{fetchImpl:buyerFetch});assert.equal(replay.status,200);assert.deepEqual(await replay.json(),job);
    assert.equal(settlements.length,3);
    assert.equal((await fetch(`http://127.0.0.1:${port}${job.status_url}`,{headers:{authorization:`Bearer ${otherApiToken}`}})).status,404);
    const status=await buyerFetch(`http://127.0.0.1:${port}${job.status_url}`);assert.equal(status.status,200);
    assert.equal((await status.json()).status,'awaiting_execution');
  } finally {await stop(child);await close(facilitator);await rm(directory,{recursive:true,force:true});}
});
