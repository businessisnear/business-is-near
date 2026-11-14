// Browser-standard helpers. An explicit user action can discard only a positive
// unsigned refusal acknowledged by the server for this exact opaque original.
const check=(v,m)=>{if(!v)throw Error(m);};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function positiveUnsignedRefusal(result,pending){
 return Boolean(pending&&uuid(pending.request_id)&&hash(pending.intent_sha256)&&result&&['refused_before_birth','refused_before_sign'].includes(result.status)&&result.request_id===pending.request_id&&result.intent_sha256===pending.intent_sha256&&result.new_signature===false&&result.no_retry===true&&result.review_reset_allowed===true&&!Object.hasOwn(result,'hash')&&(['review_expired','maintenance'].includes(result.reason)||(result.reason==='owned_prebirth_aborted'&&result.status==='refused_before_birth'&&result.ownership_schema==='bin-local-owned-prebirth-proof-v3'&&hash(result.ownership_sha256))));
}
export function discardAcknowledgedUnsignedReview({storage,key,pending,result}){
 check(positiveUnsignedRefusal(result,pending)&&result.review_reset_acknowledged===true,'Exact positively unsigned review acknowledgement required');
 const current=storage.getItem(key);check(current!==null,'Original pending review is missing');const parsed=JSON.parse(current);
 check(parsed.request_id===pending.request_id&&parsed.intent_sha256===pending.intent_sha256&&Object.keys(parsed).sort().join(',')==='intent_sha256,request_id','Original pending review changed');
 storage.removeItem(key);
}
export const financialActionsAvailable=state=>state?.maintenance?.schema==='bin-local-maintenance-v2'&&state.maintenance.mutations_available===true&&Array.isArray(state.maintenance.reasons)&&state.maintenance.reasons.length===0;
// A delayed inspection cannot undo an already acknowledged immutable discard.
// Keep the original UUID/digest/reason/stage; conflicting signing evidence fails.
export function mergeOriginalObservation(previous,next,pending){
 if(!positiveUnsignedRefusal(previous,pending)||previous.review_reset_acknowledged!==true)return structuredClone(next);
 check(next?.request_id===pending.request_id&&(!Object.hasOwn(next,'intent_sha256')||next.intent_sha256===pending.intent_sha256)&&!Object.hasOwn(next,'hash')&&!Object.hasOwn(next,'checked')&&(!Object.hasOwn(next,'new_signature')||next.new_signature===false),'Acknowledged unsigned original identity conflicted');
 if(positiveUnsignedRefusal(next,pending)){
  check(next.status===previous.status&&next.reason===previous.reason,'Acknowledged unsigned original refusal changed');return {...structuredClone(next),review_reset_acknowledged:true};
 }
 check(['unknown_missing_original_record','unknown_before_signature_record','unknown','unknown_owned_prebirth_commit','unknown_owned_prebirth_ack'].includes(next.status)&&next.no_retry===true,'Acknowledged unsigned terminal record changed');
 return structuredClone(previous);
}
export function cacheOriginalObservation(row,next,pending){
 try{
  check(row.request_id===pending.request_id&&next.request_id===pending.request_id&&(!Object.hasOwn(next,'intent_sha256')||next.intent_sha256===pending.intent_sha256),'Original cached observation identity changed');
  row.original_result=mergeOriginalObservation(row.original_result,next,pending);row.status=row.original_result.status;
 }catch(error){row.inspection_conflict=true;throw error;}
 return structuredClone(row.original_result);
}
