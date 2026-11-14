// Restricted remote worker bridge: never accepts an owner/customer key or signs deposits.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {FinalizedJournal} from './journal.mjs';
import {commitFinalOutcome} from './outcome.mjs';
let require=createRequire(fileURLToPath(new URL('./package.json',import.meta.url)));
try{require.resolve('near-api-js');}catch{require=createRequire(fileURLToPath(new URL('../contract/package.json',import.meta.url)));}
const {KeyPair,providers,transactions,utils}=require('near-api-js');
const {InMemorySigner}=require('@near-js/signers');
const {createTransaction,signTransaction,SignedTransaction,Transaction,encodeTransaction}=require('@near-js/transactions');
const {PublicKey}=utils;
const {baseDecode:base_decode,baseEncode:base_encode}=require('@near-js/utils');
console.log=(...args)=>console.error(...args);
// near-js uses global fetch; bound even a stalled response body and prohibit
// provider-level automatic retries, including on ambiguous broadcasts.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(target,options={})=>{
 const c=transportContext||activeRequest;deadlineCheck(c);
 if(network==='testnet')await rpcQueue.reserveHttpStart(c);deadlineCheck(c);
 const response=await originalFetch(target,{...options,redirect:'error',signal:AbortSignal.timeout(rpcRequestBudget(c))});
 if(c&&!response.ok&&Number.isInteger(response.status)&&response.status>=100&&response.status<=599)c.http_status=response.status;
 return response;
};
const env=process.env;
const network=env.PROOF_WORK_RPC_NETWORK, url=env.PROOF_WORK_RPC_URL, contract=env.PROOF_WORK_CONTRACT_ID, operator=env.PROOF_WORK_OPERATOR_ID;
const keyFile=env.PROOF_WORK_OPERATOR_KEY_FILE,journalPath=env.PROOF_WORK_RPC_JOURNAL,codeHash=env.PROOF_WORK_EXPECTED_CODE_HASH,workerKey=env.PROOF_WORK_WORKER_KEY_ID;
const allowed=['approve_order','company_tick','company_attest','settle','pay','cancel','decline_order','company_archive','ai_reserve_call','ai_complete_call','ai_reserve_media_call','ai_complete_media_call','company_run_mandate','company_commit_plan'];
const views=new Set(['company_state','execution_profile','company_task','company_list','company_history','company_tick_readiness','job','jobs_list','order_quote','company_order_quote','company_solvency','ai_policy','ai_call','ai_media_policy','ai_media_call','company_mandate','company_mandates','company_mandate_readiness','company_inbox','company_inbox_messages']);
const schemas={approve_order:['id'],company_tick:['id'],company_attest:['id','evidence_hash','encrypted_evidence'],settle:['id'],pay:['id'],cancel:['id'],decline_order:['id','reason'],company_archive:['id'],ai_reserve_call:['id','job_id','model','policy_version','prompt_hash','input_tokens','output_tokens'],ai_complete_call:['id','output_hash'],ai_reserve_media_call:['id','job_id','kind','policy_version','media_policy_version','prompt_hash','asset_commitment'],ai_complete_media_call:['id','output_hash'],company_run_mandate:['id','expected_run'],company_commit_plan:['id','choice','evidence_hash','encrypted_evidence']};
const gas=100000000000000n;
let provider,key,signer,journal,archive,lockPath,lockOwned=false,actualCodeHash,rpcQueue;
// BEGIN trusted local preflight protocol
// The parent trusts this local child/pipe. These flags are not a chain proof.
const PUBLIC_TESTNET_RPC=new Set(['https://rpc.testnet.near.org','https://test.rpc.fastnear.com']);
const PREFLIGHT_TYPES=new Set(['Error','TypeError','SyntaxError','RangeError','AbortError','TimeoutError','RPCDeadlineError','ProviderError','RetriesExceeded','UnknownTransaction','UNKNOWN_TRANSACTION','HANDLER_ERROR','INVALID_REQUEST','UNKNOWN_ACCOUNT','UNKNOWN_ACCESS_KEY','CONTRACT_EXECUTION_ERROR','NO_CONTRACT_CODE','SERVER_ERROR','INTERNAL_ERROR','TIMEOUT_ERROR','RPCCommandDeadlineError','RPCCommandStoppedError']);
const PREFLIGHT_STAGES=new Set(['local.validation','local.identity','local.journal','local.archive','local.decode','rpc.status','rpc.access_key','rpc.account','rpc.block',...['state',...views].map(x=>'rpc.view.'+x)]);
const COMMAND_MS=85000;
function rpcCallLimit(mode,target){return mode==='sandbox'&&typeof target==='string'&&/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(target)?45000:12000;}
function rpcRequestBudget(c,mode=network,target=url,now=Date.now){const at=now();deadlineCheck(c,()=>at);return Math.min(rpcCallLimit(mode,target),c?c.deadline-at:Infinity);}
function rpcDiagnostic(c,now=Date.now){
 if(!c||!Number.isFinite(c.deadline))return null;
 const remaining=Math.max(0,Math.min(COMMAND_MS,Math.floor(c.deadline-now())));
 return {http_status:Number.isInteger(c.http_status)&&c.http_status>=100&&c.http_status<=599?c.http_status:null,request_limit_ms:rpcCallLimit(network,url),command_elapsed_ms:COMMAND_MS-remaining,command_remaining_ms:remaining};
}
let activeRequest=null,transportContext=null,localJournalValidated=false;
const localFailureReceipts=new WeakMap();
function failureWithReceipt(message,tx){const error=Error(message);localFailureReceipts.set(error,tx);return error;}
function newRequestContext(kind,requestId,requestHash,method,now=Date.now){
 return {kind,request_id:requestId,request_sha256:requestHash,method,stage:'local.validation',deadline:now()+COMMAND_MS,journal_validated:false,signing_started:false,intent_saved:false,submission_started:false,stopped:false,sdk_failed:false,sdk_error:null,failure:null,http_status:null};
}
function deadlineCheck(c,now=Date.now){
 if(c?.stopped)throw c.sdk_error||Object.assign(Error('Local RPC command stopped'),{name:'RPCCommandStoppedError'});
 if(c&&now()>=c.deadline)throw Object.assign(Error('Local RPC command deadline'),{name:'RPCCommandDeadlineError'});
}
function stopRequest(c,error,stage){if(!c)return;if(stage&&PREFLIGHT_STAGES.has(stage))c.stage=stage;c.failure??=preflightDiagnostic(c,error);c.stopped=true;if(!c.sdk_failed){c.sdk_failed=true;c.sdk_error=error;}}
function preflightDiagnostic(c,error){
 if(c?.failure)return c.failure;
 const name=PREFLIGHT_TYPES.has(error?.type)?error.type:PREFLIGHT_TYPES.has(error?.name)?error.name:'OtherError';
 return {stage:PREFLIGHT_STAGES.has(c?.stage)?c.stage:'uncertain',error_type:name,http_status:Number.isInteger(c?.http_status)&&c.http_status>=100&&c.http_status<=599?c.http_status:null};
}
function noDispatchAssertion(c,j){
 // No field from an SDK error or response may participate in this assertion.
 if(!c||!['startup','write'].includes(c.kind)||c.journal_validated!==true||j?.pending!==null||c.signing_started!==false||c.intent_saved!==false||c.submission_started!==false)return null;
 if(c.kind==='startup'&&(c.request_id!=='startup'||c.method!==null)||c.kind==='write'&&(!/^[a-f0-9]{32}$/.test(c.request_id)||![...allowed,'company_archive_keeper'].includes(c.method)))return null;
 const stage=c.failure?.stage||c.stage;
 if(!PREFLIGHT_STAGES.has(stage)||!/^[a-f0-9]{64}$/.test(c.request_sha256))return null;
 return {version:1,disposition:'local_preflight_refused',scope:c.kind,request_id:c.request_id,request_sha256:c.request_sha256,method:c.method,stage,journal_validated:true,journal_pending:false,signing_started:false,intent_saved:false,submission_started:false};
}
function beforeSigning(c){deadlineCheck(c);if(!c)throw Error('Missing local signing context');c.signing_started=true;c.stage='signing';}
function signedPhase(c,phase){if(c&&phase==='intent_saved')c.intent_saved=true;if(c&&phase==='submission_started'){deadlineCheck(c);c.submission_started=true;}if(c)c.stage=phase;}
function fixedRpcUrl(network,url,chainId,pinnedCode){
 if(network==='testnet')return PUBLIC_TESTNET_RPC.has(url)&&!!pinnedCode;
 return network==='sandbox'&&/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(url)&&!!chainId;
}
function rpcStage(method,args){
 if(method==='status')return 'rpc.status';if(method==='block')return 'rpc.block';
 if(method==='query'){if(args?.request_type==='view_access_key')return 'rpc.access_key';if(args?.request_type==='view_account')return 'rpc.account';if(args?.request_type==='call_function'&&['state',...views].includes(args.method_name))return 'rpc.view.'+args.method_name;}
 return 'uncertain';
}
function createRpcQueue(sdk,{isPublic,context=()=>activeRequest,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 let tail=Promise.resolve(),lastStart=null,httpTail=Promise.resolve(),lastHttpStart=null;
 const reserveHttpStart=c=>{const item=httpTail.then(async()=>{deadlineCheck(c,now);if(isPublic&&lastHttpStart!==null){const gap=1000-(now()-lastHttpStart);if(gap>0)await sleep(gap);}deadlineCheck(c,now);lastHttpStart=now();});httpTail=item.catch(()=>{});return item;};
 const call=(method,args)=>{const c=context(),stage=rpcStage(method,args[0]),task=async()=>{
  if(c?.sdk_failed)throw c.sdk_error;
  try{
   deadlineCheck(c,now);
   if(isPublic&&lastStart!==null){const gap=1000-(now()-lastStart);if(gap>0)await sleep(gap);}
   deadlineCheck(c,now);if(c)c.stage=stage;lastStart=now();transportContext=c;
   const value=await sdk[method](...args);if(c)c.stage='local.validation';return value;
  }catch(error){if(c&&!c.sdk_failed){c.failure={...preflightDiagnostic(c,error),stage};c.sdk_failed=true;c.sdk_error=error;}throw error;}
  finally{transportContext=null;}
 };const item=isPublic?tail.then(task):task();tail=isPublic?item.catch(()=>{}):Promise.allSettled([tail,item]).then(()=>{});return item;};
 return Object.freeze({provider:Object.freeze(Object.fromEntries(['status','query','block','sendTransaction','txStatus'].map(name=>[name,(...args)=>call(name,args)]))),reserveHttpStart,drain:async()=>{await tail;await httpTail;}});
}
// END trusted local preflight protocol

const reply=x=>process.stdout.write(JSON.stringify(x)+'\n');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const bounded=async p=>{const observed=Promise.resolve(p);observed.catch(()=>{});let timer;try{const budget=rpcRequestBudget(activeRequest);return await Promise.race([observed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('RPC request timed out'),{name:'RPCDeadlineError'})),budget);timer.unref();})]);}finally{clearTimeout(timer);}};
// BEGIN bounded signed-intent evidence
const SIGNED_BYTES_LIMIT=32768,EVIDENCE_BYTES_LIMIT=65536,JOURNAL_BYTES_LIMIT=1048576;
const evidenceError=()=>Error('Invalid private signed intent evidence');
const evidenceIdentity=()=>({chain:journal.chain,operator,contract,key:journal.key,code_hash:journal.code_hash});
function verifySignedEvidence(p,identity){
 // Legacy pending records remain hash-only and can only be reconciled by hash.
 if(p.signed_intent===undefined)return null;
 try{
  const e=p.signed_intent;
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='block_hash,format,nonce,signed_base64,signed_sha256,unsigned_sha256'||e.format!==1||p.broadcast_attempt_reserved!==1||Buffer.byteLength(JSON.stringify(e))>EVIDENCE_BYTES_LIMIT)throw evidenceError();
  if(typeof e.signed_base64!=='string'||e.signed_base64.length>4*Math.ceil(SIGNED_BYTES_LIMIT/3))throw evidenceError();
  const raw=Buffer.from(e.signed_base64,'base64');
  if(raw.length>SIGNED_BYTES_LIMIT||raw.toString('base64')!==e.signed_base64||sha(raw)!==e.signed_sha256)throw evidenceError();
  const decoded=SignedTransaction.decode(raw),t=decoded.transaction;
  if(!Buffer.from(encodeTransaction(decoded)).equals(raw)||!t.publicKey.ed25519Key||!decoded.signature.ed25519Signature)throw evidenceError();
  const unsigned=new Transaction(t).encode(),hash=crypto.createHash('sha256').update(unsigned).digest();
  const pk='ed25519:'+base_encode(Uint8Array.from(t.publicKey.ed25519Key.data)),sig=Uint8Array.from(decoded.signature.ed25519Signature.data);
  if(pk!==identity.key||base_encode(hash)!==p.hash||sha(unsigned)!==e.unsigned_sha256||!PublicKey.fromString(pk).verify(hash,sig))throw evidenceError();
  if(t.signerId!==identity.operator||t.receiverId!==identity.contract||typeof e.nonce!=='string'||!/^[1-9][0-9]{0,19}$/.test(e.nonce)||BigInt(e.nonce)>=2n**64n||String(t.nonce)!==e.nonce||base_encode(Uint8Array.from(t.blockHash))!==e.block_hash)throw evidenceError();
  if(!Array.isArray(t.actions)||t.actions.length!==1||!t.actions[0].functionCall)throw evidenceError();
  const c=t.actions[0].functionCall,argsBytes=Buffer.from(c.args);
  if(!allowed.includes(p.method)||c.methodName!==p.method||String(c.gas)!==String(gas)||String(c.deposit)!=='0'||sha(argsBytes)!==p.args_hash||argsBytes.length>24000)throw evidenceError();
  const args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(argsBytes));
  if(!args||typeof args!=='object'||Array.isArray(args)||(args.id||null)!==p.id)throw evidenceError();
  return {nonce:e.nonce,public_key:pk,signature:'ed25519:'+base_encode(sig),method:p.method,args_base64:argsBytes.toString('base64'),gas:String(c.gas),deposit:'0'};
 }catch{throw evidenceError();}
}
function makeSignedEvidence(signed,pending,identity){
 const raw=Buffer.from(encodeTransaction(signed));
 if(raw.length>SIGNED_BYTES_LIMIT||!raw.equals(Buffer.from(signed.encode())))throw evidenceError();
 const t=signed.transaction,e={format:1,signed_base64:raw.toString('base64'),signed_sha256:sha(raw),unsigned_sha256:sha(new Transaction(t).encode()),nonce:String(t.nonce),block_hash:base_encode(Uint8Array.from(t.blockHash))};
 const p={...pending,broadcast_attempt_reserved:1,signed_intent:e};verifySignedEvidence(p,identity);
 return Object.freeze({...p,signed_intent:Object.freeze(e)});
}
function verifySignedFinal(out,pending,identity){
 const e=verifySignedEvidence(pending,identity);if(!e)return;
 const t=out?.transaction,c=t?.actions?.[0]?.FunctionCall;
 if(!t||t.public_key!==e.public_key||String(t.nonce)!==e.nonce||t.signature!==e.signature||!Array.isArray(t.actions)||t.actions.length!==1||!c||Object.keys(c).sort().join(',')!=='args,deposit,gas,method_name'||c.method_name!==e.method||c.args!==e.args_base64||String(c.gas)!==e.gas||String(c.deposit)!==e.deposit)throw evidenceError();
}
function safeUnknownDiagnostic(stage,error,hasEvidence,timing=null){
 const stages=new Set(['send','status','finalize']);
 const types=new Set(['AbortError','TimeoutError','RPCDeadlineError','TypeError','SyntaxError','ProviderError','RetriesExceeded','UnknownTransaction','UNKNOWN_TRANSACTION','TIMEOUT_ERROR','INTERNAL_ERROR','DOES_NOT_TRACK_SHARD','INVALID_TRANSACTION','HANDLER_ERROR','InvalidNonce','Expired','InvalidSignature','AccessKeyNotFound','NotEnoughAllowance','NotEnoughBalance','InvalidTxError']);
 const type=types.has(error?.type)?error.type:types.has(error?.name)?error.name:'UnknownError';
 const result={stage:stages.has(stage)?stage:'finalize',error_type:type,signed_bytes_available:hasEvidence};
 if(timing&&Object.keys(timing).sort().join(',')==='command_elapsed_ms,command_remaining_ms,http_status,request_limit_ms'&&[12000,45000].includes(timing.request_limit_ms)&&(timing.http_status===null||Number.isInteger(timing.http_status)&&timing.http_status>=100&&timing.http_status<=599)&&['command_elapsed_ms','command_remaining_ms'].every(k=>Number.isInteger(timing[k])&&timing[k]>=0&&timing[k]<=85000))result.transport=Object.freeze({...timing});
 return Object.freeze(result);
}
async function retainUnknown(j,saveJournal,stage,error,timing=null){
 const p=j.pending;if(!p)return null;
 const diagnostic=safeUnknownDiagnostic(stage,error,p.signed_intent!==undefined,timing),next={...j,pending:{...p,first_unknown:p.first_unknown??p.last_unknown??diagnostic,last_unknown:diagnostic}};
 // Failure to update diagnostics must leave the original durable pending intact.
 try{await saveJournal(next);Object.assign(j,next);}catch{}
 return diagnostic;
}
async function submitOneSigned({j,pending,signed,identity,transport,wait,saveJournal,commit,onPhase=()=>{},diagnostics=()=>null}){
 if(j.pending)throw Error('Pending transaction must be reconciled before another write');
 const next={...j,pending:makeSignedEvidence(signed,pending,identity)};
 if(Buffer.byteLength(JSON.stringify(next))>JOURNAL_BYTES_LIMIT)throw Error('Private journal capacity exceeded');
 await saveJournal(next);Object.assign(j,next);onPhase('intent_saved');
 let stage='send';
 try{
  // Reservation is durable before this sole call; it does not prove network dispatch.
  onPhase('submission_started');await wait(transport.sendTransaction(signed));
  stage='status';const out=await wait(transport.txStatus(pending.hash,identity.operator,'FINAL'));
  stage='finalize';verifySignedFinal(out,j.pending,identity);return await commit(out);
 }catch(error){await retainUnknown(j,saveJournal,stage,error,diagnostics());throw Error('Transaction broadcast outcome unknown; reconcile by hash');}
}
async function reconcileOnePending({j,identity,transport,wait,saveJournal,commit,diagnostics=()=>null}){
 if(!j.pending)return {status:'none'};
 const p=j.pending;verifySignedEvidence(p,identity);let stage='status';
 try{
  const out=await wait(transport.txStatus(p.hash,identity.operator,'FINAL'));
  stage='finalize';verifySignedFinal(out,p,identity);return await commit(out);
 }catch(error){const diagnostic=await retainUnknown(j,saveJournal,stage,error,diagnostics());return {status:'unknown',hash:p.hash,diagnostic};}
}
// END bounded signed-intent evidence

async function privateRead(file,max=1024*1024){
 if(!path.isAbsolute(file))throw Error('Private path must be absolute');
 const h=await fs.open(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=await h.stat();if(!s.isFile()||(s.mode&0o077)||s.uid!==process.getuid()||s.size>max)throw Error('Unsafe private file');return await h.readFile('utf8');}finally{await h.close();}
}
async function save(value=journal){if(Buffer.byteLength(JSON.stringify(value))>JOURNAL_BYTES_LIMIT)throw Error('Private journal capacity exceeded');const tmp=journalPath+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}await fs.rename(tmp,journalPath);const dir=await fs.open(path.dirname(journalPath),'r');try{await dir.sync();}finally{await dir.close();}}
async function view(method,args={}){const r=await provider.query({request_type:'call_function',account_id:contract,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),finality:'final'});try{return JSON.parse(Buffer.from(r.result).toString());}catch(error){stopRequest(activeRequest,error,'local.decode');throw error;}}
function restricted(access,method){const fc=access?.permission?.FunctionCall;if(!fc||fc.receiver_id!==contract||!Array.isArray(fc.method_names)||fc.method_names.length===0||fc.method_names.some(x=>!allowed.includes(x))||fc.allowance===null||fc.allowance===undefined||BigInt(fc.allowance)<=0n||(method&&!fc.method_names.includes(method)))throw Error('Key must be restricted to allowed methods, receiver and finite allowance');}
async function snapshot(){const [t,c,profile,solvency,info]=await Promise.all([view('state'),view('company_state'),view('execution_profile'),view('company_solvency'),provider.query({request_type:'view_account',account_id:contract,finality:'final'})]);if(!profile||profile.worker_key_id!==workerKey||t.operator!==operator||info.code_hash!==actualCodeHash)throw Error('Worker execution identity or code mismatch');const b=await provider.block({finality:'final'});t.chain_day=String(BigInt(b.header.timestamp_nanosec)/86400000000000n);return {network:network==='testnet'?'NEAR testnet':'local NEAR sandbox',contract_id:contract,operator,session_id:network+':'+contract+':'+actualCodeHash,contract:t,company:c,solvency,execution_profile:profile};}
async function loadLocalJournal(chain,expectedCode){
 activeRequest.stage='local.journal';
 try{journal=JSON.parse(await privateRead(journalPath));if(journal.version!==1||journal.chain!==chain||journal.contract!==contract||journal.operator!==operator||journal.key!==key.getPublicKey().toString()||journal.code_hash!==expectedCode)throw Error('Journal identity mismatch');}
 catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,chain,contract,operator,key:key.getPublicKey().toString(),code_hash:expectedCode,pending:null,history:[]};}
 if(journal.pending)verifySignedEvidence(journal.pending,evidenceIdentity());
 archive=new FinalizedJournal(journalPath,{chain:journal.chain,contract,operator,key:journal.key,code_hash:journal.code_hash});await archive.validate(journal);localJournalValidated=true;activeRequest.journal_validated=journal.pending===null;
}
async function init(){
 if(network==='testnet'){if(!fixedRpcUrl(network,url,env.PROOF_WORK_RPC_CHAIN_ID,codeHash))throw Error('Testnet requires an approved fixed RPC and pinned contract hash');}
 else if(network==='sandbox'){if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(url)||!env.PROOF_WORK_RPC_CHAIN_ID)throw Error('Sandbox requires numeric loopback and explicit chain ID');}
 else throw Error('Only testnet and explicit local sandbox are supported');
 if(!contract||!operator||!workerKey||!keyFile||!journalPath||!path.isAbsolute(journalPath))throw Error('Missing worker identity');
 const dir=await fs.lstat(path.dirname(journalPath));if(!dir.isDirectory()||(dir.mode&0o077)||dir.uid!==process.getuid())throw Error('Journal directory must be private');
 lockPath=journalPath+'.lock';const leaseName=journalPath+'.lease';
 if(env.PROOF_WORK_RPC_LEASE_FD!==undefined){
  if(!/^[0-9]+$/.test(env.PROOF_WORK_RPC_LEASE_FD))throw Error('Invalid RPC lease descriptor');
  const fd=Number(env.PROOF_WORK_RPC_LEASE_FD);if(!Number.isSafeInteger(fd)||fd<3)throw Error('Invalid RPC lease descriptor');
  const held=fsSync.fstatSync(fd),file=await fs.lstat(leaseName);
  if(!held.isFile()||!file.isFile()||file.isSymbolicLink()||(held.mode&0o077)||(file.mode&0o077)||held.uid!==process.getuid()||file.uid!==process.getuid()||held.dev!==file.dev||held.ino!==file.ino)throw Error('Invalid RPC lease file');
  try{await fs.lstat(lockPath);throw Error('Legacy RPC lock exists; inspect before recovery');}catch(e){if(e.code!=='ENOENT')throw e;}
 }else{
  // Compatibility for directly invoked Node bridges; never race a leased worker.
  await fs.mkdir(lockPath,{mode:0o700});lockOwned=true;
  try{await fs.lstat(leaseName);throw Error('RPC lease file exists; use the leased gateway');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const raw=JSON.parse(await privateRead(keyFile,4096));if(typeof raw.secret_key!=='string'||!/^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(raw.secret_key)||Object.keys(raw).some(x=>!['secret_key','account_id','public_key'].includes(x))||raw.account_id&&raw.account_id!==operator)throw Error('Invalid restricted key file');
 try{key=KeyPair.fromString(raw.secret_key);}catch{throw Error('Invalid restricted key file');}
 // Testnet pins permit local journal validation before any network request. An
 // unreadable/malformed/legacy pending journal can never prove no dispatch.
 if(network==='testnet')await loadLocalJournal('testnet',codeHash);
 rpcQueue=createRpcQueue(new providers.JsonRpcProvider({url},{retries:1}),{isPublic:network==='testnet'});provider=rpcQueue.provider;const status=await provider.status();if(status.chain_id!==(network==='testnet'?'testnet':env.PROOF_WORK_RPC_CHAIN_ID))throw Error('Unexpected RPC chain');
 const access=await provider.query({request_type:'view_access_key',account_id:operator,public_key:key.getPublicKey().toString(),finality:'final'});restricted(access);
 const info=await provider.query({request_type:'view_account',account_id:contract,finality:'final'});if(codeHash&&info.code_hash!==codeHash)throw Error('Contract code hash mismatch');actualCodeHash=info.code_hash;
 signer=await InMemorySigner.fromKeyPair(status.chain_id,operator,key);
 if(!journal)await loadLocalJournal(status.chain_id,info.code_hash);
 activeRequest.stage='local.archive';await archive.compact(journal);await save();
 const state=await snapshot();return {ready:true,state,pending:!!journal.pending};
}
async function finalize(out){verifySignedFinal(out,journal.pending,evidenceIdentity());return await commitFinalOutcome(journal,out,operator,contract,archive,save);}
async function reconcile(){return reconcileOnePending({j:journal,identity:evidenceIdentity(),transport:provider,wait:bounded,saveJournal:save,commit:finalize,diagnostics:()=>rpcDiagnostic(activeRequest)});}

async function run(req){
 const command=req.command;if(command==='reconcile')return {result:await reconcile()};
 if(command==='state')return {state:await snapshot(),pending:!!journal.pending};
 if(views.has(command)){let args={...req};delete args.command;delete args.idempotency_id;delete args.include_state;const value=await view(command,args);const name={company_state:'company',company_task:'task',company_list:'tasks',company_history:'history',company_tick_readiness:'readiness',company_solvency:'solvency',jobs_list:'jobs',order_quote:'quote',company_order_quote:'quote',ai_policy:'policy',ai_call:'call'}[command]||command;return {[name]:value};}
 const method=command==='company_archive_keeper'?'company_archive':command;if(!allowed.includes(method))throw Error('Unsupported restricted worker operation');
 if(journal.pending)throw Error('Pending transaction must be reconciled before another write');
 const schema=schemas[method],args={};for(const k of schema){if(req[k]===undefined)throw Error('Missing method argument');args[k]=req[k];}
 if(Object.keys(req).some(k=>!['command','idempotency_id','include_state',...schema,'retry_blocked'].includes(k)))throw Error('Unexpected method argument');
 if(Buffer.byteLength(JSON.stringify(args))>24000)throw Error('Request too large');
 const argsHash=sha(JSON.stringify(args)),previous=await archive.find(req.idempotency_id,method,argsHash);
 if(previous){if(previous.status==='failed'){throw failureWithReceipt('Previous request has a failed receipt; replay refused',previous.tx);}return {duplicate:true,tx:null,original_tx:previous.tx,state:await snapshot()};}
 const state=await snapshot();if(state.contract.frozen&&method!=='cancel'&&method!=='decline_order')throw Error('Company frozen');
 if(method==='company_run_mandate'){const m=await view('company_mandate',{id:args.id});if(m&&Number.isSafeInteger(args.expected_run)&&args.expected_run>=0&&args.expected_run<m.runs){const task=await view('company_task',{id:`cycle_${args.id}_${args.expected_run}_plan`});if(!task||task.mandate_id!==args.id)throw Error('Mandate history missing');return {duplicate:true,task,state,tx:null};}}
 if(method==='company_commit_plan'){const task=await view('company_task',{id:args.id});if(task&&['attested','archived'].includes(task.status)){if(task.mandate_role!=='plan'||task.selected_template!==args.choice||task.evidence_hash!==args.evidence_hash||task.encrypted_evidence!==args.encrypted_evidence)throw Error('Plan result conflict');return {duplicate:true,task,state,tx:null};}}
 if(method==='approve_order'){const t=await view('company_task',{id:args.id});if(t&&['queued','blocked','hired','attested','archived'].includes(t.status))return {duplicate:true,task:t,state,tx:null};}
 if(method==='company_tick') {const t=await view('company_task',{id:args.id});if(t&&['hired','awaiting_evidence','attested','archived'].includes(t.status))return {duplicate:true,task:t,state,tx:null};if(t?.status==='blocked'){if(req.retry_blocked!==true)return {blocked:true,task:t,state,tx:null};const ready=await view('company_tick_readiness',{id:args.id});if(ready.ready!==true)return {blocked:true,task:t,readiness:ready,state,tx:null};}}
 if(method==='company_attest') {const t=await view('company_task',{id:args.id});if(t&&['attested','archived'].includes(t.status)){if(t.evidence_hash!==args.evidence_hash||t.encrypted_evidence!==args.encrypted_evidence)throw Error('Evidence conflict');return {duplicate:true,task:t,state,tx:null};}}
 if(['settle','pay','cancel','decline_order'].includes(method)){const j=await view('job',{id:args.id});const done={settle:['settled','paying','paid'],pay:['paid'],cancel:['refunded'],decline_order:['refunded']};if(j&&done[method].includes(j.status))return {duplicate:true,state,tx:null};if(j&&['paying','refunding','cancelling'].includes(j.status))return {pending:true,state,tx:null};}
 if(method==='company_archive'){const t=await view('company_task',{id:args.id});if(t?.status==='archived')return {duplicate:true,state,tx:null};}
 if(method==='ai_reserve_call'){const a=await view('ai_call',{id:args.id});if(a){if(schema.some(k=>a[k]!==args[k]))throw Error('AI reservation conflict');return {duplicate:true,call:a,state,tx:null};}}
 if(method==='ai_reserve_media_call'){const a=await view('ai_media_call',{id:args.id});if(a){if(schema.some(k=>a[k]!==args[k]))throw Error('Media reservation conflict');return {duplicate:true,call:a,state,tx:null};}}
 if(method==='ai_complete_media_call'){const a=await view('ai_media_call',{id:args.id});if(a?.status==='completed'){if(a.output_hash!==args.output_hash)throw Error('Media output conflict');return {duplicate:true,call:a,state,tx:null};}}
 if(method==='ai_complete_call'){const a=await view('ai_call',{id:args.id});if(a?.status==='completed'){if(a.output_hash!==args.output_hash)throw Error('AI output conflict');return {duplicate:true,call:a,state,tx:null};}}
 await archive.compact(journal);await save();
 const access=await provider.query({request_type:'view_access_key',account_id:operator,public_key:key.getPublicKey().toString(),finality:'final'});
 restricted(access,method);
 const block=await provider.block({finality:'final'});const transaction=createTransaction(operator,key.getPublicKey(),contract,BigInt(access.nonce)+1n,[transactions.functionCall(method,args,gas,0n)],base_decode(block.header.hash));
 const signingChain=(await provider.status()).chain_id;beforeSigning(activeRequest);
 const [hash,signed]=await signTransaction(transaction,signer,operator,signingChain);const txHash=base_encode(hash);
 const pending={hash:txHash,method,id:args.id||null,args_hash:argsHash,request_id:req.idempotency_id};
 const result=await submitOneSigned({j:journal,pending,signed,identity:evidenceIdentity(),transport:provider,wait:bounded,saveJournal:save,commit:finalize,onPhase:phase=>signedPhase(activeRequest,phase),diagnostics:()=>rpcDiagnostic(activeRequest)}),tx=result.tx;
 if(result.status==='failed'){throw failureWithReceipt('Transaction receipt failed',tx);}return {tx,state:await snapshot()};
}
function errorFrame(c,error,base){
 const no_dispatch=localFailureReceipts.has(error)?null:noDispatchAssertion(c,journal),diagnostic=preflightDiagnostic(c,error);
 // Only failures created after validated archive/FINAL paths carry receipts.
 // An SDK exception's arbitrary tx/disposition properties confer no authority.
 return {...base,...(base.ok===false?{tx:localFailureReceipts.get(error)||null}:{}),error:'Restricted RPC operation refused',diagnostic,no_dispatch};
}
async function startupFrame(){
 activeRequest=newRequestContext('startup','startup',sha(JSON.stringify([network??null,url??null,contract??null,operator??null,codeHash??null,workerKey??null])),null);
 try{const result=await init();await rpcQueue?.drain();return result;}
 catch(error){stopRequest(activeRequest,error);await rpcQueue?.drain();throw error;}
}
async function commandFrame(line){let req;try{
  if(Buffer.byteLength(line)>32768)throw Error('Request too large');req=JSON.parse(line);
  const isWrite=[...allowed,'company_archive_keeper'].includes(req.command);
  activeRequest=newRequestContext(isWrite?'write':'read',req.idempotency_id||null,sha(line),isWrite?req.command:null);
  activeRequest.journal_validated=localJournalValidated&&journal.pending===null;
  const result=await run(req);await rpcQueue?.drain();return {id:req.idempotency_id||null,ok:true,...result};
 }catch(error){stopRequest(activeRequest,error);await rpcQueue?.drain();return errorFrame(activeRequest,error,{id:req?.idempotency_id||null,ok:false,tx:null});}
 finally{await rpcQueue?.drain();activeRequest=null;}
}
try{reply(await startupFrame());activeRequest=null;const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});for await(const line of rl)reply(await commandFrame(line));}
catch(error){stopRequest(activeRequest,error);await rpcQueue?.drain();reply(errorFrame(activeRequest,error,{ready:false}));process.exitCode=1;}
finally{if(lockOwned)await fs.rmdir(lockPath).catch(()=>{});}
