// Offline only: saved public synthetic FINAL state and fake read ports. No node,
// wallet, key, private recovery, model or HTTP listener is created.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {readLocalState} from './read-model.mjs';
import {requireFinancialAdmission,isMaintenanceUnavailable} from './maintenance.mjs';
import {validatePublicActionInput} from './public-action-input.mjs';
import {financialActionsAvailable,positiveUnsignedRefusal,discardAcknowledgedUnsignedReview} from './pending-review.mjs';
const saved=JSON.parse(await fs.readFile(new URL('./fixtures/final-public-state.json',import.meta.url),'utf8'));
function fixture({price='10000000000000000000',deficit=false,badCode=false,badLedger=false,change=null,accountOverride=null,directOverride=null}={}){
 const s=structuredClone(saved),reads=[];
 if(deficit){s.registry.account_balance=(BigInt(s.registry.required_retained)+BigInt(s.registry.held)-1n).toString();s.registry.backed=false;}
 if(badLedger)s.registry.funded=(BigInt(s.registry.funded)+1n).toString();
 if(change)change(s);
 const f={registryId:s.pins.registry_id,pins:s.pins,provider:{
  block:async p=>{assert.deepEqual(p,{finality:'final'});reads.push('block');return {header:s.block};},
  protocolConfig:async p=>{assert.deepEqual(p,{blockId:s.block.hash});reads.push('protocol');return {runtime_config:{storage_amount_per_byte:price}};},
  viewAccount:async(id,p)=>{assert.equal(id,s.pins.registry_id);assert.deepEqual(p,{block_id:s.block.hash});reads.push('account');return {block_hash:s.block.hash,code_hash:badCode?'1'.repeat(32):s.pins.registry_code_hash,amount:accountOverride??s.registry.account_balance};},
  query:async p=>{assert.equal(p.request_type,'view_access_key_list');assert.equal(p.block_id,s.block.hash);reads.push('keys');return {block_hash:s.block.hash,keys:[]};}
 },view:async(method,args,block)=>{
  assert.equal(block,s.block.hash);reads.push(method);
  const direct=structuredClone(s.mandate);if(directOverride)directOverride(direct);
  const rows={registry_state:s.registry,list_mandates:{items:[s.mandate],next_index:null},mandate:direct,list_jobs:{items:[s.job],next_index:null},assignment:s.assignment,delivery_record:s.delivery};
  assert.ok(Object.hasOwn(rows,method));return structuredClone(rows[method]);
 }};
 const {content_sha256,...baseContext}=s.delivery.context;
 return {s,reads,options:{f,accounts:{owner:s.mandate.owner,operator:s.mandate.policy.operator,proofreader:s.job.provider},policy:s.mandate.policy,mid:s.mandate.id,jid:s.job.id,clientId:s.mandate.client_id,now:()=>Number(s.registry.observed_at),deriveDeliveryContext:async()=>structuredClone(baseContext)}};
}
test('normal exact FINAL inspection permits financial admission without changing original terminal records',async()=>{
 const f=fixture(),r=await readLocalState(f.options);assert.equal(r.maintenance.mutations_available,true);requireFinancialAdmission(r.maintenance);assert.equal(financialActionsAvailable(r),true);assert.deepEqual(r.job,f.s.job);assert.deepEqual(r.m,f.s.mandate);
});
test('unsupported protocol price still returns original paid job, ledger, assignment and encrypted output with all financial actions disabled',async()=>{
 const f=fixture({price:'20000000000000000000'}),r=await readLocalState(f.options);assert.deepEqual(r.maintenance.reasons,['unsupported_storage_price']);assert.equal(r.job.status,'paid');assert.equal(r.job.paid,'100000000000000000000000');assert.equal(r.m.owner_paid,'300000000000000000000000');assert.deepEqual(r.assignment,f.s.assignment);assert.deepEqual(r.delivery,f.s.delivery);assert.equal(financialActionsAvailable(r),false);
 assert.throws(()=>requireFinancialAdmission(r.maintenance),isMaintenanceUnavailable);
});
test('backing deficit still permits bounded same-FINAL inspection but no financial admission or zeroing of original claims',async()=>{
 const f=fixture({deficit:true}),r=await readLocalState(f.options);assert.deepEqual(r.maintenance.reasons,['registry_backing_deficit']);assert.equal(r.maintenance.original_records_readable,true);assert.equal(financialActionsAvailable(r),false);assert.deepEqual(r.m,f.s.mandate);assert.equal(r.m.funded,'400000000000000000000000');assert.throws(()=>requireFinancialAdmission(r.maintenance),isMaintenanceUnavailable);
});
test('both maintenance causes are retained; malformed conservation or changed code is not downgraded into readable maintenance',async()=>{
 const f=fixture({price:'20000000000000000000',deficit:true}),r=await readLocalState(f.options);assert.deepEqual(r.maintenance.reasons,['unsupported_storage_price','registry_backing_deficit']);
 await assert.rejects(readLocalState(fixture({badLedger:true}).options),/conservation/);await assert.rejects(readLocalState(fixture({badCode:true}).options),/code changed/);
});
test('original independent malformed own-money reply is rejected even in unsupported-price maintenance',async()=>{
 const f=fixture({price:'20000000000000000000',change:s=>s.mandate.provider_paid=(BigInt(s.mandate.provider_paid)+1n).toString()});await assert.rejects(readLocalState(f.options),/Mandate money/);
});
test('original independent malformed mandate storage bucket reply is rejected, not maintenance',async()=>{
 const f=fixture({price:'20000000000000000000',change:s=>s.mandate.storage_remaining_bytes=(BigInt(s.mandate.storage_remaining_bytes)+1n).toString()});await assert.rejects(readLocalState(f.options),/bucket conservation/);
});
test('original independent paid-job-with-zero-paid reply is rejected before returning a readable paid state',async()=>{
 const f=fixture({price:'20000000000000000000',change:s=>s.job.paid='0'});await assert.rejects(readLocalState(f.options),/Paid job/);
});
test('original independent account-balance mismatch is rejected before maintenance classification',async()=>{
 const f=fixture({price:'20000000000000000000',accountOverride:'0'});await assert.rejects(readLocalState(f.options),/account balance/);
});
test('the selected same-FINAL mandate view must equal its listed record',async()=>{
 const f=fixture({directOverride:m=>m.owner_paid=(BigInt(m.owner_paid)+1n).toString()});await assert.rejects(readLocalState(f.options),/Listed and directly checked/);assert.ok(f.reads.includes('mandate'));
});
test('self-conserved mandate totals cannot disagree with the complete registry aggregate',async()=>{
 const f=fixture({change:s=>{s.mandate.provider_paid=(BigInt(s.mandate.provider_paid)-1n).toString();s.mandate.owner_paid=(BigInt(s.mandate.owner_paid)+1n).toString();}});await assert.rejects(readLocalState(f.options),/aggregate money/);
});
test('self-consistent bucket sums still must match assigned and unassigned job storage',async()=>{
 const f=fixture({change:s=>{s.mandate.assignment_remaining_bytes=(BigInt(s.mandate.assignment_remaining_bytes)+1n).toString();s.mandate.base_remaining_bytes=(BigInt(s.mandate.base_remaining_bytes)-1n).toString();}});await assert.rejects(readLocalState(f.options),/Assigned\/unassigned/);
});
test('self-conserved registry and mandate cannot claim provider payment inconsistent with the complete job list',async()=>{
 const f=fixture({change:s=>{for(const v of [s.registry,s.mandate]){v.provider_paid=(BigInt(v.provider_paid)-1n).toString();v.owner_paid=(BigInt(v.owner_paid)+1n).toString();}}});await assert.rejects(readLocalState(f.options),/job\/mandate accounting/);
});
test('missing or self-contradictory admission does not enable a financial UI action',()=>{
 for(const maintenance of [null,{}, {schema:'bin-local-maintenance-v2',mutations_available:true,reasons:['unsupported_storage_price']},{schema:'bin-local-maintenance-v2',mutations_available:false,reasons:[]}])assert.equal(financialActionsAvailable({maintenance}),false);
});
test('unconsented public source and extra private create fields reject before RPC-capable work or persistence',async()=>{
 let rpc=0,persist=0;const run=async(action,data)=>{await validatePublicActionInput(action,data,saved.mandate.policy.recipient_policy);rpc++;persist++;};
 await assert.rejects(run('share',{packet:saved.assignment,public_share_ack:false}),/public-copy approval/);await assert.rejects(run('create',{private_jwk:'SYNTHETIC_PRIVATE_SENTINEL'}),/Exact public action/);assert.equal(rpc,0);assert.equal(persist,0);
});
test('changed plaintext with old hash or an obvious secret rejects locally before RPC/persistence even with a public acknowledgement',async()=>{
 let rpc=0,persist=0;const run=async packet=>{await validatePublicActionInput('share',{packet,public_share_ack:'EXACT_PUBLIC_BRIEF_SOURCE_PERMANENT'},saved.mandate.policy.recipient_policy);rpc++;persist++;};
 const altered=structuredClone(saved.assignment);altered.text+=' changed';await assert.rejects(run(altered),/locally reviewed/);
 const secret=structuredClone(saved.assignment);secret.text='api_key: SYNTHETIC_SECRET_SENTINEL_123456789';await assert.rejects(run(secret),/secret/);assert.equal(rpc,0);assert.equal(persist,0);
});
test('provider plaintext/extra encrypted record fields are refused locally; exact recorded ciphertext passes without decryption',async()=>{
 let rpc=0,persist=0;const run=async delivery=>{await validatePublicActionInput('deliver',{delivery},saved.mandate.policy.recipient_policy);rpc++;persist++;};
 await assert.rejects(run({...saved.delivery,body:'SYNTHETIC_PRIVATE_SENTINEL'}),/Exact delivery fields/);assert.equal(rpc,0);assert.equal(persist,0);
 await run(saved.delivery);assert.equal(rpc,1);assert.equal(persist,1);
});
test('valid owner-consented exact recorded brief passes the local pre-RPC public gate',async()=>{
 await validatePublicActionInput('share',{packet:saved.assignment,public_share_ack:'EXACT_PUBLIC_BRIEF_SOURCE_PERMANENT'},saved.mandate.policy.recipient_policy);
});
test('an error/missing hash/malformed pending marker cannot be cleared as a positive unsigned refusal',()=>{
 const pending={request_id:'c16e1998-707c-4d03-b78a-c97a14730cc8',intent_sha256:'a'.repeat(64)},storage=new Map([['pending',JSON.stringify(pending)]]),ports={getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)};
 for(const result of [{error:'ENOENT'},{status:'unknown',request_id:pending.request_id},{status:'unknown_before_signature_record',request_id:pending.request_id,new_signature:false,review_reset_allowed:true},{status:'refused_before_birth',request_id:pending.request_id,new_signature:false,no_retry:true,review_reset_allowed:true,review_reset_acknowledged:true,reason:'review_expired'}]){
  assert.equal(positiveUnsignedRefusal(result,pending),false);assert.throws(()=>discardAcknowledgedUnsignedReview({storage:ports,key:'pending',pending,result}),/positively unsigned/);assert.equal(storage.get('pending'),JSON.stringify(pending));
 }
});
