// Isolated outbox authority bridge. Fixed methods, zero deposits, finite receiver
// key, finalized transaction/receipt validation, durable ambiguous-tx journal.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {createRequire} from 'node:module';
import {FinalizedJournal} from './journal.mjs';
import {commitFinalOutcome} from './outcome.mjs';
const require=createRequire(new URL('./package.json',import.meta.url));
const {KeyPair,providers,transactions}=require('near-api-js');
const {InMemorySigner}=require('@near-js/signers');
const {createTransaction,signTransaction}=require('@near-js/transactions');
const {baseDecode,baseEncode}=require('@near-js/utils');
const fetchOriginal=globalThis.fetch;
globalThis.fetch=(url,opts={})=>fetchOriginal(url,{...opts,redirect:'error',signal:AbortSignal.timeout(12000)});
const methods={claim:['id','intent_hash','source_hash','worker_hash','worker_key_id','profile_hash'],reserve_request:['id','intent_hash','kind','request_id','request_hash','live'],record_receipt:['id','intent_hash','receipt']};
const reply=v=>process.stdout.write(JSON.stringify(v)+'\n');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
let c,provider,key,signer,journal,archive,operationStage='startup';
async function privateRead(p,max=131072){if(!path.isAbsolute(p)||await fs.realpath(path.dirname(p))!==path.dirname(p))throw Error('Private absolute file required');const dir=await fs.lstat(path.dirname(p));if(!dir.isDirectory()||(dir.mode&0o077)||dir.uid!==process.getuid())throw Error('Private parent required');const h=await fs.open(p,fsSync.constants.O_RDONLY|fsSync.constants.O_NOFOLLOW);try{const s=await h.stat();if(!s.isFile()||(s.mode&0o077)||s.uid!==process.getuid()||s.size>max)throw Error('Unsafe private file');return await h.readFile('utf8');}finally{await h.close();}}
async function save(value=journal){const temp=c.journal+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';const h=await fs.open(temp,'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}await fs.rename(temp,c.journal);const d=await fs.open(path.dirname(c.journal),'r');try{await d.sync();}finally{await d.close();}}
async function view(method,args={}){const r=await provider.query({request_type:'call_function',account_id:c.contract_id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),finality:'final'});return JSON.parse(Buffer.from(r.result).toString());}
function restricted(a,method){const f=a.permission?.FunctionCall;if(!f||f.receiver_id!==c.contract_id||!Array.isArray(f.method_names)||f.method_names.length!==3||!Object.keys(methods).every(x=>f.method_names.includes(x))||f.allowance===null||BigInt(f.allowance)<=0n||method&&!f.method_names.includes(method))throw Error('Exact finite receiver-scoped outbox key required');}
async function snapshot(id){const block=await provider.block({finality:'final'});const q={block_id:block.header.hash};const call=async(method,args={})=>{const r=await provider.query({request_type:'call_function',account_id:c.contract_id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),...q});return JSON.parse(Buffer.from(r.result).toString());};const [s,r,info]=await Promise.all([call('state'),call('intent',{id}),provider.query({request_type:'view_account',account_id:c.contract_id,...q})]);if(info.code_hash!==c.expected_code_hash||s.contract_code_hash!==c.expected_code_hash||s.operator!==c.operator_id||s.operator_key_hex!==Buffer.concat([Buffer.from([0]),Buffer.from(key.getPublicKey().data)]).toString('hex'))throw Error('Exact outbox code/operator pin required');return {finality:'final',block_hash:block.header.hash,code_hash:info.code_hash,state:s,intent:r,network:c.network,contract_id:c.contract_id};}
async function finalize(out){return await commitFinalOutcome(journal,out,c.operator_id,c.contract_id,archive,save);}
async function init(v){if(!exact(v,['config','lease_fd'])||!exact(v.config,['network','rpc_url','chain_id','contract_id','operator_id','operator_key_file','journal','expected_code_hash']))throw Error('Exact authority configuration required');c=v.config;
 if(c.network==='sandbox'){if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(c.rpc_url)||typeof c.chain_id!=='string'||!c.chain_id)throw Error('Numeric sandbox and exact chain required');}
 else if(c.network==='mainnet'||c.network==='testnet'){if(c.rpc_url!==`https://rpc.${c.network}.near.org`||c.chain_id!==c.network)throw Error('Fixed official NEAR RPC required');}else throw Error('Unsupported network');
 const held=fsSync.fstatSync(v.lease_fd),lease=await fs.lstat(c.journal+'.lease');if(!held.isFile()||!lease.isFile()||lease.isSymbolicLink()||held.ino!==lease.ino||held.dev!==lease.dev||(held.mode&0o077)||held.uid!==process.getuid())throw Error('Held private bridge lease required');
 const raw=JSON.parse(await privateRead(c.operator_key_file,4096));if(!exact(raw,['account_id','secret_key'])||raw.account_id!==c.operator_id)throw Error('Restricted operator key file required');key=KeyPair.fromString(raw.secret_key);provider=new providers.JsonRpcProvider({url:c.rpc_url},{retries:1});const status=await provider.status();if(status.chain_id!==c.chain_id)throw Error('Wrong NEAR chain');
 restricted(await provider.query({request_type:'view_access_key',account_id:c.operator_id,public_key:key.getPublicKey().toString(),finality:'final'}));signer=await InMemorySigner.fromKeyPair(c.chain_id,c.operator_id,key);
 try{journal=JSON.parse(await privateRead(c.journal));if(journal.version!==1||journal.chain!==c.chain_id||journal.contract!==c.contract_id||journal.operator!==c.operator_id||journal.key!==key.getPublicKey().toString()||journal.code_hash!==c.expected_code_hash)throw Error('Bridge journal identity conflict');}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,chain:c.chain_id,contract:c.contract_id,operator:c.operator_id,key:key.getPublicKey().toString(),code_hash:c.expected_code_hash,pending:null,history:[]};await save();}
 archive=new FinalizedJournal(c.journal,{chain:journal.chain,contract:journal.contract,operator:journal.operator,key:journal.key,code_hash:journal.code_hash});await archive.validate(journal);
 if(journal.pending){let out;try{out=await provider.txStatus(journal.pending.hash,c.operator_id,'FINAL');}catch{throw Error('Pending NEAR transaction remains unknown; no provider request allowed');}await finalize(out);}
 return {ready:true};
}
async function run(v){operationStage='validate';if(!exact(v,['method','args']))throw Error('Exact bridge command required');if(v.method==='snapshot'){if(!exact(v.args,['id']))throw Error('Exact snapshot ID required');return {snapshot:await snapshot(v.args.id)};}
 if(!methods[v.method]||!exact(v.args,methods[v.method])||Buffer.byteLength(JSON.stringify(v.args))>16384)throw Error('Fixed zero-deposit outbox operation required');if(journal.pending)throw Error('Unknown NEAR write blocks provider work');await snapshot(v.args.id);
 const argsHash=sha(JSON.stringify(v.args)),requestId=sha(JSON.stringify([v.method,v.args]));const prior=await archive.find(requestId,v.method,argsHash);
 if(prior){if(prior.status!=='final')throw Error('Prior NEAR operation failed');const snap=await snapshot(v.args.id);if(v.method==='reserve_request')return {value:{duplicate:true,network_authorized:false,request_hash:v.args.request_hash},snapshot:snap,finality:'final'};return {value:{duplicate:true,intent:snap.intent,status:snap.intent?.status},snapshot:snap,finality:'final'};}
 const access=await provider.query({request_type:'view_access_key',account_id:c.operator_id,public_key:key.getPublicKey().toString(),finality:'final'});restricted(access,v.method);const b=await provider.block({finality:'final'});const tx=createTransaction(c.operator_id,key.getPublicKey(),c.contract_id,BigInt(access.nonce)+1n,[transactions.functionCall(v.method,v.args,100000000000000n,0n)],baseDecode(b.header.hash));const [hash,signed]=await signTransaction(tx,signer,c.operator_id,c.chain_id);journal.pending={hash:baseEncode(hash),method:v.method,id:v.args.id,args_hash:argsHash,request_id:requestId};await save();
 let out;try{operationStage='broadcast';await provider.sendTransaction(signed);operationStage='final_status';out=await provider.txStatus(baseEncode(hash),c.operator_id,'FINAL');}catch(e){const failure=Error('NEAR transaction outcome unknown; no provider request allowed');failure.cause_type=e.type||e.name;throw failure;}operationStage='finalize';const result=await finalize(out);if(result.status!=='final')throw Error('NEAR transaction or receipt failed');
 const raw=out.status?.SuccessValue;let value;try{value=JSON.parse(Buffer.from(raw,'base64').toString());}catch{throw Error('Exact NEAR return value required');}return {value,tx:result.tx,finality:'final'};
}
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});let initialized=false;
try{for await(const line of lines){try{if(Buffer.byteLength(line)>32768)throw Error('Bridge line too large');const v=JSON.parse(line);if(!initialized){reply(await init(v));initialized=true;}else reply({ok:true,...await run(v)});}catch(e){reply(initialized?{ok:false,error:'Restricted NEAR authority failed closed',stage:operationStage,error_type:/^[A-Za-z_]{1,64}$/.test(e.cause_type||e.type||e.name||'')?(e.cause_type||e.type||e.name):'Unknown'}:{ready:false,error:'Restricted NEAR authority refused startup'});if(!initialized){process.exitCode=1;break;}}}}catch{process.exitCode=1;}
