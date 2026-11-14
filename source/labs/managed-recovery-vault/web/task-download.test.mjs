import test from 'node:test';
import assert from 'node:assert/strict';
import {createVaultController,recoveryIdentity,digest} from './vault-controller.mjs';
import {recoverTask,PROFILE} from './qualified/source/web-chain/src/business-actions.js';
import {newRecordKey,encrypt} from './qualified/source/web-chain/src/crypto.js';
const company='company.testnet',owner='owner.testnet',code='1'.repeat(44),genesis='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b';
async function fixture(){
 const key=newRecordKey(),id='work_generated_download';
 const scope={profile:PROFILE,operation:'content_draft',brief:'Draft a factual offer.',context:'Synthetic fixture company.',sources:[{id:'company_facts',text:'The studio provides editing.'}],use_ai:false};
 const artifact={title:'Editing offer',summary:'Owner-reviewed editing service.',items:[{text:'Editing is available for owner review.',source_ids:['company_facts']}]};
 const payload={profile:PROFILE,operation:'content_draft',delivery:'private_artifact_only',sources:[{id:'company_facts',sha256:await digest(scope.sources[0].text)}],artifact,generation:{mode:'source_extract',model:null,cached:false}};
 const a=await encrypt(JSON.stringify(scope),key),b=await encrypt(JSON.stringify(payload),key);
 const task={id,status:'archived',operation:'content_draft',scope_hash:a.hash,encrypted_scope:a.envelope,evidence_hash:b.hash,encrypted_evidence:b.envelope};
 // Exact public business-ui download shape, generated with fresh synthetic data.
 const recovery={version:1,task_id:id,scope_hash:a.hash,record_key:key,network:'testnet',contract:company};
 return{task,recovery,artifact};
}
test('actual app task-download shape validates and decrypts through unchanged recoverTask',async()=>{
 const f=await fixture(),id=await recoveryIdentity(f.recovery,company);
 assert.equal(id.kind,'task');assert.equal(id.commitment,f.task.scope_hash);
 const result=await recoverTask(f.task,f.recovery,{companyId:company});assert.deepEqual(result.artifact,f.artifact);
});
test('task network qualification rejects sandbox/mainnet/null, unknown fields and foreign contract',async()=>{
 const f=await fixture();
 for(const network of ['sandbox','mainnet','',null])await assert.rejects(recoveryIdentity({...f.recovery,network},company),/Task recovery mismatch/);
 await assert.rejects(recoveryIdentity({...f.recovery,untrusted:'extra'},company),/shape mismatch/);
 await assert.rejects(recoveryIdentity({...f.recovery,contract:'foreign.testnet'},company),/Task recovery mismatch/);
 const {network,contract,...core}=f.recovery;assert.equal((await recoveryIdentity(core,company)).kind,'task');
});
test('generated original download is decrypted before save and restored with actual decoder',async()=>{
 const f=await fixture(),id=await recoveryIdentity(f.recovery,company);
 const binding={schema:1,network:'testnet',chain_id:'testnet',genesis_hash:genesis,company_id:company,owner,code_hash:code,record_id:id.record_id,commitment:id.commitment,kind:'task'};
 let identity=null,saved=null;const calls=[];
 const auth={configuration:{genesis_hash:genesis,companies:{[company]:code}},get identity(){return identity;},clear(){identity=null;},selectCompany(v){assert.equal(v,company);},async signIn(){identity={company_id:company,account_id:owner};},async restore(){identity={company_id:company,account_id:owner};},async logout(){identity=null;},async recovery(action,body){calls.push(action);if(action==='list')return{bindings:saved?[binding]:[]};if(action==='context')return{binding,context:{company_id:company,task_id:f.task.id,task:f.task}};if(action==='open')return{binding,recovery:saved};if(action==='save'){saved=body.recovery;assert.deepEqual(JSON.parse(saved),f.recovery);return{schema:1,saved:true,binding,kind:'task',record_id:id.record_id,commitment:id.commitment,vault_record:'a'.repeat(64),custody:'service-wrapped',wallet_native_storage:false};}throw Error('Unexpected action');}};
 const c=createVaultController({auth});await c.unlock({},owner,company);await c.importLegacy(structuredClone(f.recovery));
 assert.deepEqual(calls,['list','context','context','save']);assert.equal(c.snapshot().records[0].view.title,f.artifact.title);assert.ok(!JSON.stringify(c.snapshot()).includes(f.recovery.record_key));
 await c.lock();await c.restoreSession(owner,company);assert.equal(c.snapshot().records[0].opened,true);assert.equal(c.snapshot().records[0].view.title,f.artifact.title);
});
