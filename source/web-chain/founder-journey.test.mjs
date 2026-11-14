import {readFile} from 'node:fs/promises';
import {createFounderJourneyUI} from './src/founder-journey-ui.js';
import {createFounderPublicationUI} from './src/founder-publication-ui.js';
import {canonicalFactory} from './src/company-factory-client.js';
import {founderNightlyModule,nightlyBrowserHint,FOUNDER_CONNECTION,readFounderConnection,rememberFounderConnection,forgetFounderConnection,shouldRestoreFounderConnection,createFounderWalletConnection} from './src/founder-wallet-connectors.js';
import {setupNightly} from '@near-wallet-selector/nightly';
import {setupWalletSelector} from '@near-wallet-selector/core';
import {inspectWalletCandidate,refreshAfterKnownFinal} from './src/founder-reconcile.js';
import {validateBusinessOutcome,intentFingerprint} from './src/business-actions.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {validateFounderConfig,founderSlug,founderAccount,founderBudget,prepareFounderSetup,validateFounderSetupTransaction,
  setupPending,validateFounderPending,validateFounderService,founderWorkerReadiness,founderTaskPresentation,founderWorkspaceURL,
  founderAIPolicy,ownedFounderRecords,recoverFounderBrief,founderServiceTiming} from './src/founder-journey-core.js';
import {publicKeyId,decrypt,digest} from './src/crypto.js';
import {validatePublicSiteContent,validatePublicSite,publicationIntent,validatePublicationOutcome} from './src/founder-publication.js';
import {createFounderClient} from './src/founder-journey-client.js';
import {originalSignerPublicKey,FACTORY_CUSTODY_ACK,FACTORY_GAS} from './src/company-factory-actions.js';
import {reserveMyNearWalletPopup,founderWalletLeaseKey} from './src/wallet-popup.js';
import {assertFounderFinalQuery,checkFounderNetwork,FOUNDER_TESTNET_GENESIS,createFounderRPC,createFounderReadFlight,FounderAccountMissing} from './src/founder-rpc.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
let config,prepared;
const originalFetch=globalThis.fetch;let unexpectedNetworkAttempts=0;
before(()=>{globalThis.fetch=async()=>{unexpectedNetworkAttempts++;throw Error('External network is forbidden in offline founder tests');};});
after(()=>{globalThis.fetch=originalFetch;assert.equal(unexpectedNetworkAttempts,0,'Offline tests must not attempt external network requests');});
const H='1'.repeat(44),R='2'.repeat(44),B='3'.repeat(44),owner='owner.testnet',company='harbor.factory.testnet';
before(async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const raw=Buffer.from(await crypto.subtle.exportKey('spki',pair.publicKey)).toString('base64');
  const pem='-----BEGIN PUBLIC KEY-----\n'+raw.match(/.{1,64}/g).join('\n')+'\n-----END PUBLIC KEY-----\n';
  config={schema:1,network:'testnet',deployment_status:'finalized',factory_id:'factory.testnet',factory_code_hash:H,
    company_code_hash:'5nPd4tqK33eJZqgkoX8s8m4Fefm2UyrAy1oMxKpbUs4K',company_template_sha256:'470f7674ad709b295459c031f9d6b4f8b929d45b7edafbf13289c22fc0510a80',
    worker_public_key:pem,worker_key_id:await publicKeyId(pem),operator_id:'operator.testnet',supplier_id:'operator.testnet',execution_backend:'local_gemma_mock',cloud_billing_verified:false,tee_verified:false};
  prepared=await prepareFounderSetup({companyId:company,owner,config,name:'Harbor Studio',goal:'Create a clear website for our independent design service.',storageByteCost:'10000000000000000000',storageFundingId:'starter_fixture'});
});

// Protects the public release/config boundary. This is synthetic offline evidence,
// not a live factory, wallet or model acceptance run.
test('founder setup requires finalized testnet pins and the actual RSA public-key fingerprint',async()=>{
  assert.equal((await validateFounderConfig(config)).network,'testnet');
  for(const change of [{deployment_status:'prepared'},{network:'mainnet'},{worker_key_id:'a'.repeat(64)},
    {factory_id:'factory.near'},{execution_backend:'near_ai_cloud'},{cloud_billing_verified:true},{record_key:'not-public'}]){
    await assert.rejects(validateFounderConfig({...config,...change}));
  }
});
test('named and implicit testnet wallets are accepted without accepting .near accounts or URL strings',()=>{
  assert.equal(founderAccount(owner),owner);assert.equal(founderAccount('a'.repeat(64)),'a'.repeat(64));
  for(const value of ['owner.near','https://owner.testnet','owner.testnet/path','a'.repeat(65)])assert.throws(()=>founderAccount(value));
  assert.equal(founderSlug('Harbor Design Studio','factory.testnet'),'harbor-design-studio');
  assert.equal(founderSlug('3D Studio','factory.testnet'),'business-3d-studio');assert.equal(founderSlug('東京','factory.testnet'),'business');
});
test('funding distinguishes the factory deposit, permanent task storage and labelled gas headroom',()=>{
  const result=founderBudget({total:'9050040000000000000000000'},'10000000000000000000',{amount:'10000000000000000000000000',storage_usage:0});
  assert.equal(result.setup,'1310720000000000000000000');assert.equal(result.recommended,'10960760000000000000000000');
  assert.equal(result.shortfall,'960760000000000000000000');assert.equal(result.gasHeadroom,'600000000000000000000000');
});
test('bootstrap encrypts mission text and funds exactly two task records without a wallet key or business cash transfer',async()=>{
  const calls=prepared.transaction.actions.map(x=>x.params);
  assert.deepEqual(calls.map(x=>x.methodName),['company_set','company_fund_storage','set_execution_profile','ai_set_policy']);
  assert.equal(calls[0].args.public_idea,'');assert.equal(calls[0].args.public_goal,'');
  assert.equal(await decrypt(calls[0].args.encrypted_idea,prepared.recovery.record_key,calls[0].args.idea_hash),'Harbor Studio');
  assert.equal(calls[1].args.blocks,1);assert.equal(calls[0].deposit,calls[1].deposit);
  assert.equal(Buffer.from(calls[2].args.mission_sealed_key,'base64').length,512);
  assert.deepEqual(calls[3].args,founderAIPolicy());
  assert.ok(!JSON.stringify(prepared.transaction).includes(prepared.recovery.record_key));
  await validateFounderSetupTransaction(prepared.transaction,{owner,companyId:company,config,storageByteCost:'10000000000000000000'});
});
test('bootstrap refuses a changed signer, deposit, worker, plaintext mission or expanded policy before signing',async()=>{
  for(const mutate of [t=>t.signerId='other.testnet',t=>t.actions[0].params.deposit='1',
    t=>t.actions[2].params.args.worker_key_id='b'.repeat(64),t=>t.actions[0].params.args.public_idea='public by accident',
    t=>t.actions[3].params.args.max_calls_per_day=4,t=>t.actions[1]={type:'Transfer',params:{deposit:'1'}}]){
    const value=structuredClone(prepared.transaction);mutate(value);
    await assert.rejects(validateFounderSetupTransaction(value,{owner,companyId:company,config,storageByteCost:'10000000000000000000'}));
  }
});
test('saved setup is bound to owner, company and immutable bytes while its returned transaction hash can be filled',async()=>{
  const saved=await setupPending(prepared.transaction,config.company_code_hash,{hash:B,height:10});
  await validateFounderPending(saved,config,owner);saved.tx_hash=H;await validateFounderPending(saved,config,owner);
  assert.ok(!JSON.stringify(saved).includes(prepared.recovery.record_key));
  await assert.rejects(validateFounderPending({...saved,account:'other.testnet'},config,owner));
  const changed=structuredClone(saved);changed.transaction.actions[3].params.args.lifetime_nanos='999999999';
  await assert.rejects(validateFounderPending(changed,config,owner));
});
function service(change={}){return {schema:'near-founder-worker-service-v1',operator_id:config.operator_id,worker_public_key:config.worker_public_key,
  worker_key_id:config.worker_key_id,model:'gemma4:e2b-it-q4_K_M',model_digest:'b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2',
  execution_backend:'local_gemma_mock',cloud_billing_verified:false,tee_verified:false,service_expires_at:'100000',heartbeat_at:'990',heartbeat_expires_at:'1590',observed_at:'1000',online:true,max_companies:8,max_reservations_per_company:2,max_reservations_global:16,...change};}
const grant=()=>({keys:[{public_key:'ed25519:'+'1'.repeat(32),access_key:{permission:{FunctionCall:{receiver_id:company,allowance:'1000000000000000000000000',method_names:['company_tick','ai_reserve_call','ai_complete_call','company_attest','company_archive']}}}}]});
test('availability requires matching pinned service identity and an unexpired heartbeat bounded to ten minutes',()=>{
  assert.equal(validateFounderService(service(),config).online,true);
  for(const change of [{online:false},{observed_at:'1590'},{heartbeat_expires_at:'1591'},{model_digest:'a'.repeat(64)},
    {operator_id:'other.testnet'},{max_reservations_global:17},{heartbeat_at:'1001'}])assert.throws(()=>validateFounderService(service(change),config));
});
test('a global heartbeat cannot replace this company’s exact restricted signing permission',()=>{
  assert.equal(founderWorkerReadiness(service(),grant(),config,company).ready,true);
  for(const mutate of [g=>g.keys[0].access_key.permission='FullAccess',g=>g.keys[0].access_key.permission.FunctionCall.receiver_id='other.factory.testnet',
    g=>g.keys[0].access_key.permission.FunctionCall.method_names.push('transfer'),g=>g.keys[0].access_key.permission.FunctionCall.allowance=null,
    g=>g.keys[0].access_key.permission.FunctionCall.allowance='199999999999999999999999']){
    const g=grant();mutate(g);assert.throws(()=>founderWorkerReadiness(service(),g,config,company));
  }
});
test('delayed, blocked and offline tasks stay distinct from completed delivery without suggesting a duplicate',()=>{
  assert.equal(founderTaskPresentation({status:'awaiting_evidence'},{startedAt:0,now:120000,workerReady:true}).tone,'attention');
  assert.match(founderTaskPresentation({status:'queued'},{workerReady:false}).body,/not resubmit/);
  assert.equal(founderTaskPresentation({status:'blocked'},{workerReady:true}).title,'This task needs attention');
  assert.equal(founderTaskPresentation({status:'archived',evidence_hash:'a'.repeat(64)}).tone,'success');
  assert.notEqual(founderTaskPresentation({status:'archived',evidence_hash:''}).tone,'success');
});
test('workspace handoff contains only the public factory request id',()=>{
  const url=founderWorkspaceURL(config,'company_fixture','https://example.com/project/app/founder.html');
  assert.equal(url.href,'https://example.com/project/app/business.html?founder=company_fixture');
  assert.throws(()=>founderWorkspaceURL(config,'https://evil.test','https://example.com/project/app/founder.html'));
});
const content=()=>({title:'Harbor Studio',summary:'Independent design for small teams.',items:[{text:'We help teams explain their services clearly.'}]});
test('public content refuses markup, URLs and the project’s own recovery-key marker',()=>{
  assert.deepEqual(validatePublicSiteContent(content()),content());
  for(const unsafe of ['<script>alert(1)</script>','https://example.com','www.example.com','javascript:alert(1)',
    'ed25519:public-or-private','{"record_key":"do-not-publish"}','{"secret_key":"do-not-publish"}','seed phrase: do not publish','Private key: do not publish','private_key=do-not-publish']){
    const value=content();value.items[0].text=unsafe;assert.throws(()=>validatePublicSiteContent(value));
  }
  assert.throws(()=>validatePublicSiteContent({...content(),items:[{text:'🙂'.repeat(1900)},{text:'🙂'.repeat(1900)}]}));
});
test('first publication funds exact storage; updates and unpublishing are owner-bound CAS actions',()=>{
  const first=publicationIntent({config,recordId:'company_fixture',companyId:company,owner,site:null,storageByteCost:'10000000000000000000',content:content()});
  assert.equal(first.deposit,'163840000000000000000000');assert.equal(first.args.expected_version,0);
  const site={id:'company_fixture',company_id:company,owner_id:owner,revision:2,status:'published'};
  const update=publicationIntent({config,recordId:site.id,companyId:company,owner,site,storageByteCost:'10000000000000000000',content:content()});
  assert.equal(update.deposit,'0');assert.equal(update.args.expected_version,2);
  const remove=publicationIntent({config,recordId:site.id,companyId:company,owner,site,storageByteCost:'10000000000000000000',unpublish:true});
  assert.equal(remove.method,'unpublish_site');assert.equal(remove.deposit,'0');assert.deepEqual(Object.keys(remove.args),['id','expected_version']);
  assert.throws(()=>publicationIntent({config,recordId:site.id,companyId:company,owner:'other.testnet',site,storageByteCost:'10000000000000000000',content:content()}));
});
test('public site verifies owner/company/content commitment and respects unpublished null content',async()=>{
  const site={schema:'near-founder-site-v1',id:'company_fixture',company_id:company,owner_id:owner,revision:1,status:'published',content:content(),content_sha256:await digest(JSON.stringify(content())),created_at:'1',updated_at:'1',storage_deposit:'163840000000000000000000'};
  assert.equal(await validatePublicSite(site,{id:site.id,companyId:company,owner}),site);
  await assert.rejects(validatePublicSite({...site,content_sha256:'a'.repeat(64)},{id:site.id,companyId:company,owner}));
  await assert.rejects(validatePublicSite({...site,owner_id:'other.testnet'},{id:site.id,companyId:company,owner}));
  assert.equal((await validatePublicSite({...site,status:'unpublished',content:null},{id:site.id,companyId:company,owner})).content,null);
});
function publicationFinalReceipt(intent,blockHash=B){
  const raw={method_name:intent.method,args:Buffer.from(JSON.stringify(intent.args)).toString('base64'),deposit:intent.deposit,gas:intent.gas};
  return {final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash:H,signer_id:owner,receiver_id:config.factory_id,actions:[{FunctionCall:raw}]},transaction_outcome:{id:H,block_hash:blockHash,outcome:{executor_id:owner,receipt_ids:[R],status:{SuccessReceiptId:R},gas_burnt:1,tokens_burnt:'10'}},receipts_outcome:[{id:R,outcome:{executor_id:config.factory_id,receipt_ids:[],status:{SuccessValue:''},gas_burnt:1,tokens_burnt:'20'}}]};
}
test('publication FINAL receipt must match every approved argument and include its complete receipt graph',()=>{
  const intent=publicationIntent({config,recordId:'company_fixture',companyId:company,owner,site:null,storageByteCost:'10000000000000000000',content:content()});
  const saved={intent,tx_hash:H,started_height:10},out=publicationFinalReceipt(intent);
  assert.equal(validatePublicationOutcome(out,saved,{hash:B,height:11}).status,'final');
  for(const mutate of [o=>o.transaction.actions[0].FunctionCall.deposit='0',o=>o.transaction.signer_id='other.testnet',o=>o.receipts_outcome=[],o=>o.final_execution_status='EXECUTED']){
    const value=structuredClone(out);mutate(value);assert.throws(()=>validatePublicationOutcome(value,saved,{hash:B,height:11}));
  }
});

function memoryStorage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),get length(){return values.size;},key:i=>[...values.keys()][i]??null,values};}
function factoryRpc(){
  const storage='10000000000000000000',key=originalSignerPublicKey('00'+'a1'.repeat(32));
  const encode=v=>({result:[...new TextEncoder().encode(JSON.stringify(v))],block_hash:B,block_height:10});
  return {checkNetwork:async()=>{},finalBlock:async()=>({hash:B,height:10}),async request(method,args){
    if(method==='status')return {chain_id:'testnet',genesis_hash:FOUNDER_TESTNET_GENESIS,sync_info:{syncing:false}};
    if(method==='EXPERIMENTAL_protocol_config')return {runtime_config:{storage_amount_per_byte:storage}};
    assert.equal(method,'query');
    if(args.request_type==='view_account')return args.account_id===config.factory_id?{code_hash:config.factory_code_hash,block_hash:B,block_height:10}:{amount:'12000000000000000000000000',storage_usage:0,block_hash:B,block_height:10};
    if(args.request_type==='view_access_key_list')return {keys:[{public_key:key,access_key:{permission:'FullAccess'}}],block_hash:B,block_height:10};
    const input=JSON.parse(Buffer.from(args.args_base64,'base64').toString());
    if(args.method_name==='template')return encode({schema:'near-company-factory-v1',sha256:config.company_template_sha256,bytes:634668,full_access_custody_ack:FACTORY_CUSTODY_ACK,create_gas:FACTORY_GAS.create,init_method:'init'});
    if(args.method_name==='state')return encode({frozen:false,count:0,max_records:128});
    if(args.method_name==='worker_service')return encode(service());
    if(args.method_name==='quote'){
      const recordStorage=String(8192n*BigInt(storage)),backing=String((634668n+262144n)*BigInt(storage)),child=input.label+'.'+config.factory_id;
      const requestHash=await digest(JSON.stringify(['near-company-factory-v1',config.factory_id,input.id,input.creator,child,input.owner_key_hex,config.company_template_sha256,634668,['operator','supplier','price','fee','reserve','perJob','daily'].map(k=>input.config[k]),recordStorage,backing]));
      return encode({id:input.id,creator:input.creator,child,owner_key_hex:input.owner_key_hex,config:input.config,request_hash:requestHash,template_sha256:config.company_template_sha256,storage:recordStorage,backing,total:String(BigInt(recordStorage)+BigInt(backing)),storage_byte_cost:storage,available:true,storage_refundable:false,backing_purpose:'initial_child_account_and_contract_storage_not_business_cash'});
    }
    throw Error('Unexpected synthetic RPC method '+args.method_name);
  }};
}
test('wallet owner changes during asynchronous wallet acquisition refuse dispatch and clear only a proven pre-dispatch intent',async()=>{
  const oldNavigator=globalThis.navigator,oldLocation=globalThis.location;
  Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key,_options,callback)=>callback({name:'synthetic-lock'})}},configurable:true});
  globalThis.location={href:'https://example.com/project/app/founder.html'};
  let account=owner,release,entered,signs=0;const enteredPromise=new Promise(r=>entered=r),walletPromise=new Promise(r=>release=r);
  const selector={wallet:async()=>{entered();return walletPromise;}},storage=memoryStorage();
  const client=createFounderClient({config,getWalletState:()=>({selector,account}),rpc:factoryRpc(),storage});
  try{
    const quote=await client.quote({name:'Harbor',requestId:'company_async_owner'});const result=client.create(quote,true);
    await enteredPromise;account='other.testnet';client.invalidate();release({getAccounts:async()=>[{accountId:owner}],signAndSendTransaction:async()=>{signs++;}});
    await assert.rejects(result,/wallet changed/i);assert.equal(signs,0);assert.equal(storage.values.size,0);
  }finally{Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});
test('a thrown wallet request after dispatch stays unresolved and never authorizes an automatic replacement',async()=>{
  const oldNavigator=globalThis.navigator,oldLocation=globalThis.location;
  Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key,_options,callback)=>callback({name:'synthetic-lock'})}},configurable:true});
  globalThis.location={href:'https://example.com/project/app/founder.html'};
  let signs=0;const selector={wallet:async()=>({getAccounts:async()=>[{accountId:owner}],signAndSendTransaction:async()=>{signs++;throw Error('Synthetic wallet closed after request invocation');}})},storage=memoryStorage();
  const client=createFounderClient({config,getWalletState:()=>({selector,account:owner}),rpc:factoryRpc(),storage});
  try{
    const quote=await client.quote({name:'Harbor',requestId:'company_unknown_owner'});await assert.rejects(client.create(quote,true),/wallet closed/);
    const saved=await client.savedPending();assert.equal(saved.kind,'create');assert.equal(saved.pending.tx_hash,null);
    const before=JSON.stringify(saved);await assert.rejects(client.create(quote,true),/saved wallet action/);
    assert.equal(signs,1);assert.equal(JSON.stringify(await client.savedPending()),before);
  }finally{Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});
test('MyNearWallet popup reservation is synchronous, preserves the named wallet window and closes only a still-blank window',()=>{
  let closed=0,opened=null;
  const popup={closed:false,document:{documentElement:{dataset:{}},body:{}},location:{href:'about:blank'},close(){closed++;this.closed=true;}};
  const selector={store:{getState:()=>({selectedWalletId:'my-near-wallet'})}};
  const reservation=reserveMyNearWalletPopup(selector,{open(...args){opened=args;return popup;}});
  assert.deepEqual(opened.slice(0,2),['','MyNearWallet']);reservation.assertOpen();
  popup.location.href='https://testnet.mynearwallet.com/sign';reservation.closeIfBlank();assert.equal(closed,0);
  popup.location.href='about:blank';reservation.closeIfBlank();assert.equal(closed,1);
  assert.throws(()=>reservation.assertOpen(),/closed before signing/);
});
test('a blocked wallet popup refuses before dispatch and another wallet adapter does not open a window',()=>{
  const selector={store:{getState:()=>({selectedWalletId:'my-near-wallet'})}};
  assert.throws(()=>reserveMyNearWalletPopup(selector,{open:()=>null}),/No wallet request was sent/);
  let opened=0;assert.equal(reserveMyNearWalletPopup({store:{getState:()=>({selectedWalletId:'independent-proof-adapter'})}},{open(){opened++;}}),null);assert.equal(opened,0);
});
test('guided reads reject a wrong FINAL block even when the response contains otherwise valid identity data',()=>{
  assert.equal(assertFounderFinalQuery({block_hash:B,block_height:10,code_hash:H},{hash:B,height:10}).code_hash,H);
  for(const change of [{block_hash:H},{block_height:9},{block_height:'10'},{block_hash:undefined}])assert.throws(()=>assertFounderFinalQuery({block_hash:B,block_height:10,...change},{hash:B,height:10}),/outside.*FINAL/);
});
test('guided reads require the fixed synchronized testnet genesis before provisioning or publication',async()=>{
  const correct={chain_id:'testnet',genesis_hash:FOUNDER_TESTNET_GENESIS,sync_info:{syncing:false}};
  assert.equal((await checkFounderNetwork({request:async()=>correct})).chain_id,'testnet');
  for(const change of [{chain_id:'mainnet'},{genesis_hash:H},{sync_info:{syncing:true}},{sync_info:{}}])await assert.rejects(checkFounderNetwork({request:async()=>({...correct,...change})}));
});
test('known backing refund review works after service expiry, factory freeze and owner-key rotation',async()=>{
  const base=factoryRpc(),storage=memoryStorage();let queriedService=false,queriedOwnerKeys=false;
  const record={id:'company_original_refund',creator:owner,child:company,template_sha256:config.company_template_sha256,owner_key_hex:'00'+'a1'.repeat(32),request_hash:'b'.repeat(64),phase:'create_failed',create_attempt:1,refund_attempt:0,refund_ready:true,backing:'8968120000000000000000000',storage:'81920000000000000000000'};
  const rpc={...base,async request(method,args){
    if(method==='query'&&args.request_type==='view_access_key_list'&&args.account_id===owner){queriedOwnerKeys=true;throw Error('Rotated owner keys must not block a refund');}
    if(method==='query'&&args.request_type==='call_function'){
      if(args.method_name==='worker_service'){queriedService=true;throw Error('Offline worker must not block a refund');}
      if(args.method_name==='record')return {result:[...new TextEncoder().encode(JSON.stringify(record))],block_hash:B,block_height:10};
      if(args.method_name==='state')return {result:[...new TextEncoder().encode(JSON.stringify({frozen:true,count:1,max_records:128}))],block_hash:B,block_height:10};
    }
    return base.request(method,args);
  }};
  const selector={wallet:async()=>{throw Error('Review does not sign');}};
  const client=createFounderClient({config,getWalletState:()=>({selector,account:owner}),storage,rpc});
  const review=await client.reviewRefund(record.id);assert.equal(review.action.method,'claim_refund');assert.equal(review.action.deposit,'0');assert.equal(review.action.review.recipient,owner);
  assert.equal(queriedService,false);assert.equal(queriedOwnerKeys,false);assert.equal(storage.values.size,0);
});

test('fresh-browser company discovery requires the complete bounded registry and keeps ownership separate',()=>{
  const record={id:'company_existing',creator:owner,child:company,template_sha256:config.company_template_sha256,phase:'active'};
  const other={...record,id:'company_other',creator:'other.testnet',child:'other.factory.testnet'};
  assert.deepEqual(ownedFounderRecords({records:[record,other],total:2},config,owner),[record]);
  for(const page of [{records:[record],total:2},{records:[record,record],total:2},{records:[{...record,child:'outside.testnet'}],total:1},{records:[],total:9}])assert.throws(()=>ownedFounderRecords(page,config,owner));
});
test('private mission recovery binds actual owner, company and both encrypted on-chain hashes before opening',async()=>{
  const companyState=prepared.transaction.actions[0].params.args,context={owner,companyId:company,company:companyState};
  assert.equal((await recoverFounderBrief(prepared.recovery,context)).name,'Harbor Studio');
  for(const change of [{owner:'other.testnet'},{company_id:'other.factory.testnet'},{idea_hash:'0'.repeat(64)},{record_key:'a'.repeat(43)},{extra:'untrusted'}])await assert.rejects(recoverFounderBrief({...prepared.recovery,...change},context));
  assert.ok(!JSON.stringify(await recoverFounderBrief(prepared.recovery,context)).includes(prepared.recovery.record_key));
});
test('worker timing shows the finite UTC lease and actual age without claiming instant availability',()=>{
  assert.match(founderServiceTiming(service()),/1970-01-02 03:46:40 UTC/);assert.match(founderServiceTiming(service()),/10 seconds/);
  assert.match(founderServiceTiming(service({heartbeat_at:'0'})),/No worker heartbeat/);
});
test('a second tab cannot take or close the first blank wallet reservation',()=>{
  let closes=0;const popup={closed:false,document:{documentElement:{dataset:{}},body:{}},location:{href:'about:blank'},close(){closes++;this.closed=true;}},selector={store:{getState:()=>({selectedWalletId:'my-near-wallet'})}},window={open:()=>popup};
  const first=reserveMyNearWalletPopup(selector,window);assert.throws(()=>reserveMyNearWalletPopup(selector,window),/Another wallet approval/);assert.equal(closes,0);first.assertOpen();first.closeIfBlank();assert.equal(closes,1);
  assert.equal(founderWalletLeaseKey(owner),'business-is-near-wallet-v1:'+owner);
});

function rpcResponse(options,{status=200,result={ok:true},error=null,raw=null}={}){const wire=JSON.parse(options.body);return {ok:status>=200&&status<300,status,text:async()=>raw??JSON.stringify({jsonrpc:'2.0',id:wire.id,...(error?{error}:{result})})};}
function virtualClock(){let time=0;return {now:()=>time,delay:async ms=>{time+=ms;}};}
test('founder RPC serializes complete read responses and spaces starts while preserving exact FINAL arguments',async()=>{
  const clock=virtualClock(),seen=[];let active=0,maxActive=0;
  const rpc=createFounderRPC({...clock,fetcher:async(url,options)=>{active++;maxActive=Math.max(maxActive,active);seen.push({url,options,at:clock.now()});const response=rpcResponse(options);return {...response,text:async()=>{await Promise.resolve();active--;return response.text();}};}});
  const params={request_type:'view_account',account_id:company,block_id:B};
  const first=rpc.request('query',params);params.block_id=H;
  await Promise.all([first,rpc.request('status',[]),rpc.request('block',{block_id:B})]);
  assert.equal(maxActive,1);assert.deepEqual(seen.map(x=>x.at),[0,500,1000]);
  assert.equal(JSON.parse(seen[0].options.body).params.block_id,B);
  assert.ok(seen.every(x=>x.url==='https://test.rpc.fastnear.com'&&x.options.credentials==='omit'&&x.options.redirect==='error'&&x.options.referrerPolicy==='no-referrer'));
});
test('founder RPC retries transport reads at most three times using the same serialized request and JSON-RPC id',async()=>{
  const clock=virtualClock(),bodies=[];const rpc=createFounderRPC({...clock,fetcher:async(_url,options)=>{bodies.push(options.body);if(bodies.length<3)throw new TypeError('Failed to fetch');return rpcResponse(options);}});
  await rpc.request('query',{request_type:'view_account',account_id:company,block_id:B});
  assert.equal(bodies.length,3);assert.equal(new Set(bodies).size,1);assert.equal(JSON.parse(bodies[0]).params.block_id,B);
});
test('founder RPC bounds selected HTTP/transport retries but never retries rejection, malformed JSON or broadcasts',async()=>{
  for(const status of [429,502,503,504,400]){let calls=0;const rpc=createFounderRPC({...virtualClock(),fetcher:async(_url,options)=>{calls++;return rpcResponse(options,{status});}});await assert.rejects(rpc.request('status',[]));assert.equal(calls,status===400?1:3);}
  for(const change of [{error:{message:'domain rejection'}},{raw:'not JSON'}]){let calls=0;const rpc=createFounderRPC({...virtualClock(),fetcher:async(_url,options)=>{calls++;return rpcResponse(options,change);}});await assert.rejects(rpc.request('query',{block_id:B}));assert.equal(calls,1);}
  let calls=0;const rpc=createFounderRPC({...virtualClock(),fetcher:async(_url,options)=>{calls++;if(calls<=3)throw new TypeError('Failed to fetch');return rpcResponse(options);}});
  await assert.rejects(rpc.request('status',[]),/three attempts/);assert.equal(calls,3);await rpc.request('status',[]);assert.equal(calls,4);
  for(const method of ['broadcast_tx_commit','broadcast_tx_async','send_tx'])await assert.rejects(rpc.request(method,{signed_tx_base64:'not-a-transaction'}),/read-only/);assert.equal(calls,4);
});
function finalWire({hash=H,signer=owner,receiver=config.factory_id,actions}){return {final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash,signer_id:signer,receiver_id:receiver,actions},transaction_outcome:{id:hash,block_hash:B,outcome:{executor_id:signer,receipt_ids:[R],status:{SuccessReceiptId:R},gas_burnt:1,tokens_burnt:'10'}},receipts_outcome:[{id:R,outcome:{executor_id:receiver,receipt_ids:[],status:{SuccessValue:''},gas_burnt:1,tokens_burnt:'20'}}]};}
const wireCall=action=>({FunctionCall:{method_name:action.method,args:Buffer.from(JSON.stringify(action.args)).toString('base64'),deposit:action.deposit,gas:action.gas}});
test('manual publication and task hash candidates cannot poison an original intent before exact FINAL validation',async()=>{
  const publication=publicationIntent({config,recordId:'company_fixture',companyId:company,owner,site:null,storageByteCost:'10000000000000000000',content:content()});
  const task={method:'company_cancel_operation',args:{id:'work_original'},deposit:'0',gas:'50000000000000'};
  const cases=[{pending:{intent:publication,tx_hash:null,started_height:10},receiver:config.factory_id,action:publication,validate:validatePublicationOutcome},
    {pending:{account:owner,contract:company,intent:task,tx_hash:null,started_height:10,fingerprint:await intentFingerprint(task,company,owner)},receiver:company,action:task,validate:validateBusinessOutcome}];
  for(const c of cases){const before=JSON.stringify(c.pending),rpc={request:async(method,args)=>method==='block'?{header:{hash:B,height:11}}:finalWire({hash:args.tx_hash,receiver:c.receiver,actions:[wireCall({...c.action,args:args.tx_hash===H?c.action.args:{id:'wrong_request'}})]})};
    const inspect=hash=>inspectWalletCandidate({pending:c.pending,hash,knownHash:c.pending.tx_hash,account:owner,rpc,setHash:(next,value)=>next.tx_hash=value,validate:c.validate});
    await assert.rejects(inspect('4'.repeat(44)));assert.equal(JSON.stringify(c.pending),before);
    const right=await inspect(H);assert.equal(right.result.status,'final');assert.equal(right.candidate.tx_hash,H);assert.equal(JSON.stringify(c.pending),before);
    await assert.rejects(inspectWalletCandidate({pending:{...c.pending,tx_hash:H},hash:'4'.repeat(44),knownHash:H,account:owner,rpc,setHash:(next,value)=>next.tx_hash=value,validate:c.validate}),/wallet-returned/);
  }
});
test('refund pending survives reload and wrong/unknown candidate hashes, then reconciles the exact refund without another signature',async()=>{
  const oldNavigator=globalThis.navigator,oldLocation=globalThis.location;
  Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key,_options,callback)=>callback({name:'synthetic-lock'})}},configurable:true});globalThis.location={href:'https://example.com/project/app/founder.html'};
  try{for(const phase of ['create_failed','refund_failed']){
    const base=factoryRpc(),storage=memoryStorage();let signs=0;
    const record={id:'company_refund_roundtrip',creator:owner,child:company,template_sha256:config.company_template_sha256,owner_key_hex:'00'+'a1'.repeat(32),request_hash:'b'.repeat(64),phase,create_attempt:1,refund_attempt:phase==='refund_failed'?1:0,refund_ready:true,backing:'8968120000000000000000000',storage:'81920000000000000000000'};
    const rpc={...base,async request(method,args){if(method==='block')return {header:{hash:B,height:11}};if(method==='tx'){if(args.tx_hash==='5'.repeat(44))throw Error('Transaction not found yet');const saved=JSON.parse([...storage.values.values()][0]).pending;return finalWire({hash:args.tx_hash,actions:[wireCall({...saved.action,args:args.tx_hash===H?saved.action.args:{id:'wrong_original'}})]});}if(method==='query'&&args.method_name==='record')return {result:[...new TextEncoder().encode(JSON.stringify(record))],block_hash:B,block_height:10};return base.request(method,args);}};
    const selector={wallet:async()=>({getAccounts:async()=>[{accountId:owner}],signAndSendTransaction:async()=>{signs++;throw Error('Synthetic post-dispatch closure');}})},state=()=>({selector,account:owner});
    const first=createFounderClient({config,getWalletState:state,storage,rpc}),review=await first.reviewRefund(record.id);await assert.rejects(first.refund(review),/post-dispatch/);assert.equal(signs,1);
    const reloaded=createFounderClient({config,getWalletState:state,storage,rpc});assert.equal((await reloaded.savedPending()).pending.action.method,phase==='create_failed'?'claim_refund':'retry_refund');const before=JSON.stringify([...storage.values]);
    await assert.rejects(reloaded.reconcile('4'.repeat(44)));assert.equal(JSON.stringify([...storage.values]),before);
    await assert.rejects(reloaded.reconcile('5'.repeat(44)),/not found/);assert.equal(JSON.stringify([...storage.values]),before);
    assert.equal((await reloaded.reconcile(H)).status,'final');assert.equal(await reloaded.savedPending(),null);assert.equal(reloaded.savedCompany().request_id,record.id);assert.equal(signs,1);
  }}finally{Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});

test('slow founder polls share one flight and a changed company or epoch waits for its own fresh read',async()=>{
  let epoch=1,company='first.factory.testnet',active=0,maxActive=0;const runs=[],release=[];
  const refresh=createFounderReadFlight({context:()=>({epoch,company}),run:async()=>{active++;maxActive=Math.max(active,maxActive);const captured={epoch,company};runs.push(captured);await new Promise(resolve=>release.push(resolve));active--;return captured;}});
  const first=refresh(),poll=refresh(),manual=refresh();await Promise.resolve();assert.equal(runs.length,1);assert.equal(first,poll);assert.equal(first,manual);
  epoch=2;company='second.factory.testnet';const next=refresh();await Promise.resolve();assert.equal(runs.length,1);release.shift()();assert.equal((await first).company,'first.factory.testnet');
  for(let n=0;n<5&&runs.length<2;n++)await Promise.resolve();assert.equal(runs.length,2);release.shift()();assert.deepEqual(await next,{epoch:2,company:'second.factory.testnet'});assert.equal(maxActive,1);
  const after=refresh();await Promise.resolve();assert.equal(runs.length,3);release.shift()();await after;
});

test('a post-FINAL forced refresh waits for the pre-transaction poll then reads new state',async()=>{
  let ledger=0;const snapshots=[],releases=[];
  const refresh=createFounderReadFlight({context:()=>({epoch:1,company}),run:async()=>{const snapshot=ledger;snapshots.push(snapshot);await new Promise(resolve=>releases.push(resolve));return snapshot;}});
  const old=refresh();await Promise.resolve();ledger=1;const fresh=refresh({forceFresh:true});assert.equal(snapshots.length,1);releases.shift()();assert.equal(await old,0);
  for(let n=0;n<5&&snapshots.length<2;n++)await Promise.resolve();assert.deepEqual(snapshots,[0,1]);releases.shift()();assert.equal(await fresh,1);
});
test('a failed post-FINAL read retires the confirmed approval before refresh and retains its confirmation and owner copy',async()=>{
  const ownerFacts='Fictional one-hour product photography service.',publicCopy='Owner-edited public introduction';let draft={id:'work_confirmed'},approveEnabled=true,readStarted=false;const notices=[];
  const result=await refreshAfterKnownFinal({confirm:()=>{draft=null;approveEnabled=false;},refresh:async options=>{readStarted=true;assert.equal(options.forceFresh,true);assert.equal(draft,null);assert.equal(approveEnabled,false);throw Error('Synthetic provider transport exhausted');},notify:error=>notices.push('Original transaction is FINAL'+(error?': state read delayed; '+error.message:''))});
  assert.equal(result.refreshed,false);assert.equal(readStarted,true);assert.equal(draft,null);assert.equal(approveEnabled,false);assert.equal(ownerFacts,'Fictional one-hour product photography service.');assert.equal(publicCopy,'Owner-edited public introduction');assert.equal(notices.length,2);assert.ok(notices.every(n=>n.startsWith('Original transaction is FINAL')));assert.match(notices.at(-1),/state read delayed/);
});
test('known-FINAL refresh does not overwrite a changed owner context or reuse a failed older poll',async()=>{
  let current=true,notified=0,clear=0;const result=await refreshAfterKnownFinal({current:()=>current,confirm:()=>{clear++;},refresh:async()=>{current=false;throw Error('Old context failed');},notify:()=>notified++});assert.equal(clear,1);assert.equal(notified,1);assert.equal(result.stale,true);
  let run=0,release;const refresh=createFounderReadFlight({context:()=>({epoch:1,company}),run:async()=>{run++;if(run===1)await new Promise((_resolve,reject)=>release=reject);return 'fresh-after-final';}});
  const old=refresh();old.catch(()=>{});await Promise.resolve();const forced=refresh({forceFresh:true});release(Error('Old poll failed'));assert.equal(await forced,'fresh-after-final');assert.equal(run,2);
});

test('pinned Nightly connector is injected, preserves public account/key metadata and creates no web popup',async()=>{
  const oldWindow=globalThis.window,key=originalSignerPublicKey('00'+'a1'.repeat(32));let connects=0,signs=0;
  const near={account:{accountId:owner,publicKey:{toString:()=>key}},isConnected:true,connect:async()=>{connects++;throw Error('No human authorization is part of this offline test');},signTransaction:async()=>{signs++;throw Error('No signing in connector test');}};
  globalThis.window={nightly:{near}};const options={network:{networkId:'testnet',nodeUrl:'https://test.rpc.fastnear.com'}};
  try{const module=await founderNightlyModule(setupNightly)({options});assert.equal(module.id,'nightly');assert.equal(module.type,'injected');assert.equal(module.metadata.available,true);
    const wallet=await module.init({options,metadata:module.metadata,store:{getState:()=>({selectedWalletId:null,contract:{contractId:config.factory_id}})},emitter:{emit(){}},logger:{log(){}},provider:{sendTransaction(){throw Error('No broadcasts in connector test');}}});
    assert.deepEqual(await wallet.getAccounts(),[{accountId:owner,publicKey:key}]);assert.equal(connects,0);assert.equal(signs,0);
    let opens=0;assert.equal(reserveMyNearWalletPopup({store:{getState:()=>({selectedWalletId:module.id})}},{open(){opens++;}}),null);assert.equal(opens,0);
    near.account.accountId='owner.near';await assert.rejects(wallet.getAccounts(),/testnet/);
    near.account.accountId=owner;near.account.publicKey={toString:()=>'not-a-public-key'};await assert.rejects(wallet.getAccounts(),/Ed25519/);
  }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
test('Nightly refuses mainnet/custom-provider initialization and explains a missing extension without authentication',async()=>{
  const absent={},moduleFactory=founderNightlyModule(setupNightly,{windowRef:absent}),options={network:{networkId:'testnet',nodeUrl:'https://test.rpc.fastnear.com'}};
  for(const network of [{networkId:'mainnet',nodeUrl:'https://rpc.mainnet.near.org'},{networkId:'testnet',nodeUrl:'https://rpc.mainnet.near.org'}])await assert.rejects(moduleFactory({options:{network}}),/testnet/);
  const module=await moduleFactory({options});assert.equal(module.type,'injected');assert.equal(module.metadata.available,false);assert.match(module.metadata.description,/Mac browser/);assert.match(nightlyBrowserHint(absent),/reload/);
  await assert.rejects(module.init({options}),/Nightly is not detected/);
});

// Inert DOM integration: real UI handlers, client, FINAL-read validation and RSA/AES.
// Injected RPC returns only synthetic public records; the wallet refuses every signing
// request. This is not external-wallet or browser acceptance evidence.
const founderFixtureHTML=await readFile(new URL('./founder.html',import.meta.url),'utf8');
class FounderFixtureElement{
 constructor(root,tag='div'){this.root=root;this.tagName=tag.toUpperCase();this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.isConnected=true;this.dataset={};this.attributes=new Map();this.events=new Map();this.children=[];this.ownText='';}
 set textContent(v){this.ownText=String(v);this.children=[];}get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}removeAttribute(k){this.attributes.delete(k);}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.ownText='';this.children=[...nodes];}
 addEventListener(type,fn){const list=this.events.get(type)||[];list.push(fn);this.events.set(type,list);}
 async emit(type){for(const fn of this.events.get(type)||[])await fn({target:this,preventDefault(){}});}
 focus(){this.root.activeElement=this;}scrollIntoView(){this.scrolled=true;}
 querySelector(selector){if(this.selectors?.has(selector))return this.selectors.get(selector);throw Error('Unmodelled element selector '+selector);}
}
function createInertFounderDOM(){const root={elements:new Map(),activeElement:null,createElement(tag){return new FounderFixtureElement(root,tag);},querySelector(s){if(this.elements.has(s))return this.elements.get(s);throw Error('Unknown production selector '+s);},querySelectorAll(s){if(s==='[data-journey-step]')return this.steps;if(s==='#journey-steps li')return this.wayfinding;if(s==='[data-step-back]')return this.back;if(s==='button,input,textarea')return [...this.elements.values(),...this.back].filter(e=>['BUTTON','INPUT','TEXTAREA'].includes(e.tagName));throw Error('Unknown production multi-selector '+s);}};
 for(const match of founderFixtureHTML.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new FounderFixtureElement(root,match[1]);e.hidden=/\shidden(?:\s|>)/.test(match[0]);e.disabled=/\sdisabled(?:\s|>)/.test(match[0]);root.elements.set('#'+match[2],e);}
 const formMarkup=founderFixtureHTML.match(/<form\b[^>]*\bid="business-form"[^>]*>([\s\S]*?)<\/form>/)?.[1];
 assert.ok(formMarkup&&/<button\b[^>]*\btype="submit"/.test(formMarkup),'Model the actual initial business-form submit button');
 const initialSubmit=new FounderFixtureElement(root,'button');root.elements.set('#business-form button[type="submit"]',initialSubmit);
 root.steps=Array.from({length:5},(_,i)=>{const e=new FounderFixtureElement(root,'section');e.dataset.journeyStep=String(i);const heading=root.elements.get('#'+['business','wallet','create','boundaries','ready'][i]+'-title');e.selectors=new Map([['h1',heading]]);root.elements.set('[data-journey-step="'+i+'"]',e);root.elements.set('[data-journey-step="'+i+'"] h1',heading);return e;});
 const initialMarkup=founderFixtureHTML.match(/<section\b[^>]*\bdata-journey-step="0"[^>]*>([\s\S]*?)<\/section>/)?.[1];
 for(const [selector,tag]of [['.journey-kicker','p'],['.journey-lede','p'],['.journey-detail','details']]){assert.ok(initialMarkup?.includes(selector.slice(1)),'Initial presentation child exists in real HTML');root.steps[0].selectors.set(selector,new FounderFixtureElement(root,tag));}
 const ready=root.steps[4];ready.selectors.set('.journey-lede',new FounderFixtureElement(root,'p'));ready.selectors.set('.journey-next ol',new FounderFixtureElement(root,'ol'));
 for(const name of ['owned-companies','factory-recovery'])root.elements.get('#'+name).selectors=new Map([['h1',root.elements.get('#'+name+'-title')]]);
 root.wayfinding=Array.from({length:5},()=>new FounderFixtureElement(root,'li'));root.back=[0,1,0].map(n=>{const e=new FounderFixtureElement(root,'button');e.dataset.stepBack=String(n);return e;});return root;}

test('editing a prepared founder brief requires fresh encryption, recovery download and acknowledgment before wallet dispatch',async()=>{
 const oldNavigator=globalThis.navigator,oldLocation=globalThis.location,oldMatchMedia=globalThis.matchMedia;
 Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key,_options,callback)=>callback({name:'inert-owner-lock'})}},configurable:true});
 globalThis.location={href:'https://example.invalid/app/founder.html'};globalThis.matchMedia=()=>({matches:true});
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),storage=memoryStorage(),tabStorage=memoryStorage(),downloads=[],walletRequests=[];
 const record={id:'company_ui_edit',creator:owner,child:company,phase:'active',template_sha256:config.company_template_sha256,owner_key_hex:'00'+'a1'.repeat(32)};
 storage.setItem('business-is-near-founder-company-v1:'+config.factory_id+':'+owner,JSON.stringify({schema:1,owner,request_id:record.id,factory:config.factory_id}));
 const base=factoryRpc(),encoded=value=>({result:[...new TextEncoder().encode(JSON.stringify(value))],block_hash:B,block_height:10});let reads=0;
 const rpc={...base,async request(method,args){reads++;assert.ok(['status','query','EXPERIMENTAL_protocol_config'].includes(method),'Read-only synthetic RPC only');
  if(method==='query'&&args.account_id===company&&args.request_type==='view_account')return {code_hash:config.company_code_hash,block_hash:B,block_height:10};
  if(method==='query'&&args.request_type==='call_function'){
   if(args.account_id===config.factory_id&&args.method_name==='record')return encoded(record);
   if(args.account_id===company){if(args.method_name==='state')return encoded({owner,operator:config.operator_id,frozen:false});if(args.method_name==='company_state')return encoded({storage_blocks:0,lifetime_tasks:0,operator:config.operator_id});if(['execution_profile','ai_policy'].includes(args.method_name))return encoded(null);}
  }return base.request(method,args);}};
 const selector={wallet:async()=>({getAccounts:async()=>[{accountId:owner}],signAndSendTransaction:async request=>{walletRequests.push(request);throw Error('Inert fixture refuses every wallet signing request');}})};
 const ui=createFounderJourneyUI({config,root,rpc,storage,tabStorage,getWalletState:()=>({selector,account:owner}),connectWallet:async()=>{throw Error('No external wallet connection in unit fixture');},downloadFile:value=>downloads.push({ref:value,saved:structuredClone(value)})});
 try{
  $('#business-name').value='Harbor Studio';$('#business-goal').value='Create a clear website for our independent design service.';await ui.start();assert.ok(reads>0);assert.equal(root.steps[3].hidden,false);
  await $('#prepare-founder-setup').emit('click');await $('#download-mission-recovery').emit('click');$('#mission-recovery-saved').checked=true;await $('#mission-recovery-saved').emit('change');assert.equal($('#approve-founder-setup').disabled,false);
  const old=downloads[0];await root.back[2].emit('click');const scrubbed=old.ref.record_key==='';
  $('#business-name').value='Updated Harbor';$('#business-goal').value='Explain our updated service and the approved customer action.';await $('#business-form').emit('input');await $('#business-form').emit('submit');
  await $('#approve-founder-setup').emit('click');assert.equal(walletRequests.length,0,'Edited details must never dispatch the earlier encrypted payload');assert.ok(scrubbed);assert.equal($('#setup-recovery').hidden,true);assert.equal($('#mission-recovery-saved').checked,false);assert.match($('#setup-summary').textContent,/Updated Harbor/);assert.match($('#setup-summary').textContent,/updated service/);
  await $('#prepare-founder-setup').emit('click');await $('#approve-founder-setup').emit('click');assert.equal(walletRequests.length,0);
  await $('#download-mission-recovery').emit('click');await $('#approve-founder-setup').emit('click');assert.equal(walletRequests.length,0);assert.equal($('#mission-recovery-saved').checked,false);
  $('#mission-recovery-saved').checked=true;await $('#mission-recovery-saved').emit('change');await $('#approve-founder-setup').emit('click');assert.equal(walletRequests.length,1);assert.ok(await ui.client.savedPending(),'A refused request after dispatch remains unresolved');
  const latest=downloads[1].saved,args=JSON.parse(new TextDecoder().decode(walletRequests[0].actions[0].functionCall.args));assert.notEqual(latest.record_key,old.saved.record_key);assert.equal(await decrypt(args.encrypted_idea,latest.record_key,args.idea_hash),'Updated Harbor');assert.equal(await decrypt(args.encrypted_goal,latest.record_key,args.goal_hash),$('#business-goal').value);
 }finally{Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;if(oldMatchMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMatchMedia;}
});


const readOnlySelector={};
// Remembered metadata is a hint. All following reads are injected synthetic data;
// no extension popup, faucet request, real RPC, model or signing is exercised.
function sessionFixture({selected='nightly',values=[{accountId:owner}],windowRef={nightly:{near:{}}}}={}){
 let selectedWalletId=selected,current=values,notify=()=>{},loads=0,signs=0,outs=0;
 const wallet={getAccounts:async()=>current,signIn:async()=>{signs++;throw Error('Interactive wallet authorization is forbidden in this fixture');},signAndSendTransaction:async()=>{signs++;throw Error('Signing is forbidden in this fixture');},signOut:async()=>{outs++;selectedWalletId=null;notify();}};
 const selector={store:{getState:()=>({selectedWalletId,accounts:current}),observable:{subscribe:fn=>{notify=fn;}}},wallet:async()=>wallet};
 return {selector,windowRef,loadSelector:async()=>{loads++;return selector;},setAccounts:value=>{current=value;notify();},setSelected:value=>{selectedWalletId=value;notify();},counts:()=>({loads,signs,outs})};
}
test('remembered connection stores only bounded public testnet account metadata and refuses secret-shaped extras',()=>{
 const storage=memoryStorage();rememberFounderConnection('nightly',owner,storage);
 assert.deepEqual(readFounderConnection(storage),{schema:1,network:'testnet',wallet_id:'nightly',account_id:owner});
 const good=storage.getItem(FOUNDER_CONNECTION);
 for(const value of [{...JSON.parse(good),record_key:'secret'}, {...JSON.parse(good),access_token:'secret'}, {...JSON.parse(good),network:'mainnet'}, {...JSON.parse(good),wallet_id:'unknown'}, {...JSON.parse(good),account_id:'owner.near'},null]){
  storage.setItem(FOUNDER_CONNECTION,JSON.stringify(value));assert.equal(readFounderConnection(storage),null);
 }
 storage.setItem(FOUNDER_CONNECTION,'x'.repeat(513));assert.equal(readFounderConnection(storage),null);
 assert.throws(()=>rememberFounderConnection('nightly','https://example.invalid',storage));
});
test('a full browser restart restores a connected-before-company hint, while explicit forgetting keeps original records and suppresses restoration',()=>{
 const storage=memoryStorage(),tabStorage=memoryStorage(),url='https://example.invalid/app/founder.html';
 assert.equal(shouldRestoreFounderConnection({storage,tabStorage,url}),false);
 rememberFounderConnection('nightly',owner,storage);assert.equal(shouldRestoreFounderConnection({storage,tabStorage,url}),true);
 storage.setItem('business-is-near-founder-pending-v1:fixture','unresolved-original');storage.setItem('business-is-near-founder-company-v1:fixture','original-company');storage.setItem('private-recovery-fixture','unknown-private-record');
 forgetFounderConnection(storage);assert.equal(readFounderConnection(storage),null);assert.equal(shouldRestoreFounderConnection({storage,tabStorage,url}),false);
 assert.equal(storage.getItem('business-is-near-founder-pending-v1:fixture'),'unresolved-original');assert.equal(storage.getItem('business-is-near-founder-company-v1:fixture'),'original-company');assert.equal(storage.getItem('private-recovery-fixture'),'unknown-private-record');
});
test('silent connection restoration verifies the wallet public account and never calls authorization or signing',async()=>{
 const storage=memoryStorage(),fixture=sessionFixture();rememberFounderConnection('nightly','previous.testnet',storage);
 const connection=createFounderWalletConnection({...fixture,storage});assert.equal(connection.getState().account,null);
 await connection.initialize();assert.equal(connection.getState().account,owner);assert.equal(connection.getState().status,'connected');assert.equal(readFounderConnection(storage).account_id,owner);assert.deepEqual(fixture.counts(),{loads:1,signs:0,outs:0});
 await connection.initialize();assert.equal(fixture.counts().loads,1);
});
test('locked, absent, wrong-account and multiple-account wallets cannot gain authority from remembered metadata',async()=>{
 for(const args of [{values:[]},{selected:null,windowRef:{}},{values:[{accountId:owner},{accountId:'second.testnet'}]},{values:[{accountId:'owner.near'}]}]){
  const storage=memoryStorage(),fixture=sessionFixture(args);rememberFounderConnection('nightly',owner,storage);
  const connection=createFounderWalletConnection({...fixture,storage});await connection.initialize();assert.equal(connection.getState().account,null);assert.notEqual(connection.getState().status,'connected');assert.equal(readFounderConnection(storage).account_id,owner);assert.equal(fixture.counts().signs,0);
  if(args.windowRef)assert.match(connection.getState().message,/Nightly is not detected/);
 }
});
test('account changes use fresh wallet metadata, and disconnect removes only the public connection identity',async()=>{
 const storage=memoryStorage(),fixture=sessionFixture(),connection=createFounderWalletConnection({...fixture,storage});
 storage.setItem('business-is-near-founder-pending-v1:fixture','unknown-outcome');storage.setItem('business-is-near-founder-company-v1:fixture','original-company');
 await connection.initialize();fixture.setAccounts([{accountId:'second.testnet'}]);await connection.refresh();assert.equal(connection.getState().account,'second.testnet');assert.equal(readFounderConnection(storage).account_id,'second.testnet');
 await connection.disconnect();assert.equal(connection.getState().account,null);assert.equal(readFounderConnection(storage),null);assert.equal(storage.getItem('business-is-near-founder-pending-v1:fixture'),'unknown-outcome');assert.equal(storage.getItem('business-is-near-founder-company-v1:fixture'),'original-company');assert.deepEqual(fixture.counts(),{loads:1,signs:0,outs:1});
});
test('a failed explicit disconnect still forgets cached identity and never silently re-enables a wallet',async()=>{
 const storage=memoryStorage(),fixture=sessionFixture();fixture.selector.wallet=async()=>({getAccounts:async()=>[{accountId:owner}],signOut:async()=>{throw Error('Wallet is locked');}});
 const connection=createFounderWalletConnection({...fixture,storage});await connection.initialize();await assert.rejects(connection.disconnect(),/locked/);await connection.refresh();assert.equal(connection.getState().account,null);assert.equal(shouldRestoreFounderConnection({storage,tabStorage:memoryStorage(),url:'https://example.invalid/'}),false);
});
test('the pinned Nightly remembered-module path requests silent reconnect only and provider replacement refuses further metadata',async()=>{
 const key=originalSignerPublicKey('00'+'a1'.repeat(32)),calls=[],near={account:{accountId:owner,publicKey:{toString:()=>key}},isConnected:true,connect:async(_callback,silent)=>{calls.push(silent);if(silent!==true)throw Error('No automatic popup allowed');}};
 const windowRef={nightly:{near}},options={network:{networkId:'testnet',nodeUrl:'https://test.rpc.fastnear.com'}};
 const old=globalThis.window;globalThis.window=windowRef;
 try{const module=await founderNightlyModule(setupNightly,{windowRef})({options});const wallet=await module.init({options,metadata:module.metadata,store:{getState:()=>({selectedWalletId:'nightly'})},emitter:{emit(){}},logger:{log(){}},provider:{}});assert.deepEqual(calls,[true]);assert.equal((await wallet.getAccounts())[0].accountId,owner);windowRef.nightly.near={};await assert.rejects(wallet.getAccounts(),/Nightly changed/);}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
const missingBody=(wire,change={})=>({jsonrpc:'2.0',id:wire.id,error:{name:'HANDLER_ERROR',cause:{name:'UNKNOWN_ACCOUNT',info:{requested_account_id:wire.params.account_id,block_hash:B,block_height:10,...change}}}});
function syntheticWireRPC({missing=null,status=200,replyChange=()=>{},ownerAmount='12000000000000000000000000',serviceChange={}}={}){
 const base=factoryRpc();let clock=0,requests=0;
 return {rpc:createFounderRPC({now:()=>clock,delay:async ms=>{clock+=ms;},fetcher:async(url,options)=>{
  requests++;assert.equal(url,'https://test.rpc.fastnear.com');const wire=JSON.parse(options.body);assert.ok(['status','block','query','EXPERIMENTAL_protocol_config'].includes(wire.method));let body;
  if(wire.method==='query'&&wire.params.request_type==='view_account'&&wire.params.account_id!==config.factory_id){body=missing?missingBody(wire,missing):{jsonrpc:'2.0',id:wire.id,result:{amount:ownerAmount,storage_usage:0,block_hash:B,block_height:10}};}
  else if(wire.method==='block')body={jsonrpc:'2.0',id:wire.id,result:{header:{hash:B,height:10}}};
  else if(wire.method==='query'&&wire.params.method_name==='worker_service')body={jsonrpc:'2.0',id:wire.id,result:{result:[...new TextEncoder().encode(JSON.stringify(service(serviceChange)))],block_hash:B,block_height:10}};
  else if(wire.method==='query'&&wire.params.method_name==='list')body={jsonrpc:'2.0',id:wire.id,result:{result:[...new TextEncoder().encode(JSON.stringify({records:[],total:0}))],block_hash:B,block_height:10}};
  else body={jsonrpc:'2.0',id:wire.id,result:await base.request(wire.method,wire.params)};
  replyChange(body,wire);return {ok:status===200,status,text:async()=>JSON.stringify(body)};
 }}),requests:()=>requests};
}
test('account activation requires a request-bound structured UNKNOWN_ACCOUNT at the exact FINAL testnet block',async()=>{
 const account='a'.repeat(64),fixture=syntheticWireRPC({missing:{}}),client=createFounderClient({config,getWalletState:()=>({selector:readOnlySelector,account}),storage:memoryStorage(),rpc:fixture.rpc});
 const result=await client.fundingStatus();assert.equal(result.status,'unactivated');assert.equal(result.account,account);assert.equal(result.block.hash,B);assert.equal(result.availability.ready,true);assert.equal(result.spendable,'0');
 for(const options of [{missing:{block_hash:H}},{missing:{block_height:9}},{missing:{requested_account_id:'someone.testnet'}},{missing:{},replyChange:body=>{if(body.error)body.id=-1;}},{missing:{},replyChange:body=>{if(body.error)body.error.cause.name='UNKNOWN_BLOCK';}},{missing:{},replyChange:body=>{if(body.error)body.result={};}}]){
  const mock=syntheticWireRPC(options),c=createFounderClient({config,getWalletState:()=>({selector:readOnlySelector,account}),storage:memoryStorage(),rpc:mock.rpc});await assert.rejects(c.fundingStatus());
 }
});
test('401 and exhausted 429 provider failures never become an unactivated wallet or a zero balance',async()=>{
 for(const status of [401,429]){const fixture=syntheticWireRPC({missing:{},status}),client=createFounderClient({config,getWalletState:()=>({selector:readOnlySelector,account:owner}),storage:memoryStorage(),rpc:fixture.rpc});await assert.rejects(client.fundingStatus(),error=>!(error instanceof FounderAccountMissing)&&/unavailable/.test(error.message));assert.equal(fixture.requests(),status===429?3:1);const query=syntheticWireRPC({missing:{},status});await assert.rejects(query.rpc.request('query',{request_type:'view_account',account_id:owner,block_id:B}),error=>!(error instanceof FounderAccountMissing)&&/unavailable/.test(error.message));assert.equal(query.requests(),status===429?3:1);}
});
async function withFounderEnvironment(run){
 const oldLocation=globalThis.location,oldMatch=globalThis.matchMedia;globalThis.location={href:'https://example.invalid/app/founder.html'};globalThis.matchMedia=()=>({matches:true});
 try{await run();}finally{if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;if(oldMatch===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMatch;}
}
test('current recovery startup explains pause before wallet steps and promotes existing-company navigation',async()=>withFounderEnvironment(async()=>{
 const fixed=JSON.parse(await readFile(new URL('./src/founder-config.json',import.meta.url),'utf8'));
 const root=createInertFounderDOM(),$=s=>root.querySelector(s);let reads=0,connects=0;
 const ui=createFounderJourneyUI({config:fixed,root,storage:memoryStorage(),tabStorage:memoryStorage(),
  rpc:{request:async()=>{reads++;throw Error('No network in initial presentation fixture');}},
  getWalletState:()=>({selector:null,account:null,status:'disconnected'}),connectWallet:async()=>{connects++;throw Error('No automatic wallet connection');}});
 await ui.start();assert.equal(root.steps[0].hidden,false);assert.equal($('#business-form').hidden,true);
 assert.equal($('#business-form button[type="submit"]').disabled,true);assert.equal($('#create-another-company').disabled,true);
 assert.match($('#journey-notice').textContent,/creation and setup are paused/i);assert.match($('#business-title').textContent,/Continue its work/);
 assert.match(root.steps[0].querySelector('.journey-lede').textContent,/setup is paused/);assert.equal(root.steps[0].querySelector('.journey-detail').hidden,true);
 assert.equal($('#resume-existing-business').hidden,false);assert.equal($('#resume-existing-business').disabled,false);
 assert.match($('#resume-existing-business').textContent,/Open my existing company/);
 await $('#resume-existing-business').emit('click');assert.equal(root.steps[1].hidden,false);assert.match($('#journey-notice').textContent,/Connect the same testnet wallet/);
 assert.equal(reads,0);assert.equal(connects,0);
}));
test('real founder form guides an unactivated connected Nightly account through public copy and check-again without any signing',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),storage=memoryStorage(),tabStorage=memoryStorage(),account='a'.repeat(64),copies=[];let activated=false,signs=0;
 const absent=syntheticWireRPC({missing:{}}),active=syntheticWireRPC(),rpc={request:(...args)=>(activated?active:absent).rpc.request(...args),finalBlock:()=> (activated?active:absent).rpc.finalBlock()};
 const selector={wallet:async()=>({signAndSendTransaction:async()=>{signs++;throw Error('Signing is forbidden');}})},state={selector,account,walletId:'nightly',status:'connected'};
 const ui=createFounderJourneyUI({config,root,rpc,storage,tabStorage,getWalletState:()=>state,connectWallet:async()=>{throw Error('No extension popup');},copyText:async text=>copies.push(text)});
 await ui.start();$('#business-name').value='Harbor';$('#business-goal').value='Explain our service and help customers contact our team.';await $('#business-form').emit('submit');
 assert.equal(root.steps[1].hidden,false);assert.equal($('#wallet-session-status').textContent,'Connected Nightly');assert.equal($('#wallet-receive-address').textContent,account);assert.match($('#wallet-funding-status').textContent,/not active on testnet/);assert.match($('#wallet-required').textContent,/12 testNEAR.*estimate/);assert.equal($('#review-creation').disabled,true);
 await $('#copy-founder-address').emit('click');assert.deepEqual(copies,[account]);activated=true;await $('#refresh-founder-balance').emit('click');assert.match($('#wallet-funding-status').textContent,/covers/);assert.doesNotMatch($('#wallet-required').textContent,/estimate/);assert.equal($('#review-creation').disabled,false);assert.equal(signs,0);
}));
test('real founder balance UI reports provider failure without asking the user to activate or fund an unknown balance',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),fixture=syntheticWireRPC({missing:{},status:401}),ui=createFounderJourneyUI({config,root,rpc:fixture.rpc,storage:memoryStorage(),tabStorage:memoryStorage(),getWalletState:()=>({selector:readOnlySelector,account:owner}),connectWallet:async()=>{}});
 $('#business-name').value='Harbor';$('#business-goal').value='Explain our service and help customers contact our team.';await $('#business-form').emit('submit');assert.match($('#journey-notice').textContent,/unavailable/);assert.equal($('#review-creation').disabled,true);assert.doesNotMatch($('#wallet-funding-status').textContent,/not active|Add at least|Request free/);assert.equal($('#wallet-balance').textContent,'Checking…');
}));
test('an expired worker lease keeps the public account visible and blocks new company review without resetting pilot limits',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),fixture=syntheticWireRPC({serviceChange:{observed_at:'100000'}}),ui=createFounderJourneyUI({config,root,rpc:fixture.rpc,storage:memoryStorage(),tabStorage:memoryStorage(),getWalletState:()=>({selector:readOnlySelector,account:owner,walletId:'nightly'}),connectWallet:async()=>{}});
 $('#business-name').value='Harbor';$('#business-goal').value='Explain our service and help customers contact our team.';await $('#business-form').emit('submit');assert.equal($('#wallet-receive-address').textContent,owner);assert.match($('#wallet-funding-status').textContent,/window has ended/);assert.equal($('#review-creation').disabled,true);assert.match($('#wallet-pilot-capacity').textContent,/8 company places.*one revision/);
}));
test('visible switch and disconnect controls use only explicit wallet actions and preserve unknown pending/original company records',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),storage=memoryStorage(),state={selector:{},account:owner,walletId:'nightly'};let switches=0,disconnects=0;
 storage.setItem('business-is-near-founder-pending-v1:other','unknown-outcome');storage.setItem('business-is-near-founder-company-v1:other','original-company');const before=new Map(storage.values);
 const ui=createFounderJourneyUI({config,root,rpc:factoryRpc(),storage,tabStorage:memoryStorage(),getWalletState:()=>state,connectWallet:async factory=>{assert.equal(factory,config.factory_id);switches++;},disconnectWallet:async()=>{disconnects++;state.account=null;}});ui.walletSessionChanged();await $('#switch-founder-wallet').emit('click');assert.equal(switches,1);assert.equal(disconnects,0);await $('#disconnect-founder-wallet').emit('click');assert.equal(disconnects,1);for(const [key,value]of before)assert.equal(storage.getItem(key),value);
}));
test('faucet guidance uses the official built-in faucet page for implicit accounts without address queries or scripts',()=>{
 const link=founderFixtureHTML.match(/<a id="open-founder-faucet"[^>]+>/)?.[0];assert.ok(link);assert.match(link,/href="https:\/\/docs.near.org\/getting-started\/faucet"/);assert.match(link,/target="_blank"/);assert.match(link,/rel="noopener noreferrer"/);assert.doesNotMatch(link,/\?|javascript:|data:/);assert.doesNotMatch(founderFixtureHTML,/https:\/\/near-faucet.io/);assert.match(founderFixtureHTML,/grant may cover only part of setup/);
});

test('a freshly activated wallet with too few test tokens receives an exact shortfall and cannot review creation',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),fixture=syntheticWireRPC({ownerAmount:'1000000000000000000000000'}),state={selector:readOnlySelector,account:owner,walletId:'nightly'};
 const ui=createFounderJourneyUI({config,root,rpc:fixture.rpc,storage:memoryStorage(),tabStorage:memoryStorage(),getWalletState:()=>state,connectWallet:async()=>{}});$('#business-name').value='Harbor';$('#business-goal').value='Explain our service and help customers contact our team.';await $('#business-form').emit('submit');assert.match($('#wallet-funding-status').textContent,/Add at least .*free test tokens/);assert.doesNotMatch($('#wallet-required').textContent,/estimate/);assert.equal($('#review-creation').disabled,true);assert.doesNotMatch($('#wallet-funding-status').textContent,/not active/);
}));

test('the existing pinned selector module preference starts safe migration restoration, and forgetting wins over it',async()=>{
 const storage=memoryStorage(),tabStorage=memoryStorage(),url='https://example.invalid/app/founder.html';storage.setItem('near-wallet-selector:selectedWalletId','"nightly"');assert.equal(shouldRestoreFounderConnection({storage,tabStorage,url}),true);
 for(const value of ['nightly','"unknown"','"nightly"'+'x'.repeat(1000)]){storage.setItem('near-wallet-selector:selectedWalletId',value);assert.equal(shouldRestoreFounderConnection({storage,tabStorage,url}),false);}
 storage.setItem('near-wallet-selector:selectedWalletId','"nightly"');forgetFounderConnection(storage);assert.equal(shouldRestoreFounderConnection({storage,tabStorage,url}),false);const fixture=sessionFixture(),connection=createFounderWalletConnection({...fixture,storage});assert.equal(await connection.initialize(),null);assert.equal(fixture.counts().loads,0);await connection.connect();assert.equal(connection.getState().account,owner);assert.equal(fixture.counts().signs,0);
});
test('a locked pinned Nightly provider cannot expose its stale public account as connected',async()=>{
 const key=originalSignerPublicKey('00'+'a1'.repeat(32)),near={account:{accountId:owner,publicKey:{toString:()=>key}},isConnected:false},windowRef={nightly:{near}},old=globalThis.window,options={network:{networkId:'testnet',nodeUrl:'https://test.rpc.fastnear.com'}};globalThis.window=windowRef;
 try{const module=await founderNightlyModule(setupNightly,{windowRef})({options});const wallet=await module.init({options,metadata:module.metadata,store:{getState:()=>({selectedWalletId:null})},emitter:{emit(){}},logger:{log(){}},provider:{}});assert.deepEqual(await wallet.getAccounts(),[]);}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
test('disconnect through real founder handlers retains the current unknown wallet action and original company selection',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),storage=memoryStorage(),state={selector:readOnlySelector,account:owner,walletId:'nightly'},saved=await setupPending(prepared.transaction,config.company_code_hash,{hash:B,height:10});
 const pendingKey='business-is-near-founder-pending-v1:'+config.factory_id+':'+owner,companyKey='business-is-near-founder-company-v1:'+config.factory_id+':'+owner;
 storage.setItem(pendingKey,JSON.stringify(saved));storage.setItem(companyKey,JSON.stringify({schema:1,owner,request_id:'company_original',factory:config.factory_id}));storage.setItem('unknown-recovery-fixture','private-original-record');const before=new Map(storage.values);
 let ui;ui=createFounderJourneyUI({config,root,rpc:factoryRpc(),storage,tabStorage:memoryStorage(),getWalletState:()=>state,connectWallet:async()=>{},disconnectWallet:async()=>{state.account=null;await ui.accountChanged();}});await ui.start();assert.equal($('#journey-pending').hidden,false);await $('#disconnect-founder-wallet').emit('click');for(const [key,value]of before)assert.equal(storage.getItem(key),value);assert.equal(state.account,null);assert.equal($('#create-founder-company').disabled,true);
}));

test('returning founders can read the original company when the optional worker-service read is unavailable',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),storage=memoryStorage(),state={selector:readOnlySelector,account:owner,walletId:'nightly'};
 const record={id:'company_readonly_resume',creator:owner,child:company,phase:'active',template_sha256:config.company_template_sha256,owner_key_hex:'00'+'a1'.repeat(32)};
 storage.setItem('business-is-near-founder-company-v1:'+config.factory_id+':'+owner,JSON.stringify({schema:1,owner,request_id:record.id,factory:config.factory_id}));
 const base=factoryRpc(),encoded=value=>({result:[...new TextEncoder().encode(JSON.stringify(value))],block_hash:B,block_height:10});
 const rpc={...base,async request(method,args){
  if(method==='query'&&args.method_name==='worker_service')throw Error('Synthetic optional worker-service read unavailable');
  if(method==='query'&&args.account_id===company&&args.request_type==='view_account')return {code_hash:config.company_code_hash,block_hash:B,block_height:10};
  if(method==='query'&&args.request_type==='call_function'){
   if(args.account_id===config.factory_id&&args.method_name==='record')return encoded(record);
   if(args.account_id===company){if(args.method_name==='state')return encoded({owner,operator:config.operator_id,frozen:false});if(args.method_name==='company_state')return encoded({storage_blocks:2,lifetime_tasks:1,operator:config.operator_id});if(args.method_name==='execution_profile')return encoded({profile:'business-operations-v1',worker_key_id:config.worker_key_id,worker_public_key:config.worker_public_key});if(args.method_name==='ai_policy')return encoded(founderAIPolicy());}
  }return base.request(method,args);
 }};
 const ui=createFounderJourneyUI({config,root,rpc,storage,tabStorage:memoryStorage(),getWalletState:()=>state,connectWallet:async()=>{throw Error('No automatic wallet popup');}});
 await ui.start();assert.equal(root.steps[4].hidden,false);assert.equal($('#read-founder-company').hidden,false);assert.equal($('#open-founder-workspace').hidden,true);assert.match($('#worker-readiness-detail').textContent,/unavailable/);assert.match($('#company-ready').textContent,/encrypted profile/);
}));

test('locked remembered connections have a visible explicit reconnect action before any business form is filled',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),state={selector:null,account:null,remembered:{schema:1,network:'testnet',wallet_id:'nightly',account_id:owner},message:'Unlock Nightly in your browser, then choose Reconnect Nightly to approve this site.'};let connects=0;
 const ui=createFounderJourneyUI({config,root,rpc:factoryRpc(),storage:memoryStorage(),tabStorage:memoryStorage(),getWalletState:()=>state,connectWallet:async id=>{assert.equal(id,config.factory_id);connects++;}});await ui.start();assert.equal(root.steps[0].hidden,false);assert.equal($('#wallet-session-panel').hidden,false);assert.equal($('#switch-founder-wallet').hidden,false);assert.equal($('#switch-founder-wallet').textContent,'Reconnect Nightly');assert.match($('#wallet-session-detail').textContent,/Reconnect Nightly/);await $('#switch-founder-wallet').emit('click');assert.equal(connects,1);assert.equal($('#business-name').value,'');
}));
test('explicit reconnect resets stale Nightly metadata through its original adapter before interactive connect',async()=>{
 const key=originalSignerPublicKey('00'+'a1'.repeat(32));let connects=0,disconnects=0;
 const current=()=>({accountId:owner,publicKey:{toString:()=>key}}),near={account:current(),isConnected:false,
  disconnect:async()=>{disconnects++;near.account={accountId:'',publicKey:{toString:()=>''}};},
  connect:async callback=>{connects++;near.isConnected=true;near.account=current();callback?.(near.account);}};
 const windowRef={nightly:{near}},old=globalThis.window,options={network:{networkId:'testnet',nodeUrl:'https://test.rpc.fastnear.com'}};globalThis.window=windowRef;
 try{const module=await founderNightlyModule(setupNightly,{windowRef})({options}),wallet=await module.init({options,metadata:module.metadata,store:{getState:()=>({selectedWalletId:null})},emitter:{emit(){}},logger:{log(){}},provider:{}});
  assert.deepEqual(await wallet.getAccounts(),[]);assert.equal(connects,0);assert.equal((await wallet.signIn({contractId:config.factory_id}))[0].accountId,owner);assert.equal(connects,1);assert.equal(disconnects,1);
 }finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
test('the public founder session cannot select the browser-key web-wallet fallback',async()=>{
 const storage=memoryStorage();assert.throws(()=>rememberFounderConnection('my-near-wallet',owner,storage));storage.setItem('near-wallet-selector:selectedWalletId','"my-near-wallet"');assert.equal(shouldRestoreFounderConnection({storage,tabStorage:memoryStorage(),url:'https://example.invalid/'}),false);
 const fixture=sessionFixture({selected:'my-near-wallet'}),connection=createFounderWalletConnection({...fixture,storage});await connection.initialize();assert.equal(connection.getState().account,null);assert.equal(fixture.counts().signs,0);
 const entry=await readFile(new URL('./src/founder-journey.js',import.meta.url),'utf8');assert.doesNotMatch(entry,/my-near-wallet|setupMyNearWallet/);
 const workspace=await readFile(new URL('./src/business-ui.js',import.meta.url),'utf8'),start=workspace.indexOf('if(state.founderBinding){'),end=workspace.indexOf('state.selector=await founderConnection.initialize()',start);assert.ok(start>=0&&end>start);assert.doesNotMatch(workspace.slice(start,end),/my-near-wallet|setupMyNearWallet/);
});

// Executes the pinned core's actual storage reconciliation and account events.
// Only the injected extension and storage are synthetic; no authorization,
// signature, transaction, browser key or network is used by this fixture.
async function withPinnedCoreSession(run){
 const descriptors=new Map(['window','navigator','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const storage=memoryStorage(),key=originalSignerPublicKey('00'+'a1'.repeat(32)),calls=[];
 let unlocked=false,failDisconnect=false,retainMetadata=false,callback=null;
 const account=()=>({accountId:owner,publicKey:{toString:()=>key}});
 const near={isConnected:false,account:account(),connect:async(next,silent)=>{
  calls.push({kind:'connect',silent:silent===true});if(!unlocked)throw Error('Synthetic locked Nightly');
  callback=next;near.isConnected=true;near.account=account();next?.(near.account);return near.account;
 },disconnect:async()=>{calls.push({kind:'disconnect'});if(failDisconnect)throw Error('Synthetic disconnect refused');near.isConnected=false;if(!retainMetadata)near.account={accountId:'',publicKey:{toString:()=>''}};callback?.();},
 signTransaction:async()=>{throw Error('Signing forbidden in actual-core fixture');},signMessage:async()=>{throw Error('Signing forbidden in actual-core fixture');}};
 const navigator={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',language:'en',languages:['en']};
 const window={nightly:{near},navigator};
 for(const[name,value]of Object.entries({window,navigator,localStorage:storage}))Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
 const sdkStorage={getItem:async k=>storage.getItem(k),setItem:async(k,v)=>{storage.setItem(k,v);},removeItem:async k=>{storage.removeItem(k);}};
 const selectors=[];
 const connection=()=>createFounderWalletConnection({storage,windowRef:window,loadSelector:async()=>{
  const selector=await setupWalletSelector({network:'testnet',storage:sdkStorage,allowMultipleSelectors:true,modules:[founderNightlyModule(setupNightly,{windowRef:window})]});selectors.push(selector);return selector;
 }});
 try{await run({storage,near,calls,selectors,connection,unlock:()=>{unlocked=true;},refuseDisconnect:()=>{failDisconnect=true;},retainStaleMetadata:()=>{retainMetadata=true;}});}
 finally{for(const[name,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
test('actual pinned selector recovers locked restore after unlock and explicit Reconnect when its selected wallet was cleared',async()=>withPinnedCoreSession(async f=>{
 f.storage.setItem('near-wallet-selector:selectedWalletId','"nightly"');rememberFounderConnection('nightly',owner,f.storage);
 for(const[key,value]of [['business-is-near-founder-pending-v1:fixture','unknown-original'],['business-is-near-founder-company-v1:fixture','original-company'],['private-recovery-fixture','original-recovery']])f.storage.setItem(key,value);
 const original=[...f.storage.values].filter(([key])=>!key.startsWith('near-wallet-selector:')&&key!==FOUNDER_CONNECTION);
 const first=f.connection();await first.initialize();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(first.getState().account,null);assert.equal(f.selectors[0].store.getState().selectedWalletId,null);assert.equal(f.storage.getItem('near-wallet-selector:selectedWalletId'),null);
 assert.deepEqual(f.calls,[{kind:'connect',silent:true}]);
 f.unlock();const returning=f.connection();await returning.initialize();assert.equal(returning.getState().account,null);assert.equal(f.calls.length,1,'Reload never opens an interactive connection');
 const selector=await returning.connect();assert.equal(f.calls.length,1,'The app button only prepares the chooser');
 const wallet=await selector.wallet('nightly');const accounts=await wallet.signIn({contractId:config.factory_id});await returning.refresh();
 assert.equal(accounts[0].accountId,owner);assert.equal(returning.getState().account,owner);assert.equal(selector.store.getState().selectedWalletId,'nightly');
 assert.deepEqual(f.calls,[{kind:'connect',silent:true},{kind:'disconnect'},{kind:'connect',silent:false}]);
 for(const[key,value]of original)assert.equal(f.storage.getItem(key),value);
 await returning.disconnect();assert.equal(returning.getState().account,null);assert.equal(selector.store.getState().selectedWalletId,null);
 assert.equal(shouldRestoreFounderConnection({storage:f.storage,tabStorage:memoryStorage(),url:'https://example.invalid/'}),false);
 for(const[key,value]of original)assert.equal(f.storage.getItem(key),value);
}));
test('actual pinned selector keeps explicit forgetting effective when extension sign-out fails',async()=>withPinnedCoreSession(async f=>{
 f.unlock();const connection=f.connection(),selector=await connection.connect(),wallet=await selector.wallet('nightly');
 await wallet.signIn({contractId:config.factory_id});await connection.refresh();assert.equal(connection.getState().account,owner);
 f.storage.setItem('business-is-near-founder-pending-v1:fixture','unknown-original');f.refuseDisconnect();
 await assert.rejects(connection.disconnect(),/Synthetic disconnect refused/);await connection.refresh();assert.equal(connection.getState().account,null);
 assert.equal(shouldRestoreFounderConnection({storage:f.storage,tabStorage:memoryStorage(),url:'https://example.invalid/'}),false);
 const loads=f.selectors.length;assert.equal(await f.connection().initialize(),null);assert.equal(f.selectors.length,loads);
 assert.equal(f.storage.getItem('business-is-near-founder-pending-v1:fixture'),'unknown-original');
}));
test('actual pinned selector refuses stale metadata that survives an explicit reconnect reset',async()=>withPinnedCoreSession(async f=>{
 f.unlock();f.retainStaleMetadata();const connection=f.connection(),selector=await connection.connect(),wallet=await selector.wallet('nightly');
 await assert.rejects(wallet.signIn({contractId:config.factory_id}),/Disconnect this site in Nightly.*Reconnect Nightly/);
 await connection.refresh();assert.equal(connection.getState().account,null);assert.equal(selector.store.getState().selectedWalletId,null);
 assert.deepEqual(f.calls,[{kind:'disconnect'}]);
}));
test('actual pinned selector gives actionable recovery when an explicit reconnect reset is rejected and retains original records',async()=>withPinnedCoreSession(async f=>{
 f.unlock();f.refuseDisconnect();rememberFounderConnection('nightly',owner,f.storage);
 const records=[['business-is-near-founder-pending-v1:fixture','unknown-original'],['business-is-near-founder-company-v1:fixture','original-company'],['private-recovery-fixture','original-recovery']];
 for(const[key,value]of records)f.storage.setItem(key,value);
 const connection=f.connection(),selector=await connection.connect(),wallet=await selector.wallet('nightly');
 await assert.rejects(wallet.signIn({contractId:config.factory_id}),error=>/Unlock Nightly/.test(error.message)&&/disconnect this site in Nightly/.test(error.message)&&/Reconnect Nightly/.test(error.message)&&!/Synthetic disconnect refused/.test(error.message));
 await connection.refresh();assert.equal(connection.getState().account,null);assert.equal(selector.store.getState().selectedWalletId,null);
 assert.deepEqual(f.calls,[{kind:'disconnect'}],'A rejected reset must not invoke interactive connection or signing');
 for(const[key,value]of records)assert.equal(f.storage.getItem(key),value);
 assert.equal(readFounderConnection(f.storage).account_id,owner,'The public hint remains a hint, not authority');
}));

// Reuse the existing inert elements; only the production publication mount is
// parsed here. Its actual handlers, receipt validator and read client still run.
function createInertPublicationDOM(){
 const root={elements:new Map(),activeElement:null,createElement(tag){return new FounderFixtureElement(root,tag);}},mount=new FounderFixtureElement(root);
 const $=selector=>{assert.ok(root.elements.has(selector),'Unknown publication selector '+selector);return root.elements.get(selector);};
 Object.defineProperty(mount,'innerHTML',{set(html){for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new FounderFixtureElement(root,match[1]);e.hidden=/\shidden(?:\s|>)/.test(match[0]);e.disabled=/\sdisabled(?:\s|>)/.test(match[0]);root.elements.set('#'+match[2],e);}}});
 const descendants=element=>[element,...element.children.flatMap(descendants)];
 mount.querySelector=$;mount.querySelectorAll=selector=>{
  const values=[...new Set([...root.elements.values(),...descendants($('#publication-items'))])];
  if(selector==='[data-publication-item]')return values.filter(e=>e.attributes.has('data-publication-item'));
  if(selector==='button,input,textarea')return values.filter(e=>['BUTTON','INPUT','TEXTAREA'].includes(e.tagName));
  if(selector==='input,textarea')return values.filter(e=>['INPUT','TEXTAREA'].includes(e.tagName));
  throw Error('Unknown publication multi-selector '+selector);
 };return {root,mount,$};
}
async function withPublicationFixture(run,{switchAt=null}={}){return withFounderEnvironment(async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key,_options,fn)=>fn({name:'inert-publication-lock'})}},configurable:true});
 const {root,mount,$}=createInertPublicationDOM(),storage=memoryStorage(),notices=[],requests=[],txBlock='4'.repeat(44),recordId='company_publication_final';let delayed=false,txReads=0,switched=false,ui;
 const binding={record_id:recordId},selector={store:{getState:()=>({selectedWalletId:'nightly'})},wallet:async()=>({getAccounts:async()=>[{accountId:owner}],signAndSendTransaction:async request=>{requests.push(request);delayed=true;return publicationFinalReceipt(JSON.parse(storage.getItem(pendingKey)).intent,txBlock);}})};
 const context={epoch:1,account:owner,owner,company,selector,binding},pendingKey='business-is-near-publication-pending-v1:'+config.factory_id+':'+owner;
 const changeOwner=()=>{if(switched)return;switched=true;context.account='other.testnet';context.owner='other.testnet';context.binding={record_id:'company_other'};ui.clear();notices.push({message:'Owner context changed.',bad:false});};
 const base=factoryRpc(),encoded=value=>({result:[...new TextEncoder().encode(JSON.stringify(value))],block_hash:B,block_height:10});
 const rpc={...base,async request(method,args){
  if(method==='tx'){txReads++;delayed=true;return publicationFinalReceipt(JSON.parse(storage.getItem(pendingKey)).intent,txBlock);}
  if(method==='block'){assert.equal(args.block_id,txBlock);if(switchAt==='final-block')changeOwner();return {header:{hash:txBlock,height:11}};}
  if(method==='status'&&delayed){if(switchAt==='refresh')changeOwner();throw Error('Synthetic publication state read unavailable');}
  if(method==='query'&&args.method_name==='record')return encoded({id:recordId,creator:owner,child:company,phase:'active',template_sha256:config.company_template_sha256});
  if(method==='query'&&args.method_name==='site')return encoded(null);
  return base.request(method,args);
 }};
 ui=createFounderPublicationUI({config,root,mount,storage,rpc,getContext:()=>context,notice:(message,bad=false)=>notices.push({message,bad})});ui.setArtifact(content());
 const seed=async()=>{const p={schema:1,request_id:'a'.repeat(32),intent:publicationIntent({config,recordId,companyId:company,owner,site:null,storageByteCost:'10000000000000000000',content:content()}),started_height:10,started_block:B,tx_hash:H};const{tx_hash,...immutable}=p;p.fingerprint=await digest(canonicalFactory(immutable));storage.setItem(pendingKey,JSON.stringify(p));$('#publication-reconcile-hash').value=H;};
 try{await run({ui,$,storage,notices,requests,context,pendingKey,seed,txReads:()=>txReads});}
 finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});}
test('publication approval retains validated FINAL confirmation and public copy when its following read fails without another approval',async()=>withPublicationFixture(async f=>{
 await f.$('#publication-form').emit('submit');f.$('#publication-consent').checked=true;await f.$('#publication-consent').emit('change');assert.equal(f.$('#approve-publication').disabled,false);
 await f.$('#approve-publication').emit('click');assert.equal(f.requests.length,1);assert.equal(f.txReads(),0);assert.equal(f.storage.getItem(f.pendingKey),null);
 assert.equal(f.$('#publication-review').hidden,true);assert.equal(f.$('#approve-publication').disabled,true);assert.equal(f.$('#publication-pending').hidden,true);assert.equal(f.$('#publication-title').value,content().title);
 const last=f.notices.at(-1);assert.match(last.message,/FINAL/);assert.match(last.message,/read.*delayed/);assert.match(last.message,/Check published version/);assert.equal(last.bad,false);assert.doesNotMatch(last.message,/Synthetic publication state read unavailable/);
 assert.equal(f.$('#publication-status').textContent,last.message);
 await f.$('#reconcile-publication').emit('click');assert.equal(f.requests.length,1);assert.equal(f.txReads(),0);
}));
test('publication reconcile handler retains validated FINAL confirmation after read failure and never replays the original transaction',async()=>withPublicationFixture(async f=>{
 await f.seed();await f.$('#reconcile-publication').emit('click');assert.equal(f.txReads(),1);assert.equal(f.requests.length,0);assert.equal(f.storage.getItem(f.pendingKey),null);assert.equal(f.$('#publication-title').value,content().title);
 assert.match(f.notices.at(-1).message,/FINAL.*read.*delayed/);assert.equal(f.notices.at(-1).bad,false);assert.equal(f.$('#approve-publication').disabled,true);assert.equal(f.$('#publication-pending').hidden,true);
 assert.equal(f.$('#publication-status').textContent,f.notices.at(-1).message);
 await f.$('#reconcile-publication').emit('click');assert.equal(f.txReads(),1);assert.equal(f.requests.length,0);
}));
test('publication FINAL handlers never overwrite a changed owner context with stale confirmation',async()=>{
 for(const switchAt of ['final-block','refresh'])await withPublicationFixture(async f=>{
  await f.$('#publication-form').emit('submit');f.$('#publication-consent').checked=true;await f.$('#publication-consent').emit('change');await f.$('#approve-publication').emit('click');
  assert.equal(f.storage.getItem(f.pendingKey),null);assert.equal(f.context.account,'other.testnet');assert.equal(f.$('#publication-title').value,'');
  assert.equal(f.notices.at(-1).message,'Owner context changed.');assert.equal(f.requests.length,1);assert.equal(f.txReads(),0);
 },{switchAt});
});

// Generated by /ship coverage audit.
// Value: protects=Funding refuses malformed public balances and preserves frozen/full pilot limits;
// fails_when=Invalid quote fields are accepted or unavailable pilot places become ready;
// why_new=Existing funding tests cover valid balances, activation and expired service only;
// seam=none; no_claim=Live RPC correctness (synthetic wire replies).
test('funding validates public amounts and preserves frozen or exhausted pilot availability',async()=>{
 const read=options=>{const fixture=syntheticWireRPC(options);return createFounderClient({config,getWalletState:()=>({selector:readOnlySelector,account:owner}),storage:memoryStorage(),rpc:fixture.rpc}).fundingStatus();};
 for(const amount of ['-1','01',1,null])await assert.rejects(read({ownerAmount:amount}),/public balance/);
 for(const change of [{frozen:true},{count:8},{count:9}]){
  const result=await read({replyChange:(body,wire)=>{if(wire.params?.method_name==='state'){const state=JSON.parse(Buffer.from(body.result.result).toString());body.result.result=[...Buffer.from(JSON.stringify({...state,...change}))];}}});
  assert.equal(result.availability.ready,false);assert.equal(result.places,change.frozen?8:0);assert.equal(result.status,'activated');
 }
 for(const cost of ['0','-1',null])await assert.rejects(read({replyChange:(body,wire)=>{if(wire.method==='EXPERIMENTAL_protocol_config')body.result.runtime_config.storage_amount_per_byte=cost;}}),/storage price/);
});

// Generated by /ship coverage audit.
// Value: protects=Copy refusal leaves a visible manual-copy recovery message without wallet actions;
// fails_when=Clipboard rejection is swallowed or reports a successful copy;
// why_new=Existing receive-address interaction exercises successful copying only;
// seam=none; no_claim=Actual browser clipboard permissions (injected rejection, inert DOM).
test('receive-address copy refusal offers manual recovery and requires a connected account',async()=>withFounderEnvironment(async()=>{
 const root=createInertFounderDOM(),$=s=>root.querySelector(s),state={selector:readOnlySelector,account:owner,walletId:'nightly'};let copies=0;
 const ui=createFounderJourneyUI({config,root,rpc:factoryRpc(),storage:memoryStorage(),tabStorage:memoryStorage(),getWalletState:()=>state,connectWallet:async()=>{throw Error('No wallet action');},copyText:async()=>{copies++;throw Error('Synthetic clipboard permission denied');}});
 ui.walletSessionChanged();await $('#copy-founder-address').emit('click');assert.equal(copies,1);assert.match($('#journey-notice').textContent,/Copy is unavailable.*Select and copy/);assert.doesNotMatch($('#journey-notice').textContent,/address copied/);
 state.account=null;await $('#copy-founder-address').emit('click');assert.equal(copies,1);assert.match($('#journey-notice').textContent,/Connect your testnet wallet first/);
}));
