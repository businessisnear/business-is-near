// Private LOCAL test-wallet adapter. Ports may sign only newly generated fixture
// keys. This module never opens user key files or publishes to a public network.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const check=(x,m)=>{if(!x)throw Error(m);};
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const hash=x=>typeof x==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
const amount=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(x)&&BigInt(x)<2n**128n;
const roles={owner:['create_mandate','publish_assignment','approve_award','accept','close_mandate','withdraw_owner'],operator:['post_job'],proofreader:['bid','claim','deliver_encrypted','withdraw_provider']};
// Only this locally branded refusal is a positive pre-sign classification.
// Validation/transport errors and missing files never acquire this brand.
const reviewRefusals=new WeakMap();
export function refuseUnsignedReview(reason){check(['review_expired','maintenance'].includes(reason),'Explicit unsigned review refusal reason required');const error=Error('The exact local review cannot be signed: '+reason);reviewRefusals.set(error,reason);throw error;}

async function privateDir(dir){await fs.mkdir(dir,{mode:0o700,recursive:true});check((await fs.realpath(dir))===path.resolve(dir),'Owned dispatcher path must not contain symlinks');await fs.chmod(dir,0o700);}
async function putOnce(file,value){const h=await fs.open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(value)+'\n');await h.sync();}finally{await h.close();}const d=await fs.open(path.dirname(file),'r');try{await d.sync();}finally{await d.close();}}
async function read(file){const stat=await fs.lstat(file);check(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size<2000000,'Invalid original dispatcher record');return JSON.parse(await fs.readFile(file,'utf8'));}
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}

export async function createOnceDispatcher({directory,domain,accounts,deadline,ports}){
 check(typeof domain==='string'&&domain.length>0&&domain.length<=256,'Explicit local identity domain required');
 check(Number.isSafeInteger(deadline)&&deadline>0,'Finite local signer deadline required');
 check(['sign','broadcastOnce','observeOriginal','validateFinal','authorize'].every(k=>typeof ports?.[k]==='function'),'Explicit signer/read/validation ports required');
 accounts=structuredClone(accounts);check(Object.keys(accounts).sort().join(',')==='operator,owner,proofreader'&&Object.keys(roles).every(r=>typeof accounts[r]==='string'&&/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(accounts[r]))&&new Set(Object.values(accounts)).size===3,'Original distinct local roles required');
 directory=path.resolve(directory);await privateDir(directory);for(const n of ['requests','signers','settled-signers','hashes','births'])await privateDir(path.join(directory,n));
 const identity={schema:'bin-local-once-domain-v1',domain,accounts,deadline};const identityFile=path.join(directory,'DOMAIN.json');
 if(await exists(identityFile))check(canonical(await read(identityFile))===canonical(identity),'Original local dispatcher domain changed');else await putOnce(identityFile,identity);
 const normalize=({request_id,role,intent})=>{
  check(typeof request_id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request_id),'Original UUIDv4 request required');
  check(Object.hasOwn(roles,role)&&intent&&Object.keys(intent).sort().join(',')==='args,deposit,gas,method,receiver_id,signer_id','Exact local intent fields required');
  check(intent.signer_id===accounts[role]&&roles[role].includes(intent.method),'Original local role/method required');
  check(typeof intent.receiver_id==='string'&&intent.receiver_id.length<=64&&amount(intent.deposit)&&intent.gas==='150000000000000','Exact bounded local gas/deposit required');
  check(intent.args&&typeof intent.args==='object'&&!Array.isArray(intent.args)&&Buffer.byteLength(JSON.stringify(intent.args))<=65536,'Bounded original public arguments required');
  const v={schema:'bin-local-once-request-v1',domain,request_id,role,intent:structuredClone(intent)};return {...v,intent_sha256:sha(canonical(v.intent))};
 };
 const fresh=(admission,request)=>{const t=Date.now();check(admission&&admission.domain===domain&&admission.intent_sha256===request.intent_sha256&&Number.isSafeInteger(admission.observed_at_ms)&&Number.isSafeInteger(admission.expires_at_ms)&&admission.observed_at_ms<=t+5000&&admission.expires_at_ms<=admission.observed_at_ms+60000&&t<=admission.expires_at_ms,'Fresh exact original review required');};
 const authorize=async(request,phase)=>{const admission=await ports.authorize(structuredClone(request),phase);fresh(admission,request);return structuredClone(admission);};
 const refusalRecord=(request,stage,reason,reset)=>({schema:'bin-local-positive-unsigned-v2',domain,request_id:request.request_id,role:request.role,signer_id:request.intent.signer_id,intent_sha256:request.intent_sha256,stage,reason,review_reset_allowed:reset});
 async function noOldBirth(request){for(const name of await fs.readdir(path.join(directory,'births'))){const old=await read(path.join(directory,'births',name));check(old.request_id!==request.request_id,'Original request birth exists; restore its records, never classify it unsigned');}}
 async function unsigned(dir,request_id,birth=null){
  const beforeBirth=path.join(dir,'REFUSED-BEFORE-BIRTH.json'),beforeSign=path.join(dir,'REFUSED-BEFORE-SIGN.json');
  const pre=await exists(beforeBirth),post=await exists(beforeSign);if(!pre&&!post)return null;
  check(!(pre&&post)&&!await exists(path.join(dir,'SIGNED.json'))&&!await exists(path.join(dir,'BROADCAST-ATTEMPTED.json'))&&!await exists(path.join(dir,'FINAL.json')),'Unsigned classification conflicts with original signing evidence');
  if(post&&!birth)return null;
  const r=await read(pre?beforeBirth:beforeSign);
  check(r.schema==='bin-local-positive-unsigned-v2'&&r.domain===domain&&r.request_id===request_id&&Object.keys(r).sort().join(',')==='domain,intent_sha256,reason,request_id,review_reset_allowed,role,schema,signer_id,stage'&&Object.hasOwn(roles,r.role)&&r.signer_id===accounts[r.role]&&/^[a-f0-9]{64}$/.test(r.intent_sha256),'Exact positive unsigned record required');
  check(r.stage===(pre?'before_birth':'before_sign')&&['review_expired','maintenance','original_signer_request_not_reconciled'].includes(r.reason)&&typeof r.review_reset_allowed==='boolean'&&r.review_reset_allowed===['review_expired','maintenance'].includes(r.reason),'Unsupported unsigned classification');
  if(pre)check(!await exists(path.join(dir,'BIRTH.json')),'Pre-birth refusal conflicts with original birth');
  else{check(birth&&birth.intent_sha256===r.intent_sha256&&birth.role===r.role&&birth.intent.signer_id===r.signer_id,'Original unsigned birth changed');if(r.review_reset_allowed)await releaseSigner(birth);}
  let acknowledged=false;const ack=path.join(dir,'UNSIGNED-REVIEW-DISCARDED.json');
  if(await exists(ack)){check(r.review_reset_allowed,'Unexpected unsigned review discard');const v=await read(ack);check(canonical(v)===canonical({schema:'bin-local-unsigned-review-discard-v2',domain,request_id,intent_sha256:r.intent_sha256}),'Original unsigned review discard changed');acknowledged=true;}
  return {status:pre?'refused_before_birth':'refused_before_sign',request_id,intent_sha256:r.intent_sha256,new_signature:false,no_retry:true,review_reset_allowed:r.review_reset_allowed,review_reset_acknowledged:acknowledged,reason:r.reason};
 }
 async function persistPreBirthRefusal(request,reason){
  const dir=path.join(directory,'requests',request.request_id);await noOldBirth(request);
  try{await fs.mkdir(dir,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;return send({request_id:request.request_id,role:request.role,intent:request.intent});}
  // Ownership of this original UUID directory excludes a concurrent sign path.
  // An older/orphan birth remains unknown even if its request directory vanished.
  await noOldBirth(request);
  await putOnce(path.join(dir,'REFUSED-BEFORE-BIRTH.json'),refusalRecord(request,'before_birth',reason,true));
  return inspect(request.request_id);
 }
 async function load(request_id){const dir=path.join(directory,'requests',request_id),birth=await read(path.join(dir,'BIRTH.json'));check(birth.domain===domain&&birth.request_id===request_id,'Foreign original request');return {dir,birth};}
 async function releaseSigner(birth){
  const dir=path.join(directory,'signers',sha(birth.intent.signer_id)),file=path.join(dir,'ORIGINAL.json'),settled=path.join(directory,'settled-signers',birth.request_id);
  if(await exists(settled)){const old=await read(path.join(settled,'ORIGINAL.json'));check(old.domain===domain&&old.request_id===birth.request_id&&old.intent_sha256===birth.intent_sha256,'Original settled signer record changed');return;}
  try{
   const lock=await read(file);check(lock.domain===domain,'Original signer reservation domain changed');if(lock.request_id!==birth.request_id)return;
   check(lock.intent_sha256===birth.intent_sha256,'Original signer reservation changed');
   // Keep a permanent nonempty settled directory. Atomic rename cannot erase a
   // new signer lock when simultaneous readers settle the same old original.
   try{await fs.rename(dir,settled);}catch(e){if(!['ENOENT','EEXIST','ENOTEMPTY'].includes(e.code))throw e;const done=await read(path.join(settled,'ORIGINAL.json'));check(canonical(done)===canonical(lock),'Settled signer identity changed');}
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 async function validateStoredFinal(dir,birth){
  const value=await read(path.join(dir,'FINAL.json')),signed=await read(path.join(dir,'SIGNED.json'));
  check(value.schema==='bin-local-once-final-v1'&&value.request_id===birth.request_id&&value.hash===signed.hash&&signed.intent_sha256===birth.intent_sha256&&signed.domain===domain,'Original cached FINAL identity changed');
  const checked=await ports.validateFinal(value.raw,{hash:signed.hash,intent:structuredClone(birth.intent)});
  check(['final','failed'].includes(checked?.status)&&canonical(checked)===canonical(value.checked),'Original cached FINAL proof changed');
  await releaseSigner(birth);return {status:'final',request_id:birth.request_id,hash:signed.hash,raw:value.raw,checked};
 }
 async function inspect(request_id){
  check(typeof request_id==='string'&&/^[a-f0-9-]{36}$/.test(request_id),'Original request identity required');
  const dir=path.join(directory,'requests',request_id);check(await exists(dir),'Original request is not recorded; no unsigned classification is available');
  const pre=await unsigned(dir,request_id);if(pre)return pre;
  if(!await exists(path.join(dir,'BIRTH.json')))return {status:'unknown_missing_original_record',request_id,no_retry:true,review_reset_allowed:false};
  const {birth}=await load(request_id);const post=await unsigned(dir,request_id,birth);if(post)return post;
  if(await exists(path.join(dir,'FINAL.json')))return validateStoredFinal(dir,birth);
  if(!await exists(path.join(dir,'SIGNED.json')))return {status:'unknown_before_signature_record',request_id,no_retry:true,review_reset_allowed:false};
  const signed=await read(path.join(dir,'SIGNED.json'));check(signed.intent_sha256===birth.intent_sha256&&signed.request_id===request_id&&signed.domain===domain&&hash(signed.hash),'Original signed identity changed');
  let raw;try{raw=await ports.observeOriginal({hash:signed.hash,signer_id:birth.intent.signer_id});}catch{return {status:'unknown',request_id,hash:signed.hash,no_retry:true};}
  if(!raw||raw.final_execution_status!=='FINAL')return {status:'unknown',request_id,hash:signed.hash,no_retry:true};
  const checked=await ports.validateFinal(raw,{hash:signed.hash,intent:structuredClone(birth.intent)});
  check(['final','failed'].includes(checked?.status),'Complete original FINAL validation required');
  const value={schema:'bin-local-once-final-v1',request_id,hash:signed.hash,raw,checked};
  // Only the first immutable FINAL write is accepted. Concurrent readers verify
  // equality; neither can erase or replace the original signed/wire history.
  try{await putOnce(path.join(dir,'FINAL.json'),value);}catch(e){if(e.code!=='EEXIST')throw e;check(canonical(await read(path.join(dir,'FINAL.json')))===canonical(value),'Original FINAL observation changed');}
  await releaseSigner(birth);
  return {status:'final',request_id,hash:signed.hash,raw,checked};
 }
 async function send(input){
  const request=normalize(input),dir=path.join(directory,'requests',request.request_id);
  if(await exists(dir)){
   const before=await unsigned(dir,request.request_id);if(before){check(before.intent_sha256===request.intent_sha256,'Original request ID reused for different intent');return before;}
   if(await exists(path.join(dir,'BIRTH.json'))){const old=(await load(request.request_id)).birth;check(canonical(old)===canonical(request),'Original request ID reused for different intent');}
   return inspect(request.request_id);
  }
  check(Date.now()<deadline,'Local signer deadline passed');
  // Business policy/privacy validation MUST precede even a new persistent birth.
  // Caller checks the current reviewed V4 intent and explicit public-share ack.
  try{await authorize(request,'before_birth');}catch(error){const reason=reviewRefusals.get(error);if(reason)return persistPreBirthRefusal(request,reason);throw error;}
  check(Date.now()<deadline,'Local signer deadline passed during preflight');
  // Permanent domain-wide request births enforce the32-signature ceiling even
  // after process restart. A missing old request cannot become a fresh birth.
  for(const name of await fs.readdir(path.join(directory,'births'))){const old=await read(path.join(directory,'births',name));check(old.request_id!==request.request_id,'Original request birth exists but its directory is missing; restore it, never resign');}
  let reserved=false;
  for(let i=1;i<=32;i++){try{await putOnce(path.join(directory,'births',String(i)+'.json'),{domain,request_id:request.request_id,intent_sha256:request.intent_sha256});reserved=true;break;}catch(e){if(e.code!=='EEXIST')throw e;}}
  check(reserved,'Finite local original-request cap reached');
  try{await fs.mkdir(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;return send(input);}
  await putOnce(path.join(dir,'BIRTH.json'),request);
  const lockDir=path.join(directory,'signers',sha(request.intent.signer_id));
  try{await fs.mkdir(lockDir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;await putOnce(path.join(dir,'REFUSED-BEFORE-SIGN.json'),refusalRecord(request,'before_sign','original_signer_request_not_reconciled',false));return inspect(request.request_id);}
  await putOnce(path.join(lockDir,'ORIGINAL.json'),{request_id:request.request_id,domain,intent_sha256:request.intent_sha256});
  try{await authorize(request,'before_sign');}catch(error){const reason=reviewRefusals.get(error);if(reason){await putOnce(path.join(dir,'REFUSED-BEFORE-SIGN.json'),refusalRecord(request,'before_sign',reason,true));return inspect(request.request_id);}throw error;}
  check(Date.now()<deadline,'Local signer deadline passed before signing');
  const signed=await ports.sign(structuredClone(request.intent));
  check(signed&&Object.keys(signed).every(k=>['hash','wire_base64','nonce','public_key','recent_block_hash'].includes(k))&&hash(signed.hash)&&typeof signed.wire_base64==='string'&&signed.wire_base64.length>0&&signed.wire_base64.length<=1000000&&/^[A-Za-z0-9+/]*={0,2}$/.test(signed.wire_base64)&&typeof signed.nonce==='string'&&/^[1-9][0-9]{0,19}$/.test(signed.nonce),'Exact signed original wire/hash/nonce required');
  await putOnce(path.join(dir,'SIGNED.json'),{schema:'bin-local-signed-wire-v1',domain,request_id:request.request_id,intent_sha256:request.intent_sha256,hash:signed.hash,nonce:signed.nonce,wire_base64:signed.wire_base64,wire_sha256:sha(signed.wire_base64),public_key:signed.public_key??null,recent_block_hash:signed.recent_block_hash??null});
  await putOnce(path.join(directory,'hashes',signed.hash+'.json'),{request_id:request.request_id,intent_sha256:request.intent_sha256});
  const admission=await authorize(request,'before_broadcast');
  check(Date.now()<deadline,'Local signer deadline passed before broadcast; original retained');
  // Birth is permanent BEFORE the only broadcast-capable port call. A crash at
  // any point below is resolved by inspect, never by entering this branch again.
  await putOnce(path.join(dir,'BROADCAST-ATTEMPTED.json'),{request_id:request.request_id,hash:signed.hash,at_ms:Date.now()});
  fresh(admission,request);check(Date.now()<deadline,'Local signer deadline passed after durable dispatch marker');
  try{await ports.broadcastOnce(signed.wire_base64,signed.hash);}catch(error){await putOnce(path.join(dir,'BROADCAST-UNKNOWN.json'),{request_id:request.request_id,hash:signed.hash,error_name:error?.name??'Error',no_retry:true});}
  return inspect(request.request_id);
 }
 async function discardUnsignedReview(request_id,intent_sha256){
  const original=await inspect(request_id);check(original.review_reset_allowed===true&&original.new_signature===false&&original.no_retry===true&&original.intent_sha256===intent_sha256,'Only this exact positively unsigned original review may be discarded');
  const file=path.join(directory,'requests',request_id,'UNSIGNED-REVIEW-DISCARDED.json'),ack={schema:'bin-local-unsigned-review-discard-v2',domain,request_id,intent_sha256};
  try{await putOnce(file,ack);}catch(error){if(error.code!=='EEXIST')throw error;check(canonical(await read(file))===canonical(ack),'Original unsigned review discard changed');}
  return inspect(request_id);
 }
 return {send,inspect,discardUnsignedReview,identity:()=>structuredClone(identity)};
}
