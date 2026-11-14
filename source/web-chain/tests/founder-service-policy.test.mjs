import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FOUNDER_RECOVERY as R, assertFounderCreationAllowed, founderCreationAvailability, recoveryAdmission, assertFounderRecoveryPreparation, assertFounderRecoveryDispatch, checkFounderRecoveryWork} from '../src/founder-service-policy.js';
import {createFounderClient, readFounderReadiness} from '../src/founder-journey-client.js';
import {founderRequest, founderCreateAction, prepareFounderSetup, founderWorkerReadiness, founderAIPolicy} from '../src/founder-journey-core.js';

const config=JSON.parse(await readFile(new URL('../src/founder-config.json',import.meta.url),'utf8'));
const now=Math.floor(Date.now()/1000), block={height:123,hash:'1'.repeat(32)};
const snapshot=()=>({companyId:R.company,now,
  company:{owner:R.owner,operator:R.operator,frozen:false,lifetime_tasks:1,task_count:0,storage_blocks:2},
  policy:{...founderAIPolicy(),version:1,count:1},
  originalTask:{id:R.originalTask,status:'archived',kind:'general',operation:'website_build',approved_by:R.owner,evidence_hash:'a'.repeat(64),worker_key_id:R.workerKey,execution_profile_version:1},
  service:{schema:'near-founder-worker-service-v1',operator_id:config.operator_id,worker_public_key:config.worker_public_key,worker_key_id:config.worker_key_id,
    model:'gemma4:e2b-it-q4_K_M',model_digest:'b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2',execution_backend:'local_gemma_mock',cloud_billing_verified:false,tee_verified:false,
    max_companies:8,max_reservations_per_company:2,max_reservations_global:16,service_expires_at:String(R.leaseEnd),heartbeat_at:String(now-10),heartbeat_expires_at:String(Math.min(now+300,R.leaseEnd)),observed_at:String(now),online:true}});
const scope=()=>({profile:'business-operations-v1',operation:'website_build',brief:'Revise the existing draft.',context:'Use original approved facts.',sources:[{id:'company_facts',text:'Fictional service.'}],use_ai:true});
const intent=()=>({method:'company_submit_operation',deposit:'0',args:{id:'work_'+'b'.repeat(16),operation:'website_build',worker_key_id:R.workerKey,execution_profile_version:1,dependencies:[],not_before:'0'}});
const context=()=>({epoch:1,companyId:R.company,account:R.owner,readiness:recoveryAdmission(snapshot()),now});
const keys={keys:[{public_key:'ed25519:fixture',access_key:{permission:{FunctionCall:{receiver_id:R.company,method_names:['company_tick','ai_reserve_call','ai_complete_call','company_attest','company_archive'],allowance:'1000000000000000000000000'}}}}]};

test('fresh shared heartbeat never opens new company creation or setup paths',async()=>{
  assert.equal(founderCreationAvailability(config).ready,false);
  assert.throws(()=>assertFounderCreationAllowed(config),/paused/);
  assert.throws(()=>founderRequest({config}),/paused/);
  await assert.rejects(founderCreateAction({factory:R.factory}),/paused/);
  await assert.rejects(prepareFounderSetup({config}),/paused/);
  let effects=0;const client=createFounderClient({config,getWalletState:()=>{effects++;throw Error('wallet access');},rpc:{request:()=>{effects++;throw Error('RPC');}},storage:{getItem:()=>{effects++;throw Error('storage');}}});
  for(const run of [()=>client.context(),()=>client.quote({}),()=>client.create(null,true),()=>client.configure(null,null),()=>client.startNewAfterRefund()])await assert.rejects(run(),/paused/);
  assert.equal(effects,0,'Every creation entry refuses before wallet/RPC/storage mutation');
  assert.equal(typeof client.reconcile,'function');assert.equal(typeof client.discover,'function');assert.equal(typeof client.reviewRefund,'function');
});

test('unknown and other companies remain read-only regardless of heartbeat or key',async()=>{
  const s=snapshot();
  assert.equal(founderWorkerReadiness(s.service,keys,config,'other.'+R.factory).ready,false);
  assert.equal(founderWorkerReadiness(s.service,keys,config,'other.'+R.factory,{...s,companyId:R.company}).ready,false,'Supplemental state cannot override the actual requested company');
  let reads=0;const result=await readFounderReadiness({config,companyId:'other.'+R.factory,block,rpc:{request:()=>{reads++;throw Error('must not read');}}});
  assert.equal(result.ready,false);assert.equal(reads,0);
  assert.throws(()=>assertFounderRecoveryDispatch({...context(),companyId:'other.'+R.factory},intent()),/only/);
});

test('only the original completed company and exact remaining policy/count are eligible',()=>{
  assert.equal(recoveryAdmission(snapshot()).ready,true);
  for(const change of [s=>delete s.company,s=>delete s.policy,s=>delete s.originalTask,
    s=>s.company.owner='other',s=>s.company.operator='other',s=>s.company.lifetime_tasks=0,s=>s.company.lifetime_tasks=2,s=>s.company.task_count=1,s=>s.company.frozen=true,
    s=>s.policy.count=0,s=>s.policy.count=2,s=>s.policy.version=2,s=>s.policy.max_calls_per_job=2,s=>s.policy.allow_expensive=true,
    s=>s.originalTask.status='cancelled',s=>s.originalTask.evidence_hash='',s=>s.originalTask.worker_key_id='b'.repeat(64)]){
    const s=snapshot();change(s);assert.equal(recoveryAdmission(s).ready,false);
  }
});

test('finite lease rejects stale/expired/missing heartbeat and expired proof at dispatch',()=>{
  for(const change of [s=>s.service.online=false,s=>s.service.heartbeat_expires_at=String(now),s=>s.service.observed_at=String(now-61),s=>s.now=R.leaseEnd,s=>delete s.service]){const s=snapshot();change(s);assert.equal(recoveryAdmission(s).ready,false);}
  for(const expiry of [undefined,'garbage',String(now),String(R.leaseEnd+1)])assert.throws(()=>assertFounderRecoveryDispatch({...context(),readiness:{...context().readiness,admission_expires_at:expiry}},intent()));
});

test('remaining revision preserves explicit AI choice and refuses extra workflows',()=>{
  assert.doesNotThrow(()=>assertFounderRecoveryPreparation(context(),scope()));
  assert.doesNotThrow(()=>assertFounderRecoveryDispatch(context(),intent()));
  for(const change of [s=>s.use_ai=false,s=>s.operation='content_draft',s=>s.media={},s=>s.goal_plan={}]){const s=scope();change(s);assert.throws(()=>assertFounderRecoveryPreparation(context(),s));}
  assert.throws(()=>assertFounderRecoveryPreparation(context(),scope(),true));
  for(const change of [i=>i.deposit='1',i=>i.args.dependencies=['old'],i=>i.args.not_before='1',i=>i.args.worker_key_id='b'.repeat(64),i=>i.args.execution_profile_version=2,i=>i.args.operation='content_draft']){const i=intent();change(i);assert.throws(()=>assertFounderRecoveryDispatch(context(),i));}
});

test('actual readiness reads original task and policy at one supplied FINAL block',async()=>{
  const s=snapshot(),seen=[];
  const rpc={request:async(method,p)=>{seen.push(p);assert.equal(method,'query');assert.equal(p.block_id,block.hash);const bound={block_hash:block.hash,block_height:block.height};if(p.request_type==='view_access_key_list')return {...bound,...keys};
    const value={worker_service:s.service,company_state:s.company,ai_policy:s.policy,company_task:s.originalTask}[p.method_name];assert.ok(value);return {...bound,result:[...Buffer.from(JSON.stringify(value))]};}};
  const result=await readFounderReadiness({config,companyId:R.company,block,rpc});assert.equal(result.ready,true);assert.equal(result.service_mode,R.mode);assert.equal(seen.length,5);
  const wrong={request:async(method,p)=>({...await rpc.request(method,p),block_hash:'2'.repeat(32)})};await assert.rejects(readFounderReadiness({config,companyId:R.company,block,rpc:wrong}),/FINAL|final|block/i);
});

test('async preflight refuses changed owner/company/epoch or failed authority before continuation',async()=>{
  for(const mutate of [s=>s.account='other',s=>s.companyId='other',s=>s.epoch++]){
    let release;const state={epoch:1,companyId:R.company,account:R.owner};const run=checkFounderRecoveryWork({getContext:()=>state,readReadiness:()=>new Promise(resolve=>release=resolve),scope:scope()});mutate(state);release(context().readiness);await assert.rejects(run,/changed/);
  }
  await assert.rejects(checkFounderRecoveryWork({getContext:()=>context(),readReadiness:async()=>{throw Error('read failed');},intent:intent()}),/read failed/);
  await assert.rejects(checkFounderRecoveryWork({getContext:()=>context(),readReadiness:async()=>({ready:false,reason:'original unresolved'}),intent:intent()}),/original unresolved/);
});

test('business workspace wires preparation and both dispatch checkpoints to the gate',async()=>{
  const text=await readFile(new URL('../src/business-ui.js',import.meta.url),'utf8');
  assert.match(text,/await checkRecoveryWork\(\{scope,repeating:/);
  assert.match(text,/await checkRecoveryWork\(\{intent\}\)/);
  assert.match(text,/await checkRecoveryWork\(\{intent,block\}\);unchanged\(\)/);
});
