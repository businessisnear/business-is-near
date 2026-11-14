// Controlled asynchronous adapters only; no browser, actual key or financial IO.
import test from 'node:test';import assert from 'node:assert/strict';
import {positiveUnsignedRefusal,discardAcknowledgedUnsignedReview,cacheOriginalObservation,financialActionsAvailable} from './pending-review.mjs';
import {policyPreparationState,identityCandidatesMatchAccounts,requireCreateKeyReadiness,createPolicyPreparer} from './policy-preparation.mjs';
const pending={request_id:'c16e1998-707c-4d03-b78a-c97a14730cc8',intent_sha256:'a'.repeat(64)};
const unsigned={status:'refused_before_birth',request_id:pending.request_id,intent_sha256:pending.intent_sha256,new_signature:false,no_retry:true,review_reset_allowed:true,review_reset_acknowledged:false,reason:'review_expired'};
test('a controlled late pre-discard inspect cannot overwrite acknowledged state after browser marker was explicitly cleared',async()=>{
 const row={request_id:pending.request_id},storage=new Map([['p',JSON.stringify(pending)]]);cacheOriginalObservation(row,unsigned,pending);
 let release;const gate=new Promise(r=>release=r),old=structuredClone(row.original_result),late=(async()=>{await gate;return cacheOriginalObservation(row,old,pending);})();
 const ack=cacheOriginalObservation(row,{...unsigned,review_reset_acknowledged:true},pending);discardAcknowledgedUnsignedReview({storage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},key:'p',pending,result:ack});release();await late;
 assert.equal(storage.has('p'),false);assert.equal(row.original_result.review_reset_acknowledged,true);assert.equal(positiveUnsignedRefusal(row.original_result,pending),true);assert.equal(row.inspection_conflict,undefined);
});
test('an earlier no-hash unknown cannot downgrade the same acknowledged unsigned original',()=>{
 const row={request_id:pending.request_id};cacheOriginalObservation(row,{...unsigned,review_reset_acknowledged:true},pending);
 cacheOriginalObservation(row,{request_id:pending.request_id,status:'unknown_before_signature_record',no_retry:true},pending);assert.equal(row.original_result.review_reset_acknowledged,true);
});
test('foreign identity or conflicting signing evidence never merges into an acknowledged discard and flags the row',()=>{
 for(const changed of [{...unsigned,request_id:'f16e1998-707c-4d03-b78a-c97a14730cc8'},{...unsigned,intent_sha256:'f'.repeat(64)},{status:'unknown',request_id:pending.request_id,hash:'1'.repeat(32),no_retry:true}]){
  const row={request_id:pending.request_id};cacheOriginalObservation(row,{...unsigned,review_reset_acknowledged:true},pending);const before=structuredClone(row.original_result);
  assert.throws(()=>cacheOriginalObservation(row,changed,pending),/identity|conflict/);assert.deepEqual(row.original_result,before);assert.equal(row.inspection_conflict,true);
 }
});
const accounts={owner:'owner.test.near',operator:'operator.test.near'};
const identity=(account_id,key_id)=>({profile:'near-procurement-delivery-private-v4',account_id,key_id,key_version:'1',public_key_pem:'SYNTHETIC_PUBLIC_DESCRIPTOR_'+key_id,private_jwk:{synthetic_controller_marker:true}});
const identities={owner:identity(accounts.owner,'b'.repeat(64)),worker:identity(accounts.operator,'c'.repeat(64))};
const publicPolicy=keys=>({profile:'near-procurement-delivery-recipients-v4',...Object.fromEntries(['owner','worker'].map(r=>[r,Object.fromEntries(['account_id','key_id','key_version','public_key_pem'].map(k=>[k,keys[r][k]]))]))});
const maintenance=available=>({schema:'bin-local-maintenance-v2',mutations_available:available,reasons:available?[]:['unsupported_storage_price']});
test('first-load maintenance then healthy refresh exposes explicit public preparation and cannot enable Create with null policy',()=>{
 const initial={m:null,policy:null,maintenance:maintenance(false)},healthy={...initial,maintenance:maintenance(true)};let create=0;
 assert.equal(financialActionsAvailable(initial),false);assert.equal(financialActionsAvailable(healthy),true);assert.equal(policyPreparationState(healthy,{},accounts),'prepare_public_policy');
 const attempt=state=>{requireCreateKeyReadiness(state,{},accounts);create++;};assert.throws(()=>attempt(initial),/Prepare the original/);assert.throws(()=>attempt(healthy),/Prepare the original/);assert.equal(create,0);
});
test('explicit public preparation after a healthy read commits one original recipient policy before Create can become ready',async()=>{
 let policy=null,healthy=false,admission=0,commit=0;
 const prepare=createPolicyPreparer({validatePublic:async p=>assert.equal(p.profile,'near-procurement-delivery-recipients-v4'),getPrepared:()=>policy,readAdmission:async()=>{admission++;assert.ok(healthy,'Maintenance still active');},buildProposal:async recipient_policy=>({recipient_policy}),commit:p=>{policy=p;commit++;}});
 await assert.rejects(prepare(publicPolicy(identities)),/Maintenance/);assert.equal(commit,0);healthy=true;await prepare(publicPolicy(identities));
 const state={m:null,policy,maintenance:maintenance(true)};assert.equal(identityCandidatesMatchAccounts(identities,accounts),true);assert.equal(policyPreparationState(state,identities,accounts),'ready_for_create');requireCreateKeyReadiness(state,identities,accounts);assert.equal(commit,1);assert.equal(admission,2);
 await assert.rejects(prepare(publicPolicy(identities)),/already prepared/);assert.equal(commit,1);assert.equal(admission,2);
});
test('concurrent different public-key preparations cannot overwrite the original or start a second admission',async()=>{
 let policy=null,admission=0,commits=0,release;const gate=new Promise(r=>release=r);
 const prepare=createPolicyPreparer({validatePublic:async()=>{},getPrepared:()=>policy,readAdmission:async()=>{admission++;},buildProposal:async recipient_policy=>{await gate;return {recipient_policy};},commit:p=>{policy=p;commits++;}});
 const first=prepare(publicPolicy(identities));while(!admission)await Promise.resolve();const foreign={...identities,owner:identity(accounts.owner,'d'.repeat(64))};await assert.rejects(prepare(publicPolicy(foreign)),/in progress/);release();await first;
 assert.deepEqual(policy.recipient_policy,publicPolicy(identities));assert.equal(commits,1);assert.equal(admission,1);
});
test('a prepared foreign or lost-RAM key set disables Create and does not imply permission to replace recipients',()=>{
 const state={m:null,policy:{recipient_policy:publicPolicy(identities)},maintenance:maintenance(true)};
 for(const keys of [{},{...identities,owner:identity(accounts.owner,'d'.repeat(64))}]){assert.equal(policyPreparationState(state,keys,accounts),'original_keys_unavailable');assert.throws(()=>requireCreateKeyReadiness(state,keys,accounts),/cannot be overwritten/);}
});
