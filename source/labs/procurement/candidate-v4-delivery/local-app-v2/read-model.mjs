// Bounded same-FINAL observation, without the fixture's supported-price assert.
// Mutation admission is deliberately separate from original-record inspection.
import {amount} from '../financial-fork/v4-quote.mjs';
import {policyHash} from '../financial-fork/v4-id.mjs';
import {assignmentPreview,canonical} from '../financial-fork/assignment-client.mjs';
import {verifyDelivery} from '../delivery-envelope.mjs';
import {inspectRegistryForRead} from './maintenance.mjs';
import {validateRegistryAggregate,validateJobInventory} from './read-invariants.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
export async function observeLocalRegistry(f){
 const h=(await f.provider.block({finality:'final'})).header,p=await f.provider.protocolConfig({blockId:h.hash});
 amount(p.runtime_config.storage_amount_per_byte,{positive:true});
 const when=(BigInt(h.timestamp_nanosec)/1000000000n).toString(),meta=await f.provider.viewAccount(f.registryId,{block_id:h.hash});
 check(meta.block_hash===h.hash&&meta.code_hash===f.pins.registry_code_hash,'Original same-FINAL registry code changed');
 const state=await f.view('registry_state',{},h.hash);check(amount(meta.amount)===amount(state.account_balance),'Same-FINAL account balance does not match registry ledger');
 return {environment:'ACTUAL_ISOLATED_LOCAL_NEAR',finality:'FINAL',chain_id:f.pins.chain_id,genesis_hash:f.pins.genesis_hash,block_hash:h.hash,height:h.height,observed_at:when,protocol:{chain_id:f.pins.chain_id,genesis_hash:f.pins.genesis_hash,block_hash:h.hash,height:h.height,observed_at:when,storage_amount_per_byte:p.runtime_config.storage_amount_per_byte,gas_price:h.gas_price,runtime_config:p.runtime_config},registry:{contract_id:f.registryId,code_hash:meta.code_hash,block_hash:h.hash,height:h.height,state}};
}
export async function readLocalState({f,accounts,policy,mid,jid,clientId,now,deriveDeliveryContext}){
 const o=await observeLocalRegistry(f),maintenance=inspectRegistryForRead(o,f.pins,now());
 const access=await f.provider.query({request_type:'view_access_key_list',account_id:f.registryId,block_id:o.block_hash});check(access.block_hash===o.block_hash&&access.keys.length===0,'Original keyless registry changed');
 const list=await f.view('list_mandates',{},o.block_hash);check(Array.isArray(list.items)&&list.next_index===null&&list.items.length===o.registry.state.mandate_count&&list.items.length<=8,'Complete original mandate inventory required');
 validateRegistryAggregate(o.registry.state,list.items,f.registryId);
 const m=list.items.find(x=>x.id===mid)??null;
 if(m){const direct=await f.view('mandate',{mandate_id:mid},o.block_hash);check(canonical(direct)===canonical(m),'Listed and directly checked original mandate disagree');check(m.owner===accounts.owner&&m.client_id===clientId&&m.id===mid,'Original company work identity changed');check(policy&&canonical(m.policy)===canonical(policy)&&m.policy_sha256===policyHash(f.registryId,mid,accounts.owner,policy),'Original policy changed');}
 const jobs=m?await f.view('list_jobs',{mandate_id:mid},o.block_hash):{items:[],next_index:null};check(Array.isArray(jobs.items)&&jobs.next_index===null&&jobs.items.length===(m?.job_count??0)&&jobs.items.length<=8,'Complete original job inventory required');
 if(m)validateJobInventory(m,jobs.items);
 const job=jobs.items.find(x=>x.id===jid)??null;
 if(job)check(job.mandate_id===mid&&job.id===jid&&job.scope_sha256===policy.steps[0].scope_sha256&&job.criteria_sha256===policy.steps[0].criteria_sha256,'Original job changed');
 const assignment=job?await f.view('assignment',{mandate_id:mid,job_id:jid},o.block_hash):null;
 if(assignment)check(assignment.assignment_sha256===job.assignment_sha256&&canonical(await assignmentPreview({context:assignment.context,source_evidence_sha256:assignment.source_evidence_sha256,text:assignment.text}))===canonical(assignment),'Original assignment changed');
 const delivery=job?await f.view('delivery_record',{mandate_id:mid,job_id:jid},o.block_hash):null;
 if(delivery){check(delivery.envelope_sha256===job.delivery_sha256,'Original output commitment changed');await verifyDelivery(delivery,{expectedContext:{...await deriveDeliveryContext(m,job),content_sha256:delivery.context.content_sha256},recipientPolicy:policy.recipient_policy});}
 return {o,m,job,assignment,delivery,maintenance};
}
