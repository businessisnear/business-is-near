// Service-operator issuer. Never receives a founder's owner key or signs a deposit.
// A normal company worker receives only its separate receiver/method/allowance key.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {FinalizedJournal,privateText} from './journal.mjs';
import {commitFinalOutcome} from './outcome.mjs';

export const FLEET_RPC='https://test.rpc.fastnear.com';
export const FLEET_GENESIS='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b';
export const COMPANY_METHODS=Object.freeze(['company_tick','ai_reserve_call','ai_complete_call','company_attest','company_archive']);
const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,SHA=/^[0-9a-f]{64}$/;
const ONE='1000000000000000000000000',HEARTBEAT_ALLOWANCE='3000000000000000000000000';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function need(ok,message){if(!ok)throw Error(message);}
export class CompanyPreflightRefused extends Error{
 constructor(company){super('Company public preflight refused before signing');this.company=company;}
}
export class IssuerReadPreflightRefused extends Error{
 constructor(action,company,method,context){super('Issuer transport read refused before signing');this.action=action;this.company=company;this.diagnostic={method,http_status:context.http_status??null,error_kind:context.error_kind||'TransportError',attempts:1,read_only:true};}
}
const readContext=new AsyncLocalStorage();
function guardedReadProvider(provider,phase,action,company){
 const methods={status:'status',block:'block',query:'query',experimental_protocolConfig:'EXPERIMENTAL_protocol_config'};
 return new Proxy(provider,{get(target,name){const value=target[name];if(typeof value!=='function')return value;if(!Object.hasOwn(methods,name))return value.bind(target);return (...args)=>{const context={http_status:null,transport_failure:false,error_kind:null};return readContext.run(context,async()=>{try{return await value.apply(target,args);}catch(error){if(phase.trusted&&phase.signing_started===false&&phase.intent_saved===false&&phase.submission_started===false&&(context.transport_failure||[429,500,502,503,504].includes(context.http_status)))throw new IssuerReadPreflightRefused(action,company,methods[name],context);throw error;}});};}});
}
export function validateIssuerSpec(v){
 const fields=['schema','profile','factory_id','factory_code_hash','template_sha256','company_code_hash','operator_id','worker_key_id','worker_public_key','service_expires_at','operator_key_file','heartbeat_key_file','root_dir'];
 need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.sort().join(','),'Exact fleet issuer fields required');
 need(v.schema===1&&v.profile==='public-testnet-founder-fleet-v1','Explicit testnet founder fleet required');
 need(ACCOUNT.test(v.factory_id)&&ACCOUNT.test(v.operator_id)&&v.factory_id!==v.operator_id,'Distinct named testnet factory/operator required');
 need(HASH.test(v.factory_code_hash)&&HASH.test(v.company_code_hash)&&SHA.test(v.template_sha256)&&SHA.test(v.worker_key_id),'Pinned public identities required');
 need(typeof v.worker_public_key==='string'&&sha(v.worker_public_key)===v.worker_key_id,'Worker encryption fingerprint changed');
 need(typeof v.service_expires_at==='string'&&/^[1-9][0-9]{9,10}$/.test(v.service_expires_at),'Finite service expiry required');
 for(const n of ['operator_key_file','heartbeat_key_file','root_dir'])need(typeof v[n]==='string'&&path.isAbsolute(v[n]),'Absolute protected issuer paths required');
 need(v.operator_key_file!==v.heartbeat_key_file,'Issuer and heartbeat key files must differ');return v;
}
export function validateFunctionKey(access,receiver,methods,ceiling){
 const f=access?.permission?.FunctionCall;
 need(f&&f.receiver_id===receiver&&Array.isArray(f.method_names)&&same([...f.method_names].sort(),[...methods].sort())&&typeof f.allowance==='string'&&/^[1-9][0-9]*$/.test(f.allowance)&&BigInt(f.allowance)<=BigInt(ceiling),'Exact receiver/methods and positive bounded allowance required');
 return true;
}
export function validateService(v,s,now,{allowExpired=false}={}){
 need(v&&v.schema==='near-founder-worker-service-v1'&&v.operator_id===s.operator_id&&v.worker_key_id===s.worker_key_id&&v.worker_public_key===s.worker_public_key&&v.service_expires_at===s.service_expires_at&&v.model==='gemma4:e2b-it-q4_K_M'&&v.model_digest==='b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2'&&v.execution_backend==='local_gemma_mock'&&v.cloud_billing_verified===false&&v.tee_verified===false&&v.max_companies===8&&v.max_reservations_per_company===2&&v.max_reservations_global===16,'Factory service pin mismatch');
 need(allowExpired||BigInt(v.service_expires_at)>BigInt(now),'Service expired');return v;
}
export function validateDispatchService(v,s,now,state,{heartbeat=false,localNow=BigInt(Math.floor(Date.now()/1000))}={}){
 validateService(v,s,now);need(state?.frozen===false&&localNow<BigInt(s.service_expires_at)&&localNow>=BigInt(now)-60n&&localNow<=BigInt(now)+60n,'Factory frozen or service dispatch clock expired/stale');
 if(!heartbeat){for(const k of ['heartbeat_at','heartbeat_expires_at','observed_at'])need(typeof v[k]==='string'&&/^(0|[1-9][0-9]{0,10})$/.test(v[k]),'Exact native heartbeat required');const at=BigInt(v.heartbeat_at),end=BigInt(v.heartbeat_expires_at);need(v.online===true&&BigInt(v.observed_at)===BigInt(now)&&at>0n&&at<=BigInt(now)&&BigInt(now)<end&&localNow<end&&end<=at+600n&&end<=BigInt(s.service_expires_at),'Native worker heartbeat offline or stale');}
 return v;
}
export async function dispatchPreflight(provider,s,{heartbeat=false,clock=()=>BigInt(Math.floor(Date.now()/1000))}={}){
 need(clock()<BigInt(s.service_expires_at),'Service lease expired before issuer dispatch');
 const status=await provider.status();need(status.chain_id==='testnet'&&status.genesis_hash===FLEET_GENESIS&&status.sync_info?.syncing===false,'Fixed synchronized issuer genesis required');
 const block=await provider.block({finality:'final'}),now=BigInt(block.header.timestamp_nanosec)/1000000000n;
 const bound=r=>{need(r?.block_hash===block.header.hash&&r.block_height===block.header.height,'Dispatch view differs from FINAL block');return r;};
 const query=async(id,method)=>{const r=bound(await provider.query({request_type:'call_function',account_id:id,method_name:method,args_base64:'e30=',block_id:block.header.hash}));need(Array.isArray(r.result)&&r.result.length<1000000&&r.result.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Bounded issuer dispatch view required');return JSON.parse(Buffer.from(r.result).toString());};
 const [factory,state,service,account,protocol]=await Promise.all([provider.query({request_type:'view_account',account_id:s.factory_id,block_id:block.header.hash}).then(bound),query(s.factory_id,'state'),query(s.factory_id,'worker_service'),provider.query({request_type:'view_account',account_id:s.operator_id,block_id:block.header.hash}).then(bound),provider.experimental_protocolConfig({blockId:block.header.hash})]);
 need(factory.code_hash===s.factory_code_hash,'Factory code changed before issuer dispatch');
 const cost=BigInt(protocol.runtime_config.storage_amount_per_byte),floor=BigInt(protocol.runtime_config.min_gas_purchase_price),price=BigInt(block.header.gas_price);need(cost>0n&&floor>0n&&price>0n&&Number.isSafeInteger(account.storage_usage)&&account.storage_usage>=0,'Exact issuer dispatch liquidity quote required');
 need(BigInt(account.amount)-BigInt(account.locked)-BigInt(account.storage_usage)*cost>=500000000000000000000000n+(heartbeat?152000000000000n:52000000000000n)*(price>floor?price:floor),'Issuer dispatch liquid floor unavailable');
 validateDispatchService(service,s,now,state,{heartbeat,localNow:clock()});return {service,block,now};
}
export function verifyIssuerSignedIntent(p,{S,s,grant,company,receiver,publicKey,restrictedPublicKey}){
 const raw=Buffer.from(p.signed_base64,'base64');need(raw.length<32768&&raw.toString('base64')===p.signed_base64&&sha(raw)===p.signed_sha256,'Signed enrollment evidence changed');
 const decoded=S.SignedTransaction.decode(raw),t=decoded.transaction,bytes=new S.Transaction(t).encode(),digest=crypto.createHash('sha256').update(bytes).digest();
 const keyString=k=>{const data=k?.ed25519Key?.data;need(data&&data.length===32,'Decoded Ed25519 public key required');return 'ed25519:'+S.baseEncode(Uint8Array.from(data));};
 need(Buffer.from(S.encodeTransaction(decoded)).equals(raw)&&S.baseEncode(digest)===p.hash&&t.signerId===s.operator_id&&t.receiverId===receiver&&keyString(t.publicKey)===publicKey&&String(t.nonce)===p.nonce&&S.utils.PublicKey.fromString(publicKey).verify(digest,Uint8Array.from(decoded.signature.ed25519Signature.data))&&p.signature==='ed25519:'+S.baseEncode(Uint8Array.from(decoded.signature.ed25519Signature.data)),'Signed issuer transaction identity changed');
 need(t.actions.length===1,'One exact issuer action required');
 if(grant){const a=t.actions[0].addKey,f=a?.accessKey?.permission?.functionCall;need(p.method==='fleet_add_key'&&p.id===company&&a&&keyString(a.publicKey)===restrictedPublicKey&&String(a.accessKey.nonce)==='0'&&f?.receiverId===company&&String(f.allowance)===ONE&&same(f.methodNames,COMPANY_METHODS),'Signed receiver-scoped AddKey changed');}
 else{const f=t.actions[0].functionCall;need(p.method==='heartbeat'&&p.id===null&&f?.methodName==='heartbeat'&&String(f.deposit)==='0'&&String(f.gas)==='50000000000000'&&Buffer.from(f.args).toString('base64')===p.args_base64,'Signed heartbeat changed');const args=JSON.parse(Buffer.from(p.args_base64,'base64').toString());need(Object.keys(args).sort().join(',')==='expires_at,worker_key_id'&&args.worker_key_id===s.worker_key_id&&/^[1-9][0-9]{9,10}$/.test(args.expires_at)&&BigInt(args.expires_at)<=BigInt(s.service_expires_at),'Signed heartbeat scope changed');}
 return decoded;
}
async function privateDirectory(p){
 need(path.isAbsolute(p)&&await fs.realpath(p)===p,'Canonical private directory required');
 const st=await fs.lstat(p);need(st.isDirectory()&&!st.isSymbolicLink()&&!(st.mode&0o077)&&st.uid===process.getuid(),'Private owner-only directory required');
 for(let q=p;;q=path.dirname(q)){try{await fs.lstat(path.join(q,'.git'));throw Error('Private state cannot be inside a Git checkout');}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(q)===q)break;}
}
async function readPrivate(p,limit=16384){
 await privateDirectory(path.dirname(p));need(await fs.realpath(p)===p,'Canonical private file required');
 const st=await fs.lstat(p);need(st.nlink===1,'Private file may not be hard linked');return privateText(p,limit);
}
async function writeNew(p,v){const tmp=p+'.new-'+crypto.randomBytes(8).toString('hex')+'.tmp';let created=false;try{const h=await fs.open(tmp,'wx',0o600);created=true;try{await h.writeFile(JSON.stringify(v));await h.sync();}finally{await h.close();}await fs.link(tmp,p);await fs.unlink(tmp);created=false;const dir=await fs.open(path.dirname(p),'r');try{await dir.sync();}finally{await dir.close();}}finally{if(created)await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
async function atomic(p,v){const tmp=p+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';await writeNew(tmp,v);await fs.rename(tmp,p);const h=await fs.open(path.dirname(p),'r');try{await h.sync();}finally{await h.close();}}
async function sdk(){const require=createRequire(new URL('./package.json',import.meta.url));return {...require('near-api-js'),...require('@near-js/transactions'),...require('@near-js/utils'),...require('@near-js/signers')};}
async function keyFile(file,id,S){const v=JSON.parse(await readPrivate(file,4096));need(v.account_id===id&&typeof v.secret_key==='string','Service operator key account mismatch');const k=S.KeyPair.fromString(v.secret_key);need(v.public_key===k.getPublicKey().toString(),'Service key public identity mismatch');return k;}
function enrollmentIdentity(i,s,company){return i?.profile===s.profile&&i.network==='testnet'&&i.factory===s.factory_id&&i.factory_code_hash===s.factory_code_hash&&i.operator===s.operator_id&&i.worker_key_id===s.worker_key_id&&i.purpose==='company_enrollment'&&i.company===company&&/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(i.key)&&/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(i.restricted_key);}
function pristineGrant(j,s,company){return j?.version===1&&j.pending===null&&Array.isArray(j.history)&&j.history.length===0&&(!j.archive||(j.archive.count===0&&j.archive.head===null))&&enrollmentIdentity(j.identity,s,company);}
function finalGrant(j,s,company){const r=j?.history?.[0];return j?.version===1&&j.pending===null&&j.history.length===1&&!j.archive?.count&&enrollmentIdentity(j.identity,s,company)&&r.status==='final'&&r.method==='fleet_add_key'&&r.tx?.hash===r.hash&&r.tx?.signer===s.operator_id&&r.tx?.receiver===s.operator_id;}
function parentProvedNoGrant(row){
 const attempts=row.enrollment_attempts,closed=row.enrollment_no_dispatch,last=row.last_enrollment_no_dispatch;
 if(!Number.isSafeInteger(attempts)||attempts<0||!Number.isSafeInteger(closed)||closed<0||closed>attempts||row.enrollment_effect_recorded!==false)return false;
 if(row.enrollment_started===false)return attempts===0&&closed===0;
 return row.enrollment_started===true&&attempts>0&&closed===attempts&&last?.schema===1&&last.attempt===attempts&&last.source==='trusted_local_issuer'&&['CompanyPreflightRefused','RegistryReadUnavailable'].includes(last.kind)&&last.signing_started===false&&last.intent_saved===false&&last.submission_started===false;
}
async function sharedGrantClear(s,current,reconcile){
 const base=path.join(s.root_dir,'companies');await privateDirectory(base);const entries=await fs.readdir(base,{withFileTypes:true});need(entries.length<=8,'Bounded shared grant registry required');
 for(const entry of entries){need(entry.isDirectory()&&!entry.isSymbolicLink()&&SHA.test(entry.name),'Shared grant directory identity changed');const directory=path.join(base,entry.name);await privateDirectory(directory);const file=path.join(directory,'enrollment-journal.json');let keyExists;try{await fs.lstat(path.join(directory,'restricted-operator.json'));keyExists=true;}catch(e){if(e.code!=='ENOENT')throw e;keyExists=false;}let journal;try{journal=JSON.parse(await readPrivate(file,1048576));}catch(e){if(e.code==='ENOENT'){need(!keyExists,'Shared grant key has no original journal');continue;}throw e;}need(journal.version===1&&journal.identity?.network==='testnet'&&journal.identity?.operator===s.operator_id&&journal.identity?.factory===s.factory_id&&journal.identity?.purpose==='company_enrollment'&&journal.identity?.company&&sha(journal.identity.company)===entry.name&&Array.isArray(journal.history),'Shared grant journal identity changed');if(!keyExists){need(pristineGrant(journal,s,journal.identity.company)||finalGrant(journal,s,journal.identity.company),'Shared grant journal lost a key after possible signing');if(pristineGrant(journal,s,journal.identity.company))continue;}await new FinalizedJournal(file,journal.identity).validate(journal);need(!journal.pending||(reconcile&&directory===current),'Shared FullAccess enrollment pending; reconcile original hash before any new grant');}
}
export async function executeIssuer(configFile,action,company=null,{sdkLoader=sdk}={}){
 need(['grant','heartbeat','reconcile-grant','reconcile-heartbeat'].includes(action),'Unsupported issuer action');
 const s=validateIssuerSpec(JSON.parse(await readPrivate(configFile))),S=await sdkLoader();await privateDirectory(s.root_dir);
 const grant=action.endsWith('grant'),reconcile=action.startsWith('reconcile-'),receiver=grant?s.operator_id:s.factory_id;
 if(grant)need(ACCOUNT.test(company)&&company.endsWith('.'+s.factory_id)&&company!==s.factory_id,'Immediate factory child required');
 const dir=grant?path.join(s.root_dir,'companies',sha(company)):s.root_dir;await privateDirectory(dir);
 const keyPath=path.join(dir,'restricted-operator.json'),journalPath=path.join(dir,grant?'enrollment-journal.json':'heartbeat-journal.json');
 const lock=path.join(s.root_dir,grant?'issuer-grant.lock':'issuer-heartbeat.lock');await fs.mkdir(lock,{mode:0o700});
 const lockOwner=path.join(lock,'owner.json');
 let journal,archive,originalFetch;const phase={trusted:false,signing_started:false,intent_saved:false,submission_started:false};
 try{
  await atomic(lockOwner,{schema:'near-fleet-issuer-lock-v1',pid:process.pid,action,company:company||null,operator_id:s.operator_id,factory_id:s.factory_id,created_at:Math.floor(Date.now()/1000)});
  if(grant){await sharedGrantClear(s,dir,reconcile);phase.trusted=!reconcile;}
  else{
   const localKey=await keyFile(s.heartbeat_key_file,s.operator_id,S),identity={profile:s.profile,network:'testnet',factory:s.factory_id,factory_code_hash:s.factory_code_hash,operator:s.operator_id,worker_key_id:s.worker_key_id,purpose:'service_heartbeat',company:null,key:localKey.getPublicKey().toString(),restricted_key:null};
   try{journal=JSON.parse(await readPrivate(journalPath,1048576));need(journal.version===1&&same(journal.identity,identity),'Original heartbeat identity changed before read');}catch(error){if(error.code!=='ENOENT'||reconcile)throw error;journal={version:1,identity,pending:null,history:[]};await atomic(journalPath,journal);}
   await new FinalizedJournal(journalPath,identity).validate(journal);
   if(journal.pending&&!reconcile)return {status:'needs_reconciliation',hash:journal.pending.hash};
   phase.trusted=!reconcile&&journal.pending===null;
  }
  originalFetch=globalThis.fetch;globalThis.fetch=async(url,options={})=>{const context=readContext.getStore();try{const response=await originalFetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(context)context.http_status=response.status;return response;}catch(error){if(context){context.transport_failure=true;context.error_kind=error.name;}throw error;}};
  const provider=guardedReadProvider(new S.providers.JsonRpcProvider({url:FLEET_RPC},{retries:1}),phase,action,company);
  const status=await provider.status();need(status.chain_id==='testnet'&&status.genesis_hash===FLEET_GENESIS&&status.sync_info?.syncing===false,'Only synchronized fixed public NEAR testnet genesis permitted');
  const block=await provider.block({finality:'final'}),now=BigInt(block.header.timestamp_nanosec)/1000000000n;
  const bound=value=>{need(value?.block_hash===block.header.hash&&value.block_height===block.header.height,'Issuer view differs from the requested FINAL block');return value;};
  const info=bound(await provider.query({request_type:'view_account',account_id:s.factory_id,block_id:block.header.hash}));need(info.code_hash===s.factory_code_hash,'Factory code changed');
  const view=async(id,method,args={})=>{const r=bound(await provider.query({request_type:'call_function',account_id:id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),block_id:block.header.hash}));need(Array.isArray(r.result)&&r.result.length<1000000&&r.result.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Bounded finalized view required');return JSON.parse(Buffer.from(r.result).toString());};
  const service=validateService(await view(s.factory_id,'worker_service'),s,now,{allowExpired:reconcile});
  const [operatorAccount,protocol]=await Promise.all([provider.query({request_type:'view_account',account_id:s.operator_id,block_id:block.header.hash}).then(bound),provider.experimental_protocolConfig({blockId:block.header.hash})]);
  const storagePrice=BigInt(protocol.runtime_config.storage_amount_per_byte),purchaseFloor=BigInt(protocol.runtime_config.min_gas_purchase_price),gasPrice=BigInt(block.header.gas_price);
  need(storagePrice>0n&&purchaseFloor>0n&&gasPrice>0n&&Number.isSafeInteger(operatorAccount.storage_usage)&&operatorAccount.storage_usage>=0,'Exact current operator storage/gas quote required');
  const liquid=BigInt(operatorAccount.amount)-BigInt(operatorAccount.locked)-BigInt(operatorAccount.storage_usage)*storagePrice;
  // Preserve the liquid floor even if the other scoped key is concurrently
  // executing one bounded worker transition or heartbeat.
  const transactionUpfront=(grant?52000000000000n:152000000000000n)*(gasPrice>purchaseFloor?gasPrice:purchaseFloor);
  need(reconcile||liquid>=500000000000000000000000n+transactionUpfront,'Service operator liquid balance below0.5TESTNEAR plus transaction upfront');
  let restricted=null,record=null,persistRestricted=false;
  if(grant){
   need(reconcile||service.online===true,'Service heartbeat must be online before enrollment');
   const listed=await view(s.factory_id,'list',{from:0,limit:8});need(Array.isArray(listed.records)&&listed.total<=8,'Bounded public service registry required');
   await sharedGrantClear(s,dir,reconcile);
   record=listed.records.find(r=>r.child===company);let eligible=Boolean(record&&record.phase==='active'&&record.config.operator===s.operator_id&&record.config.supplier===s.operator_id&&record.template_sha256===s.template_sha256);
   if(eligible&&!reconcile){try{const [ci,ct,profile]=await Promise.all([provider.query({request_type:'view_account',account_id:company,block_id:block.header.hash}).then(bound),view(company,'state'),view(company,'execution_profile')]);eligible=ci.code_hash===s.company_code_hash&&ct.owner===record.creator&&ct.operator===s.operator_id&&ct.frozen===false&&profile?.profile==='business-operations-v1'&&profile.worker_key_id===s.worker_key_id&&profile.worker_public_key===s.worker_public_key&&profile.target_origin==='';}catch(error){if(error instanceof IssuerReadPreflightRefused)throw error;throw new CompanyPreflightRefused(company);}}
   if(!eligible&&!reconcile)throw new CompanyPreflightRefused(company);
   const exists=async p=>{try{await fs.lstat(p);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
   const hasKey=await exists(keyPath),hasJournal=await exists(journalPath);
   if(!hasKey&&hasJournal){const saved=JSON.parse(await readPrivate(journalPath,1048576));if(pristineGrant(saved,s,company)||finalGrant(saved,s,company))throw new CompanyPreflightRefused(company);}
   need(hasKey===hasJournal,'Partial or missing enrollment key/journal requires operator review');
   if(hasKey){try{restricted=await keyFile(keyPath,s.operator_id,S);}catch(error){const saved=JSON.parse(await readPrivate(journalPath,1048576));if(!reconcile&&(pristineGrant(saved,s,company)||finalGrant(saved,s,company)))throw new CompanyPreflightRefused(company);throw error;}}
   else{need(!reconcile,'Original reconciliation key missing');persistRestricted=true;}
  }
  const signingKey=await keyFile(grant?s.operator_key_file:s.heartbeat_key_file,s.operator_id,S);
  const publicKey=signingKey.getPublicKey().toString();
  let access=null;
  if(!reconcile){access=bound(await provider.query({request_type:'view_access_key',account_id:s.operator_id,public_key:publicKey,block_id:block.header.hash}));if(grant)need(access.permission==='FullAccess','Enrollment requires the separately protected service-operator issuer key');else validateFunctionKey(access,s.factory_id,['heartbeat'],HEARTBEAT_ALLOWANCE);}
  if(persistRestricted)restricted=S.KeyPair.fromRandom('ed25519');
  const identity={profile:s.profile,network:'testnet',factory:s.factory_id,factory_code_hash:s.factory_code_hash,operator:s.operator_id,worker_key_id:s.worker_key_id,purpose:grant?'company_enrollment':'service_heartbeat',company:company||null,key:publicKey,restricted_key:restricted?.getPublicKey().toString()||null};
  try{journal=JSON.parse(await readPrivate(journalPath,1048576));need(journal.version===1&&same(journal.identity,identity),'Issuer journal identity changed');}
  catch(e){if(e.code!=='ENOENT'||reconcile)throw e;journal={version:1,identity,pending:null,history:[]};await atomic(journalPath,journal);}
  if(persistRestricted){try{await writeNew(keyPath,{account_id:s.operator_id,public_key:restricted.getPublicKey().toString(),secret_key:restricted.toString()});}catch{throw new CompanyPreflightRefused(company);}}
  archive=new FinalizedJournal(journalPath,identity);await archive.validate(journal);await archive.compact(journal);
  const save=async(value)=>atomic(journalPath,value);
  const wire=p=>verifyIssuerSignedIntent(p,{S,s,grant,company,receiver,publicKey,restrictedPublicKey:identity.restricted_key});
  async function finalize(out){
   const p=journal.pending;wire(p);const t=out?.transaction;
   need(t&&t.public_key===publicKey&&String(t.nonce)===p.nonce&&t.signature===p.signature&&t.actions?.length===1,'FINAL issuer wire differs');
   if(grant){const a=t.actions[0].AddKey;need(a?.public_key===identity.restricted_key&&String(a.access_key?.nonce)==='0','FINAL AddKey changed');validateFunctionKey(a.access_key,company,COMPANY_METHODS,ONE);need(a.access_key.permission.FunctionCall.allowance===ONE,'FINAL initial allowance changed');}
   else{const f=t.actions[0].FunctionCall;need(f?.method_name==='heartbeat'&&f.deposit==='0'&&String(f.gas)==='50000000000000'&&f.args===p.args_base64,'FINAL heartbeat changed');}
   return commitFinalOutcome(journal,out,s.operator_id,receiver,archive,save);
  }
  if(journal.pending){
   wire(journal.pending);
   if(!action.startsWith('reconcile-'))return {status:'needs_reconciliation',hash:journal.pending.hash};
   try{return await finalize(await provider.txStatus(journal.pending.hash,s.operator_id,'FINAL'));}catch{return {status:'unknown',hash:journal.pending.hash};}
  }
  if(action.startsWith('reconcile-'))return {status:'none'};
  const count=(journal.archive?.count||0)+journal.history.length;
  if(grant&&count){need(count===1&&journal.history.at(-1)?.status==='final','Original enrollment failed; operator review required');const current=await provider.query({request_type:'view_access_key',account_id:s.operator_id,public_key:identity.restricted_key,finality:'final'});validateFunctionKey(current,company,COMPANY_METHODS,ONE);return {status:'enrolled',public_key:identity.restricted_key};}
  need(grant||count<579,'Heartbeat lifetime count exhausted (one bootstrap heartbeat reserved separately)');
  const fresh=await dispatchPreflight(provider,s,{heartbeat:!grant});
  let actions,args;
  if(grant){actions=[S.transactions.addKey(restricted.getPublicKey(),S.transactions.functionCallAccessKey(company,[...COMPANY_METHODS],BigInt(ONE)))];args={company,public_key:identity.restricted_key,allowance:ONE,methods:COMPANY_METHODS};}
  else{const expiry=fresh.now+600n<BigInt(service.service_expires_at)?fresh.now+600n:BigInt(service.service_expires_at);args={worker_key_id:s.worker_key_id,expires_at:String(expiry)};actions=[S.transactions.functionCall('heartbeat',args,50000000000000n,0n)];}
  const tx=S.createTransaction(s.operator_id,signingKey.getPublicKey(),receiver,BigInt(access.nonce)+1n,actions,S.baseDecode(block.header.hash));
  phase.signing_started=true;
  const signer=await S.InMemorySigner.fromKeyPair('testnet',s.operator_id,signingKey),[hash,signed]=await S.signTransaction(tx,signer,s.operator_id,'testnet');
  const hash58=S.baseEncode(hash),raw=Buffer.from(S.encodeTransaction(signed));
  const pending={hash:hash58,method:grant?'fleet_add_key':'heartbeat',id:company||null,args_hash:sha(JSON.stringify(args)),request_id:(grant?'grant_':'heartbeat_')+hash58,signed_base64:raw.toString('base64'),signed_sha256:sha(raw),nonce:String(tx.nonce),signature:'ed25519:'+S.baseEncode(signed.signature.ed25519Signature.data),args_base64:Buffer.from(JSON.stringify(args)).toString('base64')};
  wire(pending);const next={...journal,pending};await save(next);journal=next;phase.intent_saved=true;
  // Exactly one send. A timeout/error is retained pending, never interpreted as a failure.
  try{await dispatchPreflight(provider,s,{heartbeat:!grant});phase.submission_started=true;await provider.sendTransaction(signed);return await finalize(await provider.txStatus(hash58,s.operator_id,'FINAL'));}
  catch{return {status:'unknown',hash:hash58};}
 }finally{if(originalFetch)globalThis.fetch=originalFetch;await fs.unlink(lockOwner).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rmdir(lock);}
}
async function auditedIssuerLocks(s){
 const locks=[];
 for(const name of ['issuer-grant.lock','issuer-heartbeat.lock']){
  const dir=path.join(s.root_dir,name);let stat;try{stat=await fs.lstat(dir);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  await privateDirectory(dir);need(same((await fs.readdir(dir)).sort(),['owner.json']),'Issuer lock has no exact owner proof; inspect the original process manually');
  const file=path.join(dir,'owner.json'),raw=await readPrivate(file,4096),owner=JSON.parse(raw),item=await fs.lstat(file);
  need(owner&&Object.keys(owner).sort().join(',')==='action,company,created_at,factory_id,operator_id,pid,schema'&&owner.schema==='near-fleet-issuer-lock-v1'&&Number.isSafeInteger(owner.pid)&&owner.pid>1&&owner.operator_id===s.operator_id&&owner.factory_id===s.factory_id&&Number.isSafeInteger(owner.created_at)&&owner.created_at>0,'Issuer lock owner identity differs');
  need(name==='issuer-grant.lock'?['grant','reconcile-grant'].includes(owner.action)&&ACCOUNT.test(owner.company)&&owner.company.endsWith('.'+s.factory_id):['heartbeat','reconcile-heartbeat'].includes(owner.action)&&owner.company===null,'Issuer lock action differs');
  let dead=false;try{process.kill(owner.pid,0);}catch(e){need(e.code==='ESRCH','Issuer lock process is live or uncertain');dead=true;}
  need(dead,'Issuer lock process is live or uncertain');
  locks.push({name,owner,owner_sha256:sha(raw),dev:stat.dev,ino:stat.ino,owner_dev:item.dev,owner_ino:item.ino});
 }
 return locks;
}
export async function auditFleetJournals(configFile){
 const s=validateIssuerSpec(JSON.parse(await readPrivate(configFile)));
 await privateDirectory(s.root_dir);
 const state=JSON.parse(await readPrivate(path.join(s.root_dir,'fleet-state.json'),2000000));
 need(state.schema===1&&state.identity?.profile===s.profile&&state.identity?.factory_id===s.factory_id&&state.identity?.operator_id===s.operator_id&&state.identity?.worker_key_id===s.worker_key_id&&state.identity?.service_expires_at===s.service_expires_at&&state.companies&&typeof state.companies==='object'&&!Array.isArray(state.companies),'Original fleet audit identity differs');
 const rows=Object.entries(state.companies);need(rows.length<=8,'Bounded retained company registry required');
 const base=path.join(s.root_dir,'companies');await privateDirectory(base);
 const entries=await fs.readdir(base,{withFileTypes:true}),expected=new Set(rows.map(([company])=>sha(company)));
 need(entries.length<=8&&entries.every(e=>e.isDirectory()&&!e.isSymbolicLink()&&expected.has(e.name)),'Company directory has no retained identity');
 const files={},companies=[];
 const optional=async(file)=>{try{const raw=await readPrivate(file,1048576);return {raw,value:JSON.parse(raw)};}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const exists=async(file)=>{try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
 async function audit(file,item,identity,methods,receiver){
  const {raw,value:j}=item;need(j.version===1&&j.pending===null&&Array.isArray(j.history),'Original journal has unresolved signed intent');
  if(identity)need(same(j.identity,identity),'Original issuer audit identity changed');
  const archiveIdentity=identity||{chain:j.chain,contract:j.contract,operator:j.operator,key:j.key,code_hash:j.code_hash};
  for(const suffix of ['.requests','.archive']){
   const dir=file+suffix;let list;
   try{await privateDirectory(dir);list=await fs.readdir(dir);}catch(e){if(e.code==='ENOENT'){need(suffix==='.archive'?!j.archive?.head:!j.archive?.count&&!j.history.some(r=>r.request_id!==undefined),'Original finalized archive/index missing');continue;}throw e;}
   need(list.length<=2048,'Bounded original journal archive required');
   for(const name of list){need(/^[a-f0-9]{64}\.json$/.test(name),'Original archive filename differs');files[path.relative(s.root_dir,path.join(dir,name))]=sha(await readPrivate(path.join(dir,name),1048576));}
  }
  await new FinalizedJournal(file,archiveIdentity).validate(j);
  need(j.history.every(r=>r.status==='final'&&methods.includes(r.method)&&r.tx?.signer===s.operator_id&&r.tx?.receiver===receiver),'Original finalized action identity differs');
  files[path.relative(s.root_dir,file)]=sha(raw);return {journal:j,count:(j.archive?.count||0)+j.history.length};
 }
 const heartbeatFile=path.join(s.root_dir,'heartbeat-journal.json'),heartbeatItem=await optional(heartbeatFile);
 need(heartbeatItem,'Original heartbeat accounting is missing');
 const hi=heartbeatItem.value.identity;
 need(hi?.profile===s.profile&&hi.network==='testnet'&&hi.factory===s.factory_id&&hi.factory_code_hash===s.factory_code_hash&&hi.operator===s.operator_id&&hi.worker_key_id===s.worker_key_id&&hi.purpose==='service_heartbeat'&&hi.company===null&&hi.restricted_key===null,'Original heartbeat identity differs');
 const heartbeat=await audit(heartbeatFile,heartbeatItem,hi,['heartbeat'],s.factory_id);need(heartbeat.count<=579,'Original heartbeat cap exceeded');
 for(const [company,row]of rows){
  need(ACCOUNT.test(company)&&company.endsWith('.'+s.factory_id)&&row?.binding?.child===company&&Number.isSafeInteger(row.logical_calls)&&row.logical_calls>=0,'Retained company audit binding differs');
  const dir=path.join(base,sha(company)),grantFile=path.join(dir,'enrollment-journal.json'),rpcFile=path.join(dir,'rpc-journal.json');
  const hasDirectory=await exists(dir);
  if(hasDirectory)await privateDirectory(dir);
  const grantItem=hasDirectory?await optional(grantFile):null,keyPresent=hasDirectory&&await exists(path.join(dir,'restricted-operator.json'));
  const rpcItem=hasDirectory?await optional(rpcFile):null;
  if(!grantItem){
   // Only a new, explicit monotone creation marker proves this parent has never
   // invoked the issuer. Sticky read errors and legacy phase names are not proof.
   const archivePresent=hasDirectory&&(await exists(grantFile+'.archive')||await exists(grantFile+'.requests')||await exists(rpcFile+'.archive')||await exists(rpcFile+'.requests'));
   need(!keyPresent&&!rpcItem&&!archivePresent&&row.runtime_created!==true&&row.logical_calls===0&&parentProvedNoGrant(row)&&['preparing','quarantined'].includes(row.phase),'Missing original enrollment cannot prove no dispatch');
   companies.push({company,phase:'unstarted_no_dispatch',worker_writes:0,enrollment_count:0,accounting_required:false});continue;
  }
  const identity=grantItem.value.identity;
  need(enrollmentIdentity(identity,s,company),'Original company enrollment identity differs');
  if(pristineGrant(grantItem.value,s,company)){
   need(!rpcItem&&row.runtime_created!==true&&row.logical_calls===0&&row.enrollment_effect_recorded!==true&&row.phase!=='enrolled','Pristine enrollment conflicts with worker accounting');
   const grant=await audit(grantFile,grantItem,identity,['fleet_add_key'],s.operator_id);need(grant.count===0,'Pristine grant count differs');
   companies.push({company,phase:'prepared_no_dispatch',worker_writes:0,enrollment_count:0,accounting_required:false});continue;
  }
  const grant=await audit(grantFile,grantItem,identity,['fleet_add_key'],s.operator_id);need(grant.count===1,'Exactly one FINAL original enrollment required');
  if(!rpcItem){
   need(row.runtime_created!==true&&row.logical_calls===0,'Initialized original RPC journal is missing');
   companies.push({company,phase:'enrolled_no_dispatch',worker_writes:0,enrollment_count:1,accounting_required:false,worker_key_present:keyPresent});continue;
  }
  const r=rpcItem.value;
  need(r.chain==='testnet'&&r.contract===company&&r.operator===s.operator_id&&r.key===identity.restricted_key&&r.code_hash===s.company_code_hash,'Original company RPC identity differs');
  const rpc=await audit(rpcFile,rpcItem,null,COMPANY_METHODS,company);
  need(row.runtime_created===true||rpc.count===0&&row.logical_calls===0,'Worker writes have no initialized accounting');
  companies.push({company,phase:row.runtime_created===true?'initialized_final':'enrolled_no_dispatch',worker_writes:rpc.count,enrollment_count:1,accounting_required:row.runtime_created===true,worker_key_present:keyPresent});
 }
 const issuer_locks=await auditedIssuerLocks(s);
 return {status:'audited',network:'testnet',factory:s.factory_id,operator:s.operator_id,heartbeat_attempts:heartbeat.count,companies,journal_files:files,issuer_locks,key_reads:0,network_requests:0,signatures:0,broadcasts:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [, , config,action,company]=process.argv;const result=action==='audit-journals'?await auditFleetJournals(config):await executeIssuer(config,action,company);process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=['final','enrolled','none','audited'].includes(result.status)?0:2;}
 catch(e){const value=e instanceof IssuerReadPreflightRefused?{status:'read_unavailable',action:e.action,company:e.company,read_failure:e.diagnostic,no_dispatch:{schema:1,source:'trusted_local_issuer',journal_pending:false,signing_started:false,intent_saved:false,submission_started:false}}:e instanceof CompanyPreflightRefused?{status:'company_refused',company:e.company,no_dispatch:{schema:1,scope:'company_enrollment',shared_pending_checked:true,signing_started:false,intent_saved:false,submission_started:false}}:{status:'refused',error_kind:e.name,action:'Inspect protected issuer configuration and original journals; no automatic resend.'};process.stdout.write(JSON.stringify(value)+'\n');process.exitCode=2;}
}
