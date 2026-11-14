// Future-only LOCAL dispatcher ownership, not a missing-file/expiry inference.
// No key, signature, wire, network or transaction-body persistence in this module.
import {createHash} from 'node:crypto';
const check=(v,m)=>{if(!v)throw Error(m);};
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex');
const identity=r=>({domain:r.domain,request_id:r.request_id,role:r.role,signer_id:r.intent.signer_id,intent_sha256:r.intent_sha256});
const claimFor=r=>({schema:'bin-local-owned-prebirth-claim-v3',...identity(r)});
const proofFor=r=>({schema:'bin-local-owned-prebirth-proof-v3',...identity(r),claim_sha256:sha(claimFor(r)),birth_entered:false,sign_entered:false,broadcast_entered:false});
export function verifyPrebirthProof(request,proof,claim){
 check(canonical(claim)===canonical(claimFor(request))&&canonical(proof)===canonical(proofFor(request)),'Exact owned prebirth proof/claim required');
 return sha(proof);
}
// writeClaim MUST be exclusive+fsynced. readClaim/assertNoOriginal MUST fail on
// unreadable/conflicting state. They are trusted local IO ports, not browser data.
export function createPrebirthOwnership({writeClaim,readClaim,assertNoOriginal}){
 check([writeClaim,readClaim,assertNoOriginal].every(x=>typeof x==='function'),'Explicit owned prebirth IO required');
 const permits=new WeakMap(),observations=new Map();
 const owned=token=>{const s=permits.get(token);check(s,'Current in-process prebirth ownership required');return s;};
 return {
  async claim(request){
   const r=structuredClone(request);await assertNoOriginal(r);
   // EEXIST, fsync/write failure, read error or prior birth never mints a permit.
   await writeClaim(r,claimFor(r));await assertNoOriginal(r);
   const token=Object.freeze({}),state={request:r,birth:false,sign:false,broadcast:false,consumed:false,commit:'claimed'};permits.set(token,state);observations.set(r.request_id,state);return token;
  },
  enterBirth(token){const s=owned(token);check(!s.consumed&&!s.birth&&!s.sign&&!s.broadcast,'Prebirth capability already consumed');s.birth=true;s.commit='birth_entered';},
  enterSign(token){const s=owned(token);check(s.birth&&!s.consumed&&!s.sign&&!s.broadcast,'Owned birth required before signing');s.sign=true;},
  enterBroadcast(token){const s=owned(token);check(s.birth&&s.sign&&!s.consumed&&!s.broadcast,'Owned signature required before broadcast');s.broadcast=true;},
  observationStatus(request_id){return observations.get(request_id)?.commit??'unowned_or_restarted';},
  async acknowledge(request_id,persist){
   const s=observations.get(request_id);check(s&&['abort_committed','ack_committed'].includes(s.commit),'Live owned abort commit required before acknowledgement');
   s.commit='ack_writing';try{const result=await persist();s.commit='ack_committed';return result;}catch(error){s.commit='ack_failed';throw error;}
  },
  async abortBeforeBirth(token,persist){
   const s=owned(token);check(!s.consumed&&!s.birth&&!s.sign&&!s.broadcast,'Entered original capabilities cannot become unsigned');
   check(typeof persist==='function','Durable owned refusal writer required');
   const claim=await readClaim(s.request);await assertNoOriginal(s.request);
   const proof=proofFor(s.request);verifyPrebirthProof(s.request,proof,claim);
   // Consume BEFORE persistence; a failed write is UNKNOWN and cannot be retried
   // with this token. No error string or missing file can produce this authority.
   s.consumed=true;s.commit='abort_writing';
   try{const result=await persist(proof);s.commit='abort_committed';return result;}catch(error){s.commit='abort_failed';throw error;}
  }
 };
}
