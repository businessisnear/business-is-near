// Copyright (c) 2026 Business is NEAR. All rights reserved.
// Browser-compatible, effect-port coordinator for FUTURE new operations only.
// It never owns persistence/signing/retry/reconciliation; those remain in the
// trusted once-dispatcher. Ports are host code, never model/request supplied.
import {exact,text,hash,identity,scope,binding,same} from './vault-context.mjs';
export function createRecoveryCoordinator({crypto,getContext,getPrepared,hasPending,ownerAuth,vault,dispatchNew,validateRecovered}){
 if(!crypto?.subtle||[getContext,getPrepared,hasPending,dispatchNew,validateRecovered].some(f=>typeof f!=='function')||typeof ownerAuth?.assertCurrent!=='function'||typeof vault?.save!=='function'||typeof vault?.open!=='function')throw Error('Trusted coordinator ports required.');
 const tickets=new WeakMap();let flight=false;
 async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');}
 function context(){const x=getContext();exact(x,['epoch','network','chain_id','genesis_hash','company_id','owner','code_hash']);if(!Number.isSafeInteger(x.epoch)||x.epoch<0)throw Error('Invalid current workspace epoch.');return Object.freeze({epoch:x.epoch,...identity(Object.fromEntries(['network','chain_id','genesis_hash','company_id','owner','code_hash'].map(k=>[k,x[k]])))});}
 function current(c){if(!same(context(),c))throw Error('Workspace changed; discard this result.');}
 function noPending(){if(hasPending()!==false)throw Error('Original wallet request unresolved; no new dispatch.');}
 function prepared(p){if(!p||getPrepared()!==p)throw Error('Prepared operation changed.');exact(p,['intent_bytes','recovery','kind','record_id','commitment']);text(p.intent_bytes,131072);text(p.recovery,16384);const s=scope({kind:p.kind,record_id:p.record_id,commitment:p.commitment});return Object.freeze({...s,intent_bytes:p.intent_bytes,recovery:p.recovery});}
 function unchanged(p,s){if(!same(prepared(p),s))throw Error('Prepared operation bytes changed.');}
 function bound(c,s){const {epoch,...i}=c;return binding({schema:1,...i,record_id:s.record_id,commitment:s.commitment,kind:s.kind});}
 async function auth(c){const proof=await ownerAuth.assertCurrent(c);if(proof?.authenticated!==true||!same(proof.context,c))throw Error('Current private owner authentication required.');current(c);}
 function ack(x,b){exact(x,['schema','saved','binding','kind','record_id','commitment','vault_record','custody','wallet_native_storage']);if(x.schema!==1||x.saved!==true||x.custody!=='service-wrapped'||x.wallet_native_storage!==false||!same(binding(x.binding),b)||x.kind!==b.kind||x.record_id!==b.record_id||x.commitment!==b.commitment)throw Error('Vault backup acknowledgement changed context.');hash(x.vault_record);}
 return Object.freeze({
  async backupForReview(p){
   const c=context(),s=prepared(p);noPending();await auth(c);unchanged(p,s);noPending();const b=bound(c,s),receipt=await vault.save({binding:b,recovery:s.recovery});ack(receipt,b);current(c);unchanged(p,s);noPending();
   const intent_hash=await digest(s.intent_bytes),recovery_hash=await digest(s.recovery);current(c);unchanged(p,s);noPending();
   const ticket=Object.freeze({intent_hash,vault_record:receipt.vault_record});tickets.set(ticket,{p,c,b,intent_hash,recovery_hash});return ticket;
  },
  async approveNew(p,ticket){
   if(flight)throw Error('A new operation is already entering approval.');flight=true;
   try{
    const permit=tickets.get(ticket);if(!permit||permit.p!==p)throw Error('Exact current backup ticket required.');tickets.delete(ticket);
    const c=context(),s=prepared(p);if(!same(c,permit.c)||!same(bound(c,s),permit.b)||await digest(s.intent_bytes)!==permit.intent_hash||await digest(s.recovery)!==permit.recovery_hash)throw Error('Prepared operation or workspace changed.');
    current(c);unchanged(p,s);noPending();await auth(c);current(c);unchanged(p,s);noPending();
    // No recovery/key material crosses the transaction port. Its existing
    // durable original journal MUST perform its own atomic global claim.
    // The callback is invoked ONCE; any exception is UNKNOWN, never retried.
    try{return await dispatchNew(Object.freeze({intent_bytes:s.intent_bytes,intent_hash:permit.intent_hash,binding:permit.b}));}catch{throw Error('Wallet action outcome is UNKNOWN; inspect its original request.');}
   }finally{flight=false;}
  },
  async restore(requested){
   const c=context(),s=scope(requested),b=bound(c,s);await auth(c);const response=await vault.open({binding:b});exact(response,['binding','recovery']);if(!same(binding(response.binding),b))throw Error('Recovery response changed context.');text(response.recovery,16384);current(c);
   // This MUST use the exact public company/task/scope/evidence validators;
   // restoring a vault row alone is not evidence that a chain result is valid.
   const opened=await validateRecovered({recovery:response.recovery,binding:b});current(c);return Object.freeze({binding:b,opened});
  }
 });
}
