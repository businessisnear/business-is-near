// Pure future-only repair probes. Fake signer bytes AA== only in owned temp,
// deleted by after(); no real key/signature, node server, RPC/model/wallet calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOnceDispatcher,refuseUnsignedReview} from '../local-app-v2/once-dispatcher.mjs';
import {createPrebirthOwnership,verifyPrebirthProof} from '../local-app-v2/prebirth-ownership.mjs';
import {positiveUnsignedRefusal,cacheOriginalObservation} from '../local-app-v2/pending-review.mjs';
import {createApprovalFlight} from './approval-flight.mjs';
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex');
const accounts={owner:'owner.test.near',operator:'operator.test.near',proofreader:'provider.test.near'},domain='future-only-private-guard';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const intent={signer_id:accounts.owner,receiver_id:'registry.test.near',method:'create_mandate',args:{synthetic:true},gas:'150000000000000',deposit:'0'};
const request={domain,request_id:id,role:'owner',intent,intent_sha256:sha(intent)};
const input=(request_id=id)=>({request_id,role:'owner',intent});
async function fixture(t,authorize){
 const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'owned-v5-repair-fake-')));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const counters={sign:0,broadcast:0};let authorizationCalls=0;
 const authorizeImpl=authorize??(async r=>({domain,intent_sha256:r.intent_sha256,observed_at_ms:Date.now(),expires_at_ms:Date.now()+30000}));
 const ports={authorize:async(...args)=>{authorizationCalls++;return authorizeImpl(...args);},
 sign:async()=>{counters.sign++;return {hash:'1'.repeat(44),wire_base64:'AA==',nonce:'1'};},broadcastOnce:async()=>{counters.broadcast++;},observeOriginal:async()=>null,validateFinal:async()=>{throw Error('No chain in these fake probes');}};
 const dispatcher=await createOnceDispatcher({directory,domain,accounts,deadline:Date.now()+60000,ports});return {dispatcher,directory,counters,ports,authorizeCalls:()=>authorizationCalls};
}
const admitted=r=>({domain,intent_sha256:r.intent_sha256,observed_at_ms:Date.now(),expires_at_ms:Date.now()+30000});
test('exact current owned authorize abort is durable positive unsigned, then explicitly acknowledged',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic synthetic stale preflight');});
 const r=await f.dispatcher.send(input());assert.equal(r.status,'refused_before_birth');assert.equal(r.reason,'owned_prebirth_aborted');assert.equal(r.ownership_schema,'bin-local-owned-prebirth-proof-v3');assert.match(r.ownership_sha256,/^[a-f0-9]{64}$/);assert.equal(r.new_signature,false);assert.equal(r.review_reset_allowed,true);assert.equal(positiveUnsignedRefusal(r,{request_id:id,intent_sha256:sha(intent)}),true);assert.deepEqual(f.counters,{sign:0,broadcast:0});
 const ack=await f.dispatcher.discardUnsignedReview(id,sha(intent));assert.equal(ack.review_reset_acknowledged,true);
 assert.deepEqual(await f.dispatcher.send(input()),ack);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('expiry branded before birth still requires ownership and produces no signature',async t=>{
 const f=await fixture(t,async()=>refuseUnsignedReview('review_expired'));const r=await f.dispatcher.send(input());assert.equal(r.reason,'review_expired');assert.equal(r.review_reset_allowed,true);assert.match(r.ownership_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('claim fsync failure mints no permit or proof and cannot authorize/sign',async()=>{
 let authorize=0,persist=0,claimWrote=false;
 const gate=createPrebirthOwnership({writeClaim:async()=>{claimWrote=true;throw Error('synthetic fsync failure after write');},readClaim:async()=>{throw Error('must not read after failed claim');},assertNoOriginal:async()=>{}});
 await assert.rejects(gate.claim(request),/fsync failure/);await assert.rejects(gate.abortBeforeBirth({},async()=>persist++),/ownership required/);assert.equal(claimWrote,true);assert.equal(persist,0);assert.equal(authorize,0);
});
test('actual exclusive-claim collision stays unclassified and signs zero',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.directory,'prebirth-claims',id+'.json'),'{}',{mode:0o600});
 await assert.rejects(f.dispatcher.send(input()),e=>e.code==='EEXIST');await assert.rejects(f.dispatcher.inspect(id),/not recorded/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('read failure after claimed preflight never becomes positive unsigned',async()=>{
 const gate=createPrebirthOwnership({writeClaim:async()=>{},readClaim:async()=>{throw Error('synthetic original IO unreadable');},assertNoOriginal:async()=>{}});const token=await gate.claim(request);let persisted=0;await assert.rejects(gate.abortBeforeBirth(token,async()=>persisted++),/IO unreadable/);assert.equal(persisted,0);
});
test('failed durable refusal consumes permit; no fallback/retry classifier',async()=>{
 let claim,persisted=0;const gate=createPrebirthOwnership({writeClaim:async(_,c)=>{claim=c;},readClaim:async()=>claim,assertNoOriginal:async()=>{}});const token=await gate.claim(request);
 await assert.rejects(gate.abortBeforeBirth(token,async()=>{persisted++;throw Error('synthetic refusal fsync failure');}),/fsync/);
 await assert.rejects(gate.abortBeforeBirth(token,async()=>persisted++),/cannot become unsigned/);assert.equal(persisted,1);
});
test('two concurrent same UUID claims have only one owner; loser cannot produce unsigned proof',async()=>{
 let held=false,claim;const gate=createPrebirthOwnership({writeClaim:async(_,c)=>{if(held)throw Object.assign(Error('claim conflict'),{code:'EEXIST'});held=true;claim=c;},readClaim:async()=>claim,assertNoOriginal:async()=>{}});
 const results=await Promise.allSettled([gate.claim(request),gate.claim(request)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);let proofs=0;await gate.abortBeforeBirth(results.find(r=>r.status==='fulfilled').value,async()=>proofs++);assert.equal(proofs,1);
});
test('prior orphan birth blocks current claim and never signs',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.directory,'births','1.json'),JSON.stringify({domain,request_id:id,intent_sha256:sha(intent)}),{mode:0o600});await assert.rejects(f.dispatcher.send(input()),/birth exists/);await assert.rejects(f.dispatcher.inspect(id),/not recorded/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('foreign/unreadable original birth cannot be inferred absent',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.directory,'births','1.json'),'not-json',{mode:0o600});await assert.rejects(f.dispatcher.send(input()),SyntaxError);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('proof identity mutation or JSON-forged in-process token is rejected',async()=>{
 let claim,proof;const gate=createPrebirthOwnership({writeClaim:async(_,c)=>{claim=c;},readClaim:async()=>claim,assertNoOriginal:async()=>{}});const token=await gate.claim(request);await assert.rejects(gate.abortBeforeBirth({},async()=>{}),/ownership required/);await gate.abortBeforeBirth(token,async p=>{proof=p;});assert.match(verifyPrebirthProof(request,proof,claim),/^[a-f0-9]{64}$/);
 for(const change of [{request_id:id2},{intent_sha256:'f'.repeat(64)},{sign_entered:true},{broadcast_entered:true}])assert.throws(()=>verifyPrebirthProof(request,{...proof,...change},claim),/Exact owned prebirth/);
});
test('entered birth capability cannot be reclassified unsigned after later errors',async()=>{
 let claim;const gate=createPrebirthOwnership({writeClaim:async(_,c)=>{claim=c;},readClaim:async()=>claim,assertNoOriginal:async()=>{}});const token=await gate.claim(request);gate.enterBirth(token);await assert.rejects(gate.abortBeforeBirth(token,async()=>{}),/cannot become unsigned/);gate.enterSign(token);await assert.rejects(gate.abortBeforeBirth(token,async()=>{}),/cannot become unsigned/);
});
test('signed-before-broadcast expiry remains UNKNOWN/non-discardable, no broadcast or resend',async t=>{
 const f=await fixture(t,async(r,phase)=>{if(phase==='before_broadcast')refuseUnsignedReview('review_expired');return admitted(r);});await assert.rejects(f.dispatcher.send(input()),/review_expired/);const r=await f.dispatcher.inspect(id);assert.equal(r.status,'unknown');assert.equal(r.no_retry,true);assert.equal(positiveUnsignedRefusal(r,{request_id:id,intent_sha256:sha(intent)}),false);await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.deepEqual(f.counters,{sign:1,broadcast:0});assert.equal((await fs.readdir(path.join(f.directory,'signers'))).length,1);assert.equal((await f.dispatcher.send(input())).status,'unknown');assert.deepEqual(f.counters,{sign:1,broadcast:0});
});
test('unrefused original broadcasts at most once and retained UNKNOWN is never reset',async t=>{
 const f=await fixture(t);assert.equal((await f.dispatcher.send(input())).status,'unknown');assert.equal((await f.dispatcher.send(input())).status,'unknown');assert.deepEqual(f.counters,{sign:1,broadcast:1});await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);
});
test('old identity schema cannot be adopted or upgraded',async t=>{
 const f=await fixture(t);const file=path.join(f.directory,'DOMAIN.json'),identity=JSON.parse(await fs.readFile(file,'utf8'));identity.schema='bin-local-once-domain-v1';await fs.writeFile(file,JSON.stringify(identity),{mode:0o600});await assert.rejects(createOnceDispatcher({directory:f.directory,domain,accounts,deadline:identity.deadline,ports:f.ports}),/domain changed/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('browser unsigned reset requires exact new ownership schema/SHA and UUID/intent',()=>{
 const result={status:'refused_before_birth',request_id:id,intent_sha256:sha(intent),new_signature:false,no_retry:true,review_reset_allowed:true,reason:'owned_prebirth_aborted',ownership_schema:'bin-local-owned-prebirth-proof-v3',ownership_sha256:'a'.repeat(64)},pending={request_id:id,intent_sha256:sha(intent)};assert.equal(positiveUnsignedRefusal(result,pending),true);for(const mutation of [{ownership_schema:null},{ownership_sha256:null},{reason:'ENOENT'},{status:'unknown'},{hash:'1'.repeat(44)},{request_id:id2}])assert.equal(positiveUnsignedRefusal({...result,...mutation},pending),false);
});
test('global approval flight blocks a second plan and stale/foreign releases; original inspection remains external',()=>{
 const gate=createApprovalFlight();gate.assertIdle();const token=gate.begin();assert.throws(()=>gate.begin(),/already in flight/);assert.throws(()=>gate.assertIdle(),/already in flight/);assert.throws(()=>gate.finish({}),/current exact/);gate.finish(token);gate.assertIdle();assert.throws(()=>gate.finish(token),/current exact/);const next=gate.begin();gate.finish(next);
});

test('SAME generic ENOENT is unsigned only under current owned prebirth; after birth/sign remains UNKNOWN',async t=>{
 const same=Object.assign(Error('same synthetic original read error'),{code:'ENOENT'});
 for(const phase of ['before_birth','before_sign','before_broadcast']){
  const f=await fixture(t,async(r,p)=>{if(p===phase)throw same;return admitted(r);});
  if(phase==='before_birth'){
   const r=await f.dispatcher.send(input());assert.equal(r.reason,'owned_prebirth_aborted');assert.equal(r.status,'refused_before_birth');assert.equal(r.review_reset_allowed,true);assert.deepEqual(f.counters,{sign:0,broadcast:0});
  }else{
   await assert.rejects(f.dispatcher.send(input()),e=>e===same);const r=await f.dispatcher.inspect(id);assert.equal(r.status,phase==='before_sign'?'unknown_before_signature_record':'unknown');assert.equal(r.no_retry,true);assert.equal(positiveUnsignedRefusal(r,{request_id:id,intent_sha256:sha(intent)}),false);await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.deepEqual(f.counters,{sign:phase==='before_sign'?0:1,broadcast:0});
  }
 }
});
test('foreign-domain immutable birth blocks even a different new UUID',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.directory,'births','1.json'),JSON.stringify({domain:'foreign',request_id:id2,intent_sha256:sha(intent)}),{mode:0o600});await assert.rejects(f.dispatcher.send(input()),/Foreign or malformed/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('generic error properties do not mint ownership; a forged or legacy token cannot classify any abort',async()=>{
 let claim;const gate=createPrebirthOwnership({writeClaim:async(_,c)=>{claim=c;},readClaim:async()=>claim,assertNoOriginal:async()=>{}}),same=Object.assign(Error('same synthetic original read error'),{code:'ENOENT',reason:'owned_prebirth_aborted'});
 await assert.rejects(gate.abortBeforeBirth(same,async()=>{}),/ownership required/);await assert.rejects(gate.abortBeforeBirth({request_id:id,intent_sha256:sha(intent)},async()=>{}),/ownership required/);
});
async function failFileSyncOnce(target,fn){
 const original=fs.open;let injected=0;
 fs.open=async function(file,...args){const handle=await original.call(fs,file,...args);if(String(file)!==target)return handle;return {writeFile:handle.writeFile.bind(handle),close:handle.close.bind(handle),sync:async()=>{injected++;throw Object.assign(Error('synthetic fsync failure after valid bytes'),{code:'EIO'});}};};
 try{await fn();assert.equal(injected,1);}finally{fs.open=original;}
}
test('actual claim file fsync failure after valid bytes never mints ownership',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');}),target=path.join(f.directory,'prebirth-claims',id+'.json');
 await failFileSyncOnce(target,async()=>{await assert.rejects(f.dispatcher.send(input()),e=>e.code==='EIO');});assert.ok(JSON.parse(await fs.readFile(target,'utf8')).intent_sha256);await assert.rejects(f.dispatcher.inspect(id),/not recorded/);await assert.rejects(f.dispatcher.send(input()),e=>e.code==='EEXIST');assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('actual abort refusal fsync failure after valid JSON remains UNKNOWN, never unsigned',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');}),target=path.join(f.directory,'requests',id,'REFUSED-BEFORE-BIRTH.json');
 await failFileSyncOnce(target,async()=>{await assert.rejects(f.dispatcher.send(input()),e=>e.code==='EIO');});assert.equal(JSON.parse(await fs.readFile(target,'utf8')).reason,'owned_prebirth_aborted');const r=await f.dispatcher.inspect(id);assert.equal(r.status,'unknown_owned_prebirth_commit');assert.equal(r.review_reset_allowed,false);assert.equal(positiveUnsignedRefusal(r,{request_id:id,intent_sha256:sha(intent)}),false);await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('actual acknowledgement fsync failure after valid JSON remains UNKNOWN, never acknowledged',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});await f.dispatcher.send(input());const target=path.join(f.directory,'requests',id,'UNSIGNED-REVIEW-DISCARDED.json');
 await failFileSyncOnce(target,async()=>{await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),e=>e.code==='EIO');});assert.equal(JSON.parse(await fs.readFile(target,'utf8')).request_id,id);const r=await f.dispatcher.inspect(id);assert.equal(r.status,'unknown_owned_prebirth_commit');assert.equal(r.review_reset_allowed,false);await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('new owned-prebirth refusal after process-equivalent restart is conservative UNKNOWN',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});const first=await f.dispatcher.send(input());assert.equal(first.review_reset_allowed,true);const identity=JSON.parse(await fs.readFile(path.join(f.directory,'DOMAIN.json'),'utf8'));const reopened=await createOnceDispatcher({directory:f.directory,domain,accounts,deadline:identity.deadline,ports:f.ports});const r=await reopened.inspect(id);assert.equal(r.status,'unknown_owned_prebirth_commit');assert.equal(r.no_retry,true);assert.equal(r.review_reset_allowed,false);await assert.rejects(reopened.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('pre-consent abort persists only opaque IDs/digests, never synthetic private arguments',async t=>{
 const f=await fixture(t,async()=>{throw Error('synthetic privacy refusal');});const sensitive='SYNTHETIC_PRIVATE_BRIEF_DO_NOT_PERSIST_37';const privateIntent={...intent,args:{private_brief:sensitive}},r=await f.dispatcher.send({request_id:id,role:'owner',intent:privateIntent});assert.equal(r.review_reset_allowed,true);
 async function scan(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,e.name);if(e.isDirectory())await scan(name);else assert.equal((await fs.readFile(name,'utf8')).includes(sensitive),false);}}await scan(f.directory);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});

test('regression: reconstructed existing send shares UNKNOWN guard with inspect/discard and has no admission/effects',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});await f.dispatcher.send(input());const identity=JSON.parse(await fs.readFile(path.join(f.directory,'DOMAIN.json'),'utf8'));const reopened=await createOnceDispatcher({directory:f.directory,domain,accounts,deadline:identity.deadline,ports:f.ports}),before=f.authorizeCalls();
 for(const r of [await reopened.inspect(id),await reopened.send(input())]){assert.equal(r.status,'unknown_owned_prebirth_commit');assert.equal(r.review_reset_allowed,false);assert.equal(r.no_retry,true);}await assert.rejects(reopened.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.equal(f.authorizeCalls(),before);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('regression: partial abort valid JSON cannot bypass commit guard through existing send',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');}),target=path.join(f.directory,'requests',id,'REFUSED-BEFORE-BIRTH.json');await failFileSyncOnce(target,async()=>{await assert.rejects(f.dispatcher.send(input()),e=>e.code==='EIO');});const before=f.authorizeCalls();
 for(const r of [await f.dispatcher.inspect(id),await f.dispatcher.send(input())]){assert.equal(r.status,'unknown_owned_prebirth_commit');assert.equal(r.review_reset_allowed,false);assert.equal(r.no_retry,true);}await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.equal(f.authorizeCalls(),before);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('regression: partial acknowledgement JSON cannot bypass commit guard through existing send',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});await f.dispatcher.send(input());const target=path.join(f.directory,'requests',id,'UNSIGNED-REVIEW-DISCARDED.json');await failFileSyncOnce(target,async()=>{await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),e=>e.code==='EIO');});const before=f.authorizeCalls();
 for(const r of [await f.dispatcher.inspect(id),await f.dispatcher.send(input())]){assert.equal(r.status,'unknown_owned_prebirth_commit');assert.equal(r.review_reset_allowed,false);assert.equal(r.no_retry,true);assert.notEqual(r.review_reset_acknowledged,true);}await assert.rejects(f.dispatcher.discardUnsignedReview(id,sha(intent)),/Only this exact positively unsigned/);assert.equal(f.authorizeCalls(),before);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('live committed existing send keeps exact owned identity; retargets never invoke admission or effects',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});const r=await f.dispatcher.send(input()),before=f.authorizeCalls();assert.deepEqual(await f.dispatcher.send(input()),r);await assert.rejects(f.dispatcher.send({...input(),intent:{...intent,args:{different:true}}}),/different intent/);const ack=await f.dispatcher.discardUnsignedReview(id,sha(intent));assert.equal(ack.review_reset_acknowledged,true);assert.deepEqual(await f.dispatcher.send(input()),ack);assert.equal(f.authorizeCalls(),before);assert.deepEqual(f.counters,{sign:0,broadcast:0});
});

test('acknowledged exact owned refusal remains monotonic across both delayed new UNKNOWN statuses',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});await f.dispatcher.send(input());const ack=await f.dispatcher.discardUnsignedReview(id,sha(intent)),pending={request_id:id,intent_sha256:sha(intent)};
 for(const status of ['unknown_owned_prebirth_commit','unknown_owned_prebirth_ack']){const row={request_id:id};cacheOriginalObservation(row,ack,pending);const next=cacheOriginalObservation(row,{request_id:id,status,no_retry:true},pending);assert.deepEqual(next,ack);assert.equal(next.review_reset_acknowledged,true);assert.notEqual(row.inspection_conflict,true);}assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
test('delayed new UNKNOWN cannot hide signing evidence or foreign identity behind prior ACK',async t=>{
 const f=await fixture(t,async()=>{throw Error('generic read error');});await f.dispatcher.send(input());const ack=await f.dispatcher.discardUnsignedReview(id,sha(intent)),pending={request_id:id,intent_sha256:sha(intent)};
 for(const status of ['unknown_owned_prebirth_commit','unknown_owned_prebirth_ack'])for(const conflict of [{hash:'1'.repeat(44)},{checked:{}},{new_signature:true},{new_signature:1},{new_signature:'true'},{request_id:id2},{intent_sha256:'f'.repeat(64)}]){const row={request_id:id};cacheOriginalObservation(row,ack,pending);assert.throws(()=>cacheOriginalObservation(row,{request_id:id,status,no_retry:true,...conflict},pending),/conflict|identity/);assert.equal(row.inspection_conflict,true);assert.deepEqual(row.original_result,ack);}assert.deepEqual(f.counters,{sign:0,broadcast:0});
});
