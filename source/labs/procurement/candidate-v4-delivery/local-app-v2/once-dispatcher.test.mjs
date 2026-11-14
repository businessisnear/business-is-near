import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomUUID,createHash} from 'node:crypto';
import {createOnceDispatcher,refuseUnsignedReview} from './once-dispatcher.mjs';
import {positiveUnsignedRefusal,discardAcknowledgedUnsignedReview} from './pending-review.mjs';
const accounts={owner:'owner.test.near',operator:'operator.test.near',proofreader:'reviewer.test.near'},domain='explicit-loopback-chain:immutable-registry-code';
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
async function fixture(t,options={}){
 const base=await fs.realpath(os.tmpdir()),directory=await fs.mkdtemp(path.join(base,'bin-once-unit-'));t.after(async()=>{assert.ok(directory.startsWith(path.join(base,'bin-once-unit-')));await fs.rm(directory,{recursive:true,force:true});});
 const stats={signs:0,broadcasts:0,validations:0},controls={unknown:false,throwBroadcast:false,badPhase:null,holdSign:null,...options},raws=new Map();
 const input=()=>({request_id:randomUUID(),role:'owner',intent:{signer_id:accounts.owner,receiver_id:'registry.test.near',method:'close_mandate',args:{mandate_id:'a'.repeat(64)},gas:'150000000000000',deposit:'0'}});
 const ports={
  authorize:async(req,phase)=>({domain,intent_sha256:req.intent_sha256,observed_at_ms:Date.now()-(controls.badPhase===phase?61000:0),expires_at_ms:Date.now()+(controls.badPhase===phase?-1:30000)}),
  sign:async(intent)=>{stats.signs++;const id='1'.repeat(31)+'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[stats.signs];if(controls.holdSign)await controls.holdSign;const raw={final_execution_status:'FINAL',hash:id,intent:canonical(intent)};raws.set(id,raw);return {hash:id,wire_base64:Buffer.from(canonical({intent,nonce:String(stats.signs)})).toString('base64'),nonce:String(stats.signs)};},
  broadcastOnce:async(wire,id)=>{stats.broadcasts++;const rows=await fs.readdir(path.join(directory,'requests'));const found=[];for(const n of rows){try{const v=JSON.parse(await fs.readFile(path.join(directory,'requests',n,'SIGNED.json'),'utf8'));if(v.hash===id)found.push(n);}catch{}}
   assert.equal(found.length,1);const dir=path.join(directory,'requests',found[0]);assert.ok((await fs.stat(path.join(dir,'BROADCAST-ATTEMPTED.json'))).isFile());assert.equal((await fs.stat(path.join(dir,'SIGNED.json'))).mode&0o077,0);assert.ok(wire);if(controls.throwBroadcast)throw Error('Synthetic transport timeout');},
  observeOriginal:async({hash})=>controls.unknown?null:structuredClone(raws.get(hash)),
  // Receipt validator itself is separately tested existing shared code. These
  // tests stub that dependency to test durable once-only/restart behavior.
  validateFinal:async(raw,expected)=>{stats.validations++;assert.equal(raw.hash,expected.hash);assert.equal(raw.intent,canonical(expected.intent));return {status:'final',hash:raw.hash,fee:'1'};}
 };
 const config={directory,domain,accounts,deadline:Date.now()+120000,ports},dispatcher=await createOnceDispatcher(config);
 return {directory,stats,controls,input,ports,config,dispatcher};
}
test('wire and attempt are durable before one broadcast; repeated HTTP identity only inspects',async t=>{
 const f=await fixture(t),request=f.input(),first=await f.dispatcher.send(request);assert.equal(first.status,'final');
 assert.equal((await f.dispatcher.send(request)).hash,first.hash);assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,1);
 assert.equal((await fs.stat(f.directory)).mode&0o077,0);
});
test('same request identity cannot retarget approved bytes',async t=>{
 const f=await fixture(t),request=f.input();await f.dispatcher.send(request);const changed=structuredClone(request);changed.intent.deposit='1';
 await assert.rejects(f.dispatcher.send(changed),/different intent/);assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,1);
});
test('unknown timeout survives restart, never resigns, and blocks another original for that signer',async t=>{
 const f=await fixture(t,{unknown:true,throwBroadcast:true}),request=f.input(),first=await f.dispatcher.send(request);assert.equal(first.status,'unknown');
 const restarted=await createOnceDispatcher(f.config);assert.equal((await restarted.send(request)).status,'unknown');assert.equal((await restarted.send(f.input())).status,'refused_before_sign');
 assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,1);
});
test('domain and original deadline cannot be replaced on restart',async t=>{
 const f=await fixture(t);await assert.rejects(createOnceDispatcher({...f.config,domain:'foreign-local-chain'}),/domain changed/);
 await assert.rejects(createOnceDispatcher({...f.config,deadline:f.config.deadline+60000}),/domain changed/);assert.equal(f.stats.signs,0);
});
test('cached FINAL validation recovers a crash-before-release and never erases a newer unknown lock',async t=>{
 const f=await fixture(t),a=f.input();await f.dispatcher.send(a);
 const lockDir=path.join(f.directory,'signers',hash(accounts.owner));await fs.rename(path.join(f.directory,'settled-signers',a.request_id),lockDir);
 const restarted=await createOnceDispatcher(f.config);assert.equal((await restarted.inspect(a.request_id)).status,'final');
 f.controls.unknown=true;const b=f.input();assert.equal((await restarted.send(b)).status,'unknown');
 assert.equal((await restarted.inspect(a.request_id)).status,'final');assert.equal((await restarted.send(f.input())).status,'refused_before_sign');assert.equal(f.stats.signs,2);
});
test('malformed cached FINAL never becomes success without original proof validation',async t=>{
 const f=await fixture(t),a=f.input();await f.dispatcher.send(a);const p=path.join(f.directory,'requests',a.request_id,'FINAL.json'),v=JSON.parse(await fs.readFile(p));v.raw.hash='2'.repeat(32);await fs.writeFile(p,JSON.stringify(v),{mode:0o600});
 await assert.rejects(f.dispatcher.inspect(a.request_id));assert.equal(f.stats.broadcasts,1);
});
test('stale review before birth has no persistent request and no signer call',async t=>{
 const f=await fixture(t,{badPhase:'before_birth'});await assert.rejects(f.dispatcher.send(f.input()),/Fresh exact original review/);
 assert.equal((await fs.readdir(path.join(f.directory,'requests'))).length,0);assert.equal(f.stats.signs,0);
});
test('stale review after signing retains wire but neither HTTP retry nor recovery broadcasts it',async t=>{
 const f=await fixture(t,{badPhase:'before_broadcast',unknown:true}),a=f.input();await assert.rejects(f.dispatcher.send(a),/Fresh exact original review/);assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,0);
 f.controls.badPhase=null;assert.equal((await f.dispatcher.send(a)).status,'unknown');assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,0);
});
test('concurrent different requests cannot sign the same unresolved nonce lane',async t=>{
 let release;const gate=new Promise(r=>release=r),f=await fixture(t,{holdSign:gate}),a=f.input(),first=f.dispatcher.send(a);
 while(f.stats.signs===0)await new Promise(r=>setTimeout(r,1));assert.equal((await f.dispatcher.send(f.input())).status,'refused_before_sign');release();await first;assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,1);
});
test('32 immutable births preserve the signature budget across restart',async t=>{
 const f=await fixture(t);for(let n=0;n<32;n++)assert.equal((await f.dispatcher.send(f.input())).status,'final');
 const restarted=await createOnceDispatcher(f.config);await assert.rejects(restarted.send(f.input()),/cap reached/);assert.equal(f.stats.signs,32);assert.equal(f.stats.broadcasts,32);assert.equal((await fs.readdir(path.join(f.directory,'requests'))).length,32);
});
test('expired restart can inspect its original FINAL but cannot sign another request',async t=>{
 const f=await fixture(t),a=f.input(),original=await f.dispatcher.send(a);
 t.mock.method(Date,'now',()=>f.config.deadline+1);
 const restarted=await createOnceDispatcher(f.config);
 assert.equal((await restarted.inspect(a.request_id)).hash,original.hash);
 await assert.rejects(restarted.send(f.input()),/deadline passed/);
 assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,1);
});
test('a45s review expiry in transit is a durable exact unsigned refusal with explicit discard only',async t=>{
 const f=await fixture(t),a=f.input(),pending={request_id:a.request_id,intent_sha256:hash(canonical(a.intent))},storage=new Map([['original',JSON.stringify(pending)]]);
 const browserStorage={getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)};let clock=Date.now();const expiry=clock+45000;t.mock.method(Date,'now',()=>clock);
 f.ports.authorize=async(req)=>{if(clock>expiry)refuseUnsignedReview('review_expired');return {domain,intent_sha256:req.intent_sha256,observed_at_ms:clock,expires_at_ms:clock+30000};};
 clock+=46000;const refused=await f.dispatcher.send(a);assert.equal(refused.status,'refused_before_birth');assert.equal(refused.intent_sha256,pending.intent_sha256);assert.equal(positiveUnsignedRefusal(refused,pending),true);
 assert.equal(f.stats.signs,0);assert.equal(f.stats.broadcasts,0);assert.equal((await fs.readdir(path.join(f.directory,'births'))).length,0);
 assert.throws(()=>discardAcknowledgedUnsignedReview({storage:browserStorage,key:'original',pending,result:refused}),/acknowledgement/);assert.ok(storage.has('original'));
 const restarted=await createOnceDispatcher(f.config);assert.deepEqual(await restarted.inspect(a.request_id),refused);
 const ack=await restarted.discardUnsignedReview(a.request_id,pending.intent_sha256);assert.equal(ack.review_reset_acknowledged,true);discardAcknowledgedUnsignedReview({storage:browserStorage,key:'original',pending,result:ack});assert.equal(storage.has('original'),false);
 clock-=46000;assert.equal((await restarted.send(a)).status,'refused_before_birth');assert.equal(f.stats.signs,0);assert.equal(f.stats.broadcasts,0);
});
test('known expiry after birth but before sign releases only that unsigned lane and never retries its UUID',async t=>{
 const f=await fixture(t),a=f.input();let expire=true;const normal=f.ports.authorize;
 f.ports.authorize=async(req,phase)=>{if(expire&&phase==='before_sign')refuseUnsignedReview('review_expired');return normal(req,phase);};
 const refused=await f.dispatcher.send(a);assert.equal(refused.status,'refused_before_sign');assert.equal(refused.review_reset_allowed,true);assert.equal(f.stats.signs,0);assert.equal((await fs.readdir(path.join(f.directory,'signers'))).length,0);
 await f.dispatcher.discardUnsignedReview(a.request_id,hash(canonical(a.intent)));expire=false;
 assert.equal((await f.dispatcher.send(a)).status,'refused_before_sign');assert.equal(f.stats.signs,0);
 assert.equal((await f.dispatcher.send(f.input())).status,'final');assert.equal(f.stats.signs,1);
});
test('signed unknown cannot be discarded by server or browser even with forged unsigned flags',async t=>{
 const f=await fixture(t,{unknown:true}),a=f.input(),pending={request_id:a.request_id,intent_sha256:hash(canonical(a.intent))};const original=await f.dispatcher.send(a);
 await assert.rejects(f.dispatcher.discardUnsignedReview(a.request_id,pending.intent_sha256),/positively unsigned/);
 const storage=new Map([['p',JSON.stringify(pending)]]),before=storage.get('p');
 assert.throws(()=>discardAcknowledgedUnsignedReview({storage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},key:'p',pending,result:{...original,intent_sha256:pending.intent_sha256,new_signature:false,no_retry:true,review_reset_allowed:true,review_reset_acknowledged:true,reason:'review_expired'}}),/positively unsigned/);
 assert.equal(storage.get('p'),before);assert.equal(f.stats.signs,1);assert.equal(f.stats.broadcasts,1);
});
test('privacy rejection and generic ENOENT never create positive unsigned records or an automatic reset',async t=>{
 const f=await fixture(t),a=f.input();a.intent.args.private_material='SYNTHETIC_PRIVATE_SENTINEL';let rpc=0;
 f.ports.authorize=async req=>{if('private_material'in req.intent.args){const error=Error('Private action rejected before RPC');error.code='ENOENT';throw error;}rpc++;};
 await assert.rejects(f.dispatcher.send(a),/Private action rejected/);assert.equal(rpc,0);assert.equal(f.stats.signs,0);assert.equal(f.stats.broadcasts,0);assert.deepEqual(await fs.readdir(path.join(f.directory,'requests')),[]);assert.deepEqual(await fs.readdir(path.join(f.directory,'births')),[]);
 await assert.rejects(f.dispatcher.inspect(a.request_id),/no unsigned classification/);
});
test('unsigned refusal identity cannot retarget or clear a different pending original',async t=>{
 const f=await fixture(t),a=f.input();f.ports.authorize=async()=>refuseUnsignedReview('review_expired');const refused=await f.dispatcher.send(a),pending={request_id:a.request_id,intent_sha256:hash(canonical(a.intent))};
 const changed=structuredClone(a);changed.intent.deposit='1';await assert.rejects(f.dispatcher.send(changed),/different intent/);await assert.rejects(f.dispatcher.discardUnsignedReview(a.request_id,'f'.repeat(64)),/positively unsigned/);
 const ack=await f.dispatcher.discardUnsignedReview(a.request_id,pending.intent_sha256),storage=new Map([['p',JSON.stringify({...pending,request_id:randomUUID()})]]),saved=storage.get('p');
 assert.throws(()=>discardAcknowledgedUnsignedReview({storage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},key:'p',pending,result:ack}),/changed/);assert.equal(storage.get('p'),saved);assert.equal(refused.new_signature,false);
});
test('a typed refusal cannot classify an orphaned older birth as unsigned',async t=>{
 const f=await fixture(t),a=f.input();await fs.writeFile(path.join(f.directory,'births','1.json'),JSON.stringify({domain,request_id:a.request_id,intent_sha256:hash(canonical(a.intent))}),{mode:0o600});
 f.ports.authorize=async()=>refuseUnsignedReview('review_expired');await assert.rejects(f.dispatcher.send(a),/restore its records/);assert.equal(f.stats.signs,0);assert.deepEqual(await fs.readdir(path.join(f.directory,'requests')),[]);
});
test('sameUUID racing a fresh review and a retargeted expired review never signs or treats a signed original as unsigned',async t=>{
 const f=await fixture(t),a=f.input(),b=structuredClone(a);b.intent.deposit='1';let release;const gate=new Promise(r=>release=r),normal=f.ports.authorize;
 f.ports.authorize=async(req,phase)=>{if(req.intent.deposit==='1')refuseUnsignedReview('review_expired');if(phase==='before_birth')await gate;return normal(req,phase);};
 const first=f.dispatcher.send(a),refused=await f.dispatcher.send(b);assert.equal(refused.intent_sha256,hash(canonical(b.intent)));release();await assert.rejects(first,/different intent/);assert.equal(f.stats.signs,0);assert.equal(f.stats.broadcasts,0);
});
