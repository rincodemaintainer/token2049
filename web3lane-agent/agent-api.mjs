import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,mkdirSync,readdirSync} from 'node:fs';
import {approvedPlanForJob, assertPaymentQuote, paymentQuoteForPlan, reserveApprovedExecution, confirmedState, finalizeRecordedJob, submitRecordedResult, PREPROD_USDM} from './paid-finalization.mjs';
import {verifyEvidenceBundle} from './scripts/evidence-bundle.mjs';
import {inputHash,sha256} from './standard-hash.mjs';
import {paymentDeadlines} from './payment-deadlines.mjs';
import {createX402Checkout} from './x402-checkout.mjs';
import {loadApiClients} from './service-auth.mjs';
import {serviceDataPath as dataPath,writeJsonAtomic,acquireApiLock} from './service-storage.mjs';
import {loadTrustedRunnerAdapter,assertRunnerSupports,createServiceRunner} from './service-runner.mjs';
const jobsDir=dataPath('standard-jobs');mkdirSync(jobsDir,{recursive:true,mode:0o700});
const clients=loadApiClients(process.env.WEB3LANE_API_CLIENTS_FILE||dataPath('api-clients.json'));
const adapter=await loadTrustedRunnerAdapter(process.env.WEB3LANE_RUNNER_ADAPTER);
const admitPlan=async(plan,buyerId)=>{
 if(plan.approval.requester_id!==buyerId)throw Object.assign(new Error('Approved plan belongs to another buyer'),{httpStatus:403});
 try{await assertRunnerSupports(plan,{adapter});}
 catch{throw Object.assign(new Error('No trusted runner supports this approved plan'),{httpStatus:503});}
};
const token=process.env.MPS_RUNTIME_TOKEN;
const registry=()=>JSON.parse(readFileSync(dataPath('registration-state.json'),'utf8'));
const save=job=>writeJsonAtomic(`${jobsDir}/${job.id}.json`,job);
const load=id=>JSON.parse(readFileSync(`${jobsDir}/${id}.json`,'utf8'));
export async function mps(path,body){
 const response=await fetch(process.env.MPS_URL+'/api/v1'+path,{method:body?'POST':'GET',headers:{token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok)throw new Error(`Payment service HTTP ${response.status}`);return data.data;
}
async function assertFixedPaymentSource(reg) {
 const query=new URLSearchParams({network:'Preprod',filterAgentIdentifier:reg.agentIdentifier,filterPaymentSourceType:'Web3CardanoV2'});
 const entry=await mps(`/registry?${query}`);
 const source=entry.Assets?.[0]?.supportedPaymentSources?.[reg.supportedPaymentSourceIndex];
 if (entry.Assets?.length !== 1 || source?.chain !== 'Cardano' || source.network !== 'Preprod' ||
     source.paymentSourceType !== 'Web3CardanoV2' || source.pricing?.pricingType !== 'Fixed' ||
     source.pricing.fixed?.length !== 1 || source.pricing.fixed[0].asset !== PREPROD_USDM ||
     source.pricing.fixed[0].amount !== '1000000') {
  throw Object.assign(new Error('Selected registered Cardano payment source must use Fixed pricing of exactly 1 tUSDM'),{httpStatus:503});
 }
}
const schema={input_data:[{id:'prompt',type:'string',name:'web3lane brief',data:{description:'Describe the approved wallet QA job.'},validations:[{validation:'min',value:'1'},{validation:'max',value:'16000'}]}, {id:'approved_job_id',type:'string',name:'Host-approved job ID'}, {id:'plan_version',type:'number',name:'Approved plan version'}, {id:'approved_plan_hash',type:'string',name:'Approved plan hash'}]};
const respond=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data))};
const port=Number(process.env.AGENT_API_PORT||21950);
const x402=process.env.X402_PAY_TO?createX402Checkout({payTo:process.env.X402_PAY_TO,
 facilitatorUrl:process.env.X402_FACILITATOR_URL||'https://x402.preprod.dev.ecosyseng.cf-deployments.org',
 resourceUrl:process.env.X402_RESOURCE_URL||`http://127.0.0.1:${port}/x402/jobs`,onNewPlan:admitPlan}):undefined;
const releaseLock=await acquireApiLock();
const resolvePayment=job=>mps('/payment/resolve-blockchain-identifier',{network:'Preprod',blockchainIdentifier:job.payment.blockchainIdentifier,includeHistory:'true'});
const loadX402=id=>JSON.parse(readFileSync(dataPath('x402-jobs',`${id}.json`),'utf8'));
const runner=createServiceRunner({adapter,
 getFunding:async job=>job.paymentProtocol==='x402'
  ? {settlement:loadX402(job.id).x402.settlement}
  : {payment:await resolvePayment(job)},
 loadJob:loadX402,saveJob:job=>writeJsonAtomic(dataPath('x402-jobs',`${job.id}.json`),job),
});
const activeStarts=new Set();
const server=createServer({maxHeaderSize:128*1024,requestTimeout:30000,headersTimeout:15000},async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method==='GET'&&url.pathname==='/availability')return respond(res,200,{status:'available',type:'masumi-agent'});
 if(req.method==='GET'&&url.pathname==='/input_schema')return respond(res,200,schema);
 const buyer=clients.authenticate(req.headers.authorization);
 if(!buyer)return respond(res,401,{error:'Bearer authentication required'},{'www-authenticate':'Bearer'});
 if(req.method==='GET'&&url.pathname==='/x402/status'){
 if(!x402)return respond(res,503,{error:'x402 checkout is not configured'});
 const reply=await x402.status(url.searchParams.get('job_id'),buyer.id);return respond(res,reply.status,reply.body,reply.headers);
 }
 if(req.method==='GET'&&url.pathname==='/status'){
 const id=url.searchParams.get('job_id');if(!/^[0-9a-f-]{36}$/.test(id||''))return respond(res,400,{error:'Invalid job_id'});
 if(!existsSync(`${jobsDir}/${id}.json`))return respond(res,404,{error:'Job not found'});
 const job=load(id);if(job.buyerId!==buyer.id)return respond(res,404,{error:'Job not found'});
 return respond(res,200,{status:job.status,result:job.status==='completed'?job.result:undefined});
 }
 if(req.method!=='POST'||!['/start_job','/x402/jobs'].includes(url.pathname))return respond(res,404,{error:'Route not found'});
 let bytes=0,body='';for await(const part of req){bytes+=part.length;if(bytes>20000)return respond(res,413,{error:'Request too large'});body+=part}
 let input;try{input=JSON.parse(body)}catch{return respond(res,400,{error:'Invalid JSON'})}
 if(url.pathname==='/x402/jobs'){
 if(!x402)return respond(res,503,{error:'x402 checkout is not configured'});
 const reply=await x402.checkout(input,req.headers['payment-signature'],buyer.id);return respond(res,reply.status,reply.body,reply.headers);
 }
 const nonce=input.identifier_from_purchaser??input.identifierFromPurchaser;
 if(!/^[a-fA-F0-9]{14,26}$/.test(nonce||'')||typeof input.input_data?.prompt!=='string'||!input.input_data.prompt.trim()||input.input_data.prompt.length>16000||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.input_data.approved_job_id||'')||!Number.isInteger(input.input_data.plan_version)||input.input_data.plan_version<1||!/^[a-f0-9]{64}$/.test(input.input_data.approved_plan_hash||'')||Object.keys(input.input_data).some(k=>!['prompt','approved_job_id','plan_version','approved_plan_hash'].includes(k)))return respond(res,400,{error:'Expected purchaser nonce, prompt, and exact host-approved plan binding'});
 if(activeStarts.has(nonce))return respond(res,409,{error:'Checkout busy; retry unchanged'});
 activeStarts.add(nonce);
 try{
 // Persist before the payment write. Unknown outcomes require inspection, never automatic replay.
 const key=sha256(nonce);let job=readdirSync(jobsDir).filter(x=>/^[0-9a-f-]{36}\.json$/.test(x)).map(x=>load(x.replace('.json',''))).find(j=>j.nonceKey===key);
  if(job){if(job.buyerId!==buyer.id)return respond(res,409,{error:'Nonce unavailable'});if(inputHash(job.input,nonce)!==inputHash(input.input_data,nonce))return respond(res,409,{error:'Nonce already used with another input'});return respond(res,job.response?200:409,job.response||{error:'Payment outcome requires inspection'});}
  let approvedPlan;
  try{approvedPlan=await approvedPlanForJob({input:input.input_data});}
  catch{return respond(res,409,{error:'Missing or stale host-approved plan'});}
  await admitPlan(approvedPlan,buyer.id);
  const reg=registry();if(!['RegistrationConfirmed','UpdateConfirmed'].includes(reg.registrationState??reg.registration?.state))return respond(res,503,{error:'Registration not confirmed'});
  await assertFixedPaymentSource(reg);
  const terms=paymentDeadlines();
 const quote=paymentQuoteForPlan(approvedPlan,reg.agentIdentifier);
 if(quote.RequestedFunds[0].unit!==PREPROD_USDM||quote.RequestedFunds[0].amount!=='1000000')return respond(res,409,{error:'Approve a new plan with the fixed service fee of 1 tUSDM'});
 job={id:randomUUID(),buyerId:buyer.id,nonceKey:key,nonce,input:input.input_data,inputHash:inputHash(input.input_data,nonce),status:'awaiting_payment',phase:'payment-pending',quote};
 try{await reserveApprovedExecution(job);}catch(error){return respond(res,409,{error:error.message});}
 await save(job);
 const payment=await mps('/payment',{network:'Preprod',paymentSourceType:'Web3CardanoV2',supportedPaymentSourceIndex:reg.supportedPaymentSourceIndex,inputHash:job.inputHash,agentIdentifier:reg.agentIdentifier,identifierFromPurchaser:nonce,...terms});
 job.payment=payment;await save(job);assertPaymentQuote(payment,job);job.phase='waiting-payment';job.response={id:job.id,input_hash:job.inputHash,identifierFromPurchaser:nonce,blockchainIdentifier:payment.blockchainIdentifier,agentIdentifier:reg.agentIdentifier,sellerVKey:reg.sellerVkey,paymentSourceType:'Web3CardanoV2',supportedPaymentSourceIndex:reg.supportedPaymentSourceIndex,payByTime:Number(payment.payByTime),submitResultTime:Number(payment.submitResultTime),unlockTime:Number(payment.unlockTime),externalDisputeUnlockTime:Number(payment.externalDisputeUnlockTime)};await save(job);return respond(res,200,job.response);
 }finally{activeStarts.delete(nonce);}
 }catch(e){respond(res,e.httpStatus||500,{error:e.httpStatus?e.message:'Request failed. Inspect the saved job state before retrying.'})}
}).listen(port,process.env.AGENT_API_HOST||'127.0.0.1',()=>console.log('Agent API running',port));
let busy=false;
const poller=setInterval(async()=>{
 if(busy)return;busy=true;
 try{for(const file of readdirSync(jobsDir).filter(x=>/^[0-9a-f-]{36}\.json$/.test(x))){
 const job=load(file.replace('.json',''));try{
 if(!['waiting-payment','awaiting-result'].includes(job.phase))continue;
 const payment=await resolvePayment(job);
 if(job.phase==='awaiting-result'){if(payment.onChainState==='ResultSubmitted'&&payment.resultHash===job.resultHash&&confirmedState(payment,'ResultSubmitted')){job.phase='result-confirmed';job.status='completed';await save(job)}continue;}
 if(payment.onChainState!=='FundsLocked'||!confirmedState(payment,'FundsLocked'))continue;
 if(Number(payment.submitResultTime)<=Date.now()+120000){job.phase='deadline-blocked';job.status='failed';await save(job);continue;}
 try{await runner.dispatch(job);}catch{
  job.phase='execution-needs-inspection';job.status='blocked';await save(job);continue;
 }
 const finalPayment=await resolvePayment(job);
 await submitRecordedResult({job,payment:finalPayment,
 finalize:()=>finalizeRecordedJob({job,payment:finalPayment,verifyBundle:verifyEvidenceBundle}),save,
 submit:body=>mps('/payment/submit-result',body)});
 }catch(e){console.error('Standard job needs inspection',job.id)}
 }
 const x402Dir=dataPath('x402-jobs');
 if(x402&&existsSync(x402Dir))for(const file of readdirSync(x402Dir).filter(x=>/^[0-9a-f-]{36}\.json$/.test(x))){
  const job=loadX402(file.replace('.json',''));
  if(job.phase!=='x402-ready'||job.status!=='awaiting_execution')continue;
  try{await runner.dispatch(job);}catch{
   const latest=loadX402(job.id);latest.phase='execution-needs-inspection';latest.status='blocked';
   await writeJsonAtomic(dataPath('x402-jobs',`${job.id}.json`),latest);
  }
 }
 }catch{console.error('Service polling failed; inspect durable state');}finally{busy=false}
},5000);
let stopping=false;
async function stop(){
 if(stopping)return;stopping=true;clearInterval(poller);
 const drained=new Promise(resolve=>server.close(resolve));
 // Leave the lock after a forced stop; an operator must reconcile uncertain work.
 const deadline=setTimeout(()=>process.exit(1),10000);
 while(busy)await new Promise(resolve=>setTimeout(resolve,25));
 await drained;
 await releaseLock();clearTimeout(deadline);process.exit(0);
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
