// Pure browser WebCrypto preparation. No RPC, wallet, signer or private storage.
import {encrypt,decrypt,newRecordKey,sealKey,publicKeyId,digest,validateEnvelope} from '../../../web-chain/src/crypto.js';

export const PROFILE='near-encrypted-procurement-delivery-v4';
export const RECIPIENT_PROFILE='near-procurement-delivery-recipients-v4';
export const IDENTITY_PROFILE='near-procurement-delivery-private-v4';
export const PLAINTEXT_PROFILE='near-procurement-delivery-plaintext-v4';
export const LIMITS=Object.freeze({body:3000,plaintext:6000,encrypted_record:8192,public_record:16384});
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const CONTEXT_FIELDS=['profile','chain_id','genesis_hash','registry_id','registry_code_hash','mandate_id','policy_sha256','company_id','goal_id','step_id','cycle','job_id','provider','owner','worker','assignment_sha256','scope_sha256','criteria_sha256','recipient_policy_sha256','owner_key_id','owner_key_version','worker_key_id','worker_key_version','content_sha256'];
const BASE_FIELDS=CONTEXT_FIELDS.filter(k=>k!=='content_sha256');
const DESC_FIELDS=['account_id','key_id','key_version','public_key_pem'];
const SEALED_FIELDS=['account_id','key_id','key_version','sealed_record_key'];
const fail=message=>{throw Error(message);};
const check=(v,message)=>{if(!v)fail(message);};
const bytes=x=>enc.encode(x).length;
const own=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(','),'Exact delivery fields required.');
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const isAccount=x=>typeof x==='string'&&x.length>=2&&x.length<=64&&/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(x);
const isBlock=x=>typeof x==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
const isId=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,23}$/.test(x)&&!['constructor','prototype','__proto__'].includes(x);
const isVersion=x=>typeof x==='string'&&/^[1-9][0-9]{0,9}$/.test(x)&&BigInt(x)<=4294967295n;
const to64=values=>btoa(Array.from(values,v=>String.fromCharCode(v)).join(''));
function from64(value){check(typeof value==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Canonical sealed record key required.');let result;try{result=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{fail('Canonical sealed record key required.');}check(to64(result)===value,'Canonical sealed record key required.');return result;}
const contextArray=c=>CONTEXT_FIELDS.map(k=>c[k]);
const sameContext=(a,b)=>JSON.stringify(contextArray(a))===JSON.stringify(contextArray(b));
const descriptorArray=d=>[d.account_id,d.key_id,d.key_version,d.public_key_pem];
function policySnapshot(policy){own(policy,['profile','owner','worker']);const result={profile:policy.profile};for(const role of ['owner','worker']){own(policy[role],DESC_FIELDS);result[role]=Object.fromEntries(DESC_FIELDS.map(k=>[k,policy[role][k]]));}return result;}
function recordSnapshot(record){own(record,['profile','context','encrypted_body','encrypted_body_sha256','sealed_keys','envelope_sha256']);own(record.sealed_keys,['owner','worker']);const sealed_keys={};for(const role of ['owner','worker']){own(record.sealed_keys[role],SEALED_FIELDS);sealed_keys[role]=Object.fromEntries(SEALED_FIELDS.map(k=>[k,record.sealed_keys[role][k]]));}return {profile:record.profile,context:context(record.context),encrypted_body:record.encrypted_body,encrypted_body_sha256:record.encrypted_body_sha256,sealed_keys,envelope_sha256:record.envelope_sha256};}

export function validateBody(body){
 check(typeof body==='string'&&body.trim().length>0&&bytes(body)<=LIMITS.body,'Delivery body must contain at most3000 UTF-8 bytes.');
 check(dec.decode(enc.encode(body))===body&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body),'Readable well-formed UTF-8 text required.');
 const obvious=/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|ed25519:[1-9A-HJ-NP-Za-km-z]{64,}|\b(?:sk|xi)[_-][A-Za-z0-9]{24,}|\b(?:api[_ -]?key|private[_ -]?key|recovery phrase|seed phrase)\s*[:=]\s*\S+/i;
 check(!obvious.test(body),'Obvious private-key/API-key/recovery-secret pattern rejected.');
 return body;
}

function context(value,{content=true}={}){
 own(value,content?CONTEXT_FIELDS:BASE_FIELDS);check(value.profile===PROFILE,'Exact V4 delivery profile required.');
 check(typeof value.chain_id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value.chain_id)&&isBlock(value.genesis_hash)&&isAccount(value.registry_id)&&isBlock(value.registry_code_hash),'Exact chain/genesis/registry identity required.');
 check(['mandate_id','policy_sha256','assignment_sha256','scope_sha256','criteria_sha256','recipient_policy_sha256','owner_key_id','worker_key_id',...(content?['content_sha256']:[])].every(k=>isHash(value[k])),'Immutable SHA256 commitments required.');
 check(['company_id','provider','owner','worker'].every(k=>isAccount(value[k]))&&new Set([value.provider,value.owner,value.worker]).size===3,'Distinct original provider/owner/worker accounts required.');
 check(['goal_id','step_id'].every(k=>isId(value[k]))&&Number.isSafeInteger(value.cycle)&&value.cycle>=0&&value.cycle<=7&&value.job_id===value.step_id+'_'+value.cycle,'Exact original step/cycle/job required.');
 check(isVersion(value.owner_key_version)&&isVersion(value.worker_key_version)&&value.owner_key_id!==value.worker_key_id,'Distinct original versioned recipient keys required.');
 const keys=content?CONTEXT_FIELDS:BASE_FIELDS;return Object.fromEntries(keys.map(k=>[k,value[k]]));
}

async function publicDescriptor(value){
 own(value,DESC_FIELDS);check(isAccount(value.account_id)&&isHash(value.key_id)&&isVersion(value.key_version),'Versioned addressed recipient key required.');
 check(await publicKeyId(value.public_key_pem)===value.key_id,'Recipient public-key fingerprint mismatch.');
 let key;try{key=await crypto.subtle.importKey('spki',from64(value.public_key_pem.replace(/-----[^-]+-----|\s/g,'')),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);}catch{fail('Approved RSA4096 public key required.');}
 check(key.algorithm.modulusLength===4096&&to64(key.algorithm.publicExponent)==='AQAB','Approved RSA4096 key with exponent65537 required.');return value;
}

export async function recipientPolicyHash(policy){
 policy=policySnapshot(policy);
 own(policy,['profile','owner','worker']);check(policy.profile===RECIPIENT_PROFILE,'Exact V4 recipient policy required.');await publicDescriptor(policy.owner);await publicDescriptor(policy.worker);
 check(policy.owner.account_id!==policy.worker.account_id&&policy.owner.key_id!==policy.worker.key_id,'Distinct owner and worker recipient keys required.');
 return digest(JSON.stringify([RECIPIENT_PROFILE,descriptorArray(policy.owner),descriptorArray(policy.worker)]));
}

async function approvedRecipients(c,policy){
 check(await recipientPolicyHash(policy)===c.recipient_policy_sha256,'Original approved recipient policy changed.');
 for(const role of ['owner','worker']){const d=policy[role];check(d.account_id===c[role]&&d.key_id===c[role+'_key_id']&&d.key_version===c[role+'_key_version'],'Original approved recipient/version changed.');}
}

function sealedDescriptor(value,c,role){
 own(value,SEALED_FIELDS);check(value.account_id===c[role]&&value.key_id===c[role+'_key_id']&&value.key_version===c[role+'_key_version'],'Sealed key addressed to a different original recipient/version.');
 check(from64(value.sealed_record_key).length===512,'RSA4096 sealed record key required.');return value;
}

async function outerHash(record){
 const sealed=role=>{const k=record.sealed_keys[role];return [role,k.account_id,k.key_id,k.key_version,k.sealed_record_key];};
 return digest(JSON.stringify([PROFILE,contextArray(record.context),record.encrypted_body_sha256,record.encrypted_body,sealed('owner'),sealed('worker')]));
}

export async function prepareDelivery({context:baseContext,recipientPolicy,body}){
 recipientPolicy=policySnapshot(recipientPolicy);
 const c=context(baseContext,{content:false});await approvedRecipients(c,recipientPolicy);validateBody(body);
 const full=context({...c,content_sha256:await digest(body)}),plaintext=JSON.stringify({profile:PLAINTEXT_PROFILE,context:full,body});check(bytes(plaintext)<=LIMITS.plaintext,'Bound plaintext exceeds6000 UTF-8 bytes.');
 const recordKey=newRecordKey(),encrypted=await encrypt(plaintext,recordKey);check(bytes(encrypted.envelope)<=LIMITS.encrypted_record,'Encrypted record exceeds8192 UTF-8 bytes.');
 const sealed_keys={};for(const role of ['owner','worker']){const d=recipientPolicy[role];sealed_keys[role]={account_id:d.account_id,key_id:d.key_id,key_version:d.key_version,sealed_record_key:await sealKey(recordKey,d.public_key_pem,d.key_id)};}
 const record={profile:PROFILE,context:full,encrypted_body:encrypted.envelope,encrypted_body_sha256:encrypted.hash,sealed_keys};record.envelope_sha256=await outerHash(record);check(bytes(JSON.stringify(record))<=LIMITS.public_record,'Complete public delivery record exceeds16384 UTF-8 bytes.');
 return record;
}

export async function verifyDelivery(record,{expectedContext,recipientPolicy}){
 record=recordSnapshot(record);recipientPolicy=policySnapshot(recipientPolicy);
 own(record,['profile','context','encrypted_body','encrypted_body_sha256','sealed_keys','envelope_sha256']);check(record.profile===PROFILE&&bytes(JSON.stringify(record))<=LIMITS.public_record,'Bound V4 public delivery record required.');
 const c=context(record.context),expected=context(expectedContext);check(sameContext(c,expected),'Envelope is not addressed to the trusted original delivery context.');await approvedRecipients(expected,recipientPolicy);
 check(typeof record.encrypted_body==='string'&&bytes(record.encrypted_body)<=LIMITS.encrypted_record&&isHash(record.encrypted_body_sha256)&&isHash(record.envelope_sha256),'Bound encrypted record and commitments required.');validateEnvelope(record.encrypted_body);check(await digest(record.encrypted_body)===record.encrypted_body_sha256,'Encrypted record commitment changed.');
 own(record.sealed_keys,['owner','worker']);for(const role of ['owner','worker'])sealedDescriptor(record.sealed_keys[role],c,role);check(await outerHash(record)===record.envelope_sha256,'Outer delivery commitment changed.');return record;
}

async function privateRecipient(identity,descriptor){
 own(identity,['profile','account_id','key_id','key_version','public_key_pem','private_jwk']);check(identity.profile===IDENTITY_PROFILE&&DESC_FIELDS.every(k=>identity[k]===descriptor[k]),'Original addressed private identity and version required.');
 const j=identity.private_jwk;check(j&&typeof j==='object'&&!Array.isArray(j)&&j.kty==='RSA'&&j.alg==='RSA-OAEP-256'&&typeof j.d==='string','Original RSA-OAEP private identity required.');
 let pub,key;try{pub=await crypto.subtle.importKey('jwk',{kty:'RSA',n:j.n,e:j.e,alg:'RSA-OAEP-256',ext:true,key_ops:['encrypt']},{name:'RSA-OAEP',hash:'SHA-256'},true,['encrypt']);key=await crypto.subtle.importKey('jwk',j,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);}catch{fail('Original RSA-OAEP private identity required.');}
 const spki=to64(new Uint8Array(await crypto.subtle.exportKey('spki',pub)));check(spki===descriptor.public_key_pem.replace(/-----[^-]+-----|\s/g,'')&&key.algorithm.modulusLength===4096,'Private identity does not match the original approved public key.');return key;
}

export async function openDelivery(record,{expectedContext,recipientPolicy,recipient,identity}){
 recipientPolicy=policySnapshot(recipientPolicy);record=await verifyDelivery(record,{expectedContext,recipientPolicy});expectedContext=context(expectedContext);check(['owner','worker'].includes(recipient),'Choose the original addressed owner or worker.');const descriptor=recipientPolicy[recipient],key=await privateRecipient(identity,descriptor);let recordKey;
 try{const opened=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'RSA-OAEP'},key,from64(record.sealed_keys[recipient].sealed_record_key))));own(opened,['record_key']);check(typeof opened.record_key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(opened.record_key),'Malformed sealed record key.');recordKey=opened.record_key;}catch{fail('This identity cannot open the original addressed delivery key.');}
 const plaintext=await decrypt(record.encrypted_body,recordKey,record.encrypted_body_sha256);check(bytes(plaintext)<=LIMITS.plaintext,'Bound plaintext exceeds6000 UTF-8 bytes.');let opened;try{opened=JSON.parse(plaintext);}catch{fail('Malformed addressed delivery plaintext.');}own(opened,['profile','context','body']);check(opened.profile===PLAINTEXT_PROFILE,'Unsupported addressed delivery plaintext.');const inner=context(opened.context);check(sameContext(inner,context(expectedContext))&&sameContext(inner,record.context),'Inside delivery context differs from the trusted original job.');validateBody(opened.body);check(await digest(opened.body)===inner.content_sha256,'Plaintext content commitment changed.');
 return {profile:PROFILE,context:inner,body:opened.body,recipient,recipient_account_id:descriptor.account_id,provider_content_is_untrusted:true,quality_verified:false,delivery_accepted:false,payment_authorized:false};
}
