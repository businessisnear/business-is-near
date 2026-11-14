// Actual isolated NEAR sandbox; no public RPC, models, wallets or real funds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {openPersistentSandbox} from './persistent/sandbox.mjs';
import {validateFinalOutcome} from '../executor/outcome.mjs';
import {companyFactoryCreate,companyFactoryRecovery,FACTORY_CUSTODY_ACK} from '../web-chain/src/company-factory-actions.js';
const rootPath=fileURLToPath(new URL('./',import.meta.url)),require=createRequire(import.meta.url),{utils}=require('near-api-js');
const N=10n**24n,GAS='300000000000000',sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const reportPath=process.argv[2];assert.ok(reportPath&&path.isAbsolute(reportPath),'Absolute private report path required');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'founder-factory-service-')),checks={},receipts=[];let sandbox;
const sourceFiles=['onchain/company_factory.ts','build/company_factory.wasm','build/company.wasm','test_factory_service.mjs'];
const pins=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await fs.readFile(path.join(rootPath,p)))])));
try{
 sandbox=await openPersistentSandbox({homeDir:path.join(temporary,'chain')});const root=sandbox.root,provider=sandbox.worker.provider;
 const factory=await root.createSubAccount('factory',{initialBalance:30n*N}),owner=await root.createSubAccount('founder',{initialBalance:100n*N}),operator=await root.createSubAccount('operator',{initialBalance:10n*N}),stranger=await root.createSubAccount('stranger');
 const factoryBytes=await fs.readFile(path.join(rootPath,'build/company_factory.wasm'));await factory.deploy(factoryBytes);
 const view=async(account,method,args={})=>{const r=await provider.viewCall(account.accountId||account,method,args,{finality:'final'});return JSON.parse(Buffer.from(r.result).toString());};
 async function call(actor,target,method,args={},deposit='0',success=true){const r=await actor.callRaw(target,method,args,{gas:method==='heartbeat'?'50000000000000':GAS,attachedDeposit:BigInt(deposit)}),hash=r.result.transaction.hash,raw=await provider.txStatus(hash,actor.accountId,'FINAL'),checked=validateFinalOutcome(raw,{hash,method,id:args.id||null},actor.accountId,target.accountId||target);receipts.push({...checked.tx,status:checked.status});assert.equal(checked.status,success?'final':'failed',method+' '+JSON.stringify(r.receiptFailures));return raw;}
 await call(root,factory,'init');assert.equal(await view(factory,'worker_service'),null);
 const worker=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).publicKey.export({type:'spki',format:'pem'}),workerId=sha(worker);
 const clock=()=>view(factory,'state').then(v=>BigInt(v.observed_at));
 const now=await clock(),serviceArgs={operator_id:operator.accountId,worker_public_key:worker,worker_key_id:workerId,service_expires_at:String(now+3600n)};
 await call(stranger,factory,'set_worker_service',serviceArgs,'0',false);
 await call(root,factory,'set_worker_service',{...serviceArgs,service_expires_at:String(now+172860n)},'0',false);
 await call(root,factory,'set_worker_service',{...serviceArgs,worker_key_id:'0'.repeat(64)},'0',false);
 await call(root,factory,'set_worker_service',serviceArgs);
 await call(root,factory,'set_worker_service',serviceArgs,'0',false);
 const service=await view(factory,'worker_service');assert.equal(service.schema,'near-founder-worker-service-v1');assert.equal(service.online,false);assert.equal(service.max_companies,8);assert.equal(service.max_reservations_per_company,2);assert.equal(service.max_reservations_global,16);assert.equal(service.cloud_billing_verified,false);assert.equal(service.tee_verified,false);checks.owner_pinned_service_immutable_bounded_model_and_expiry=true;
 const ownerKey=await owner.getKey(),ownerHex='00'+Buffer.from(ownerKey.getPublicKey().data).toString('hex'),template=await view(factory,'template'),info=await provider.viewAccount(factory.accountId),protocol=await provider.protocolConfig({finality:'final'});
 const config={operator:operator.accountId,supplier:operator.accountId,price:'1',fee:'1',reserve:'0',perJob:'1',daily:'1'};
 const context={network:'sandbox',factory:factory.accountId,creator:owner.accountId,factory_code_hash:info.code_hash,expected_factory_code_hash:info.code_hash,template_sha256:template.sha256,template_bytes:template.bytes,protocol_storage_byte_cost:protocol.runtime_config.storage_amount_per_byte};
 const request=(id,label=id)=>({id,creator:owner.accountId,label,owner_key_hex:ownerHex,config});
 assert.equal((await view(factory,'quote',request('offline'))).available,false);
 await call(stranger,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+60n)},'0',false);
 await call(operator,factory,'heartbeat',{worker_key_id:'0'.repeat(64),expires_at:String((await clock())+60n)},'0',false);
 await call(operator,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+900n)},'0',false);
 await call(operator,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+600n)});
 assert.equal((await view(factory,'worker_service')).online,true);assert.equal((await view(factory,'quote',request('active'))).available,true);
 const mismatched={...request('wrong'),config:{...config,operator:stranger.accountId}};assert.equal((await view(factory,'quote',mismatched)).available,false);checks.native_operator_heartbeat_ttl_and_quote_liveness=true;
 async function prepared(id,label=id){const req=request(id,label),quote=await view(factory,'quote',req);return {quote,action:await companyFactoryCreate(context,req,quote,{custody_ack:FACTORY_CUSTODY_ACK,original_key_hex:ownerHex})};}
 const active=await prepared('active');await call(owner,factory,'create',active.action.args,active.action.deposit);
 const record=await view(factory,'record',{id:'active'});assert.equal(record.phase,'active');const child=await view(record.child,'state');assert.equal(child.owner,owner.accountId);assert.equal(child.operator,operator.accountId);assert.equal((await provider.viewAccount(record.child)).code_hash,template.code_hash);checks.real_child_factory_owner_code_and_operator=true;
 const storage=String(16384n*BigInt(protocol.runtime_config.storage_amount_per_byte)),content={title:'Café founder',summary:'Owner-reviewed services for a local business.',items:[{text:'A clear service and an owner-approved next step.'}]};
 assert.equal(await view(factory,'site',{id:'active'}),null);
 await call(stranger,factory,'publish_site',{id:'active',expected_version:0,content},storage,false);
 await call(owner,factory,'publish_site',{id:'active',expected_version:0,content},'0',false);
 const storageBefore=(await view(factory,'state')).storage_collected;
 await call(owner,factory,'publish_site',{id:'active',expected_version:0,content},storage);
 let site=await view(factory,'site',{id:'active'});assert.equal(site.revision,1);assert.equal(site.status,'published');assert.deepEqual(site.content,content);assert.equal(site.storage_deposit,storage);assert.equal(site.content_sha256,sha(Buffer.from(JSON.stringify(content))));assert.equal((await view(factory,'state')).storage_collected,storageBefore,'Publication deposit must not double-retain factory request storage');
 await call(owner,factory,'publish_site',{id:'active',expected_version:0,content},'0',false);
 await call(stranger,factory,'publish_site',{id:'active',expected_version:1,content},'0',false);
 await call(owner,factory,'publish_site',{id:'active',expected_version:1,content},storage,false);
 for(const bad of [{...content,title:'<script>alert(1)</script>'},{...content,summary:'https://unapproved.example/'},{...content,summary:'secret_key: do-not-publish'},{...content,summary:'{"record_key":"synthetic-owner-recovery-value"}'},{...content,summary:'{"secret_key":"synthetic-never-a-wallet-key"}'},{...content,items:Array.from({length:8},()=>({text:'á'.repeat(1000)}))}])await call(owner,factory,'publish_site',{id:'active',expected_version:1,content:bad},'0',false);
 const revised={...content,title:'Café founder — revised'};await call(owner,factory,'publish_site',{id:'active',expected_version:1,content:revised});assert.equal((await view(factory,'site',{id:'active'})).revision,2);
 await call(stranger,factory,'unpublish_site',{id:'active',expected_version:2},'0',false);await call(owner,factory,'unpublish_site',{id:'active',expected_version:1},'0',false);
 await call(owner,factory,'unpublish_site',{id:'active',expected_version:2});site=await view(factory,'site',{id:'active'});assert.equal(site.revision,3);assert.equal(site.status,'unpublished');assert.equal(site.content,null);assert.equal(site.content_sha256,sha(Buffer.from(JSON.stringify(revised))));
 await call(owner,factory,'publish_site',{id:'active',expected_version:3,content:revised});assert.equal((await view(factory,'site',{id:'active'})).revision,4);checks.owner_publication_unicode_CAS_exact_storage_unsafe_text_and_unpublish_republish=true;
 const failed=[];
 for(let i=0;i<7;i++){
  await call(operator,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+600n)});
  await factory.createSubAccount('occupied'+i,{initialBalance:N});const p=await prepared('failed'+i,'occupied'+i);await call(owner,factory,'create',p.action.args,p.action.deposit,false);assert.equal((await view(factory,'record',{id:'failed'+i})).phase,'create_failed');failed.push(p);
 }
 assert.equal((await view(factory,'state')).count,8);assert.equal((await view(factory,'quote',request('ninth'))).available,false);
 const retry=companyFactoryRecovery(context,await view(factory,'record',{id:'failed0'}),'retry_create',{custody_ack:FACTORY_CUSTODY_ACK,original_key_hex:ownerHex});await call(owner,factory,'retry_create',retry.args,'0',false);assert.equal((await view(factory,'record',{id:'failed0'})).create_attempt,2);checks.eight_record_cap_and_existing_known_failure_retry_at_capacity=true;
 const expiry=BigInt((await view(factory,'worker_service')).heartbeat_expires_at);await provider.fastForward(720);
 for(let i=0;i<20&&BigInt((await view(factory,'worker_service')).observed_at)<expiry;i++)await new Promise(r=>setTimeout(r,100));
 const offline=await view(factory,'worker_service');assert.ok(BigInt(offline.observed_at)>=expiry);assert.equal(offline.online,false);
 await call(owner,factory,'publish_site',{id:'active',expected_version:4,content:revised});assert.equal((await view(factory,'site',{id:'active'})).revision,5);
 await call(owner,factory,'retry_create',retry.args,'0',false);assert.equal((await view(factory,'record',{id:'failed0'})).create_attempt,2);
 await call(owner,factory,'claim_refund',{id:'failed0'});assert.equal((await view(factory,'record',{id:'failed0'})).phase,'refunded');checks.expired_service_refuses_new_retry_but_preserves_original_owner_refund=true;
 await call(operator,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+600n)});
 await call(root,factory,'set_freeze',{frozen:true});assert.equal((await view(factory,'worker_service')).online,false);
 await call(owner,factory,'unpublish_site',{id:'active',expected_version:5});assert.equal((await view(factory,'site',{id:'active'})).status,'unpublished');await call(owner,factory,'publish_site',{id:'active',expected_version:6,content:revised});assert.equal((await view(factory,'site',{id:'active'})).revision,7);
 await call(operator,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+60n)},'0',false);
 await call(root,factory,'set_freeze',{frozen:false});await provider.fastForward(4000);
 await call(operator,factory,'heartbeat',{worker_key_id:workerId,expires_at:String((await clock())+60n)},'0',false);assert.equal((await view(factory,'worker_service')).online,false);checks.freeze_and_finite_service_end_refuse_heartbeat=true;
 await call(owner,factory,'publish_site',{id:'active',expected_version:7,content:revised});assert.equal((await view(factory,'site',{id:'active'})).revision,8);checks.publication_control_and_original_refund_survive_service_expiry_and_factory_freeze=true;
 for(const p of sourceFiles)assert.equal(sha(await fs.readFile(path.join(rootPath,p))),pins[p]);
 await sandbox.close();sandbox=null;
 const heartbeat=receipts.filter(r=>r.method==='heartbeat'&&r.status==='final');
 const result={schema:1,result:'PASS',network:'actual isolated local NEAR sandbox',real_funds:false,public_chain_mutations:0,model_calls:0,checks,source_sha256:pins,factory_bytes:factoryBytes.length,template,heartbeat_fees:heartbeat.map(r=>({gas_burnt:r.gas_burnt,tokens_burnt:r.tokens_burnt})),receipts,teardown:'owned sandbox stopped'};
 await fs.writeFile(reportPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({result:'PASS',checks:Object.keys(checks).length,report:reportPath,heartbeat_fees:result.heartbeat_fees}));
}catch(error){await fs.writeFile(reportPath,JSON.stringify({schema:1,result:'FAIL',error:error.message,checks,source_sha256:pins,receipts},null,2)+'\n');throw error;}
finally{if(sandbox)await sandbox.close();await fs.rm(temporary,{recursive:true,force:true});}
