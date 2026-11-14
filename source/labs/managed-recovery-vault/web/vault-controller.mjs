import {recoverTask} from './qualified/source/web-chain/src/business-actions.js';
import {recoverFounderBrief} from './qualified/source/web-chain/src/founder-journey-core.js';

const GENESIS='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b';
const SHA=/^[a-f0-9]{64}$/,KEY=/^[A-Za-z0-9_-]{43}$/;
const fields=['schema','network','chain_id','genesis_hash','company_id','owner','code_hash','record_id','commitment','kind'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>{if(!object(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))throw Error('Private response shape mismatch');};
const same=(a,b)=>fields.every(k=>a[k]===b[k]);
export async function digest(value){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const recordId=(kind,id)=>digest('recovery-id-v1\0'+kind+'\0'+id);
export function serializeRecovery(value){if(!object(value))throw Error('Private recovery object required');const raw=JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])));if(new TextEncoder().encode(raw).length>16384)throw Error('Private recovery exceeds bound');return raw;}
export function parseRecoveryText(value){if(typeof value!=='string'||value.length<2||new TextEncoder().encode(value).length>16384)throw Error('Bounded private recovery JSON string required');const parsed=JSON.parse(value);if(!object(parsed))throw Error('Private recovery object required');return parsed;}
export function validateBinding(value,{configuration,identity}){
 exact(value,fields);
 if(value.schema!==1||value.network!=='testnet'||value.chain_id!=='testnet'||value.genesis_hash!==GENESIS||configuration?.genesis_hash!==GENESIS||value.company_id!==identity?.company_id||value.owner!==identity?.account_id||value.code_hash!==configuration.companies[value.company_id]||!SHA.test(value.record_id)||!SHA.test(value.commitment)||!['mission','task','mandate','inbox'].includes(value.kind))throw Error('Private record identity mismatch');
 return Object.freeze({...value});
}
export async function recoveryIdentity(recovery,company){
 if(!object(recovery))throw Error('Unsupported private recovery');
 if(recovery.schema==='business-is-near-mission-recovery-v1'){
  exact(recovery,['schema','network','company_id','owner','idea_hash','goal_hash','record_key']);
  if(recovery.network!=='testnet'||recovery.company_id!==company||!SHA.test(recovery.idea_hash)||!SHA.test(recovery.goal_hash)||!KEY.test(recovery.record_key))throw Error('Mission recovery mismatch');
  return{kind:'mission',actual_id:company,record_id:await recordId('mission',company),commitment:await digest('mission-commit-v1\0'+recovery.idea_hash+'\0'+recovery.goal_hash)};
 }
 const names=['version','task_id','scope_hash','record_key',...(Object.hasOwn(recovery,'contract')?['contract']:[])];exact(recovery,names);
 if(recovery.version!==1||typeof recovery.task_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(recovery.task_id)||!SHA.test(recovery.scope_hash)||!KEY.test(recovery.record_key)||Object.hasOwn(recovery,'contract')&&recovery.contract!==company)throw Error('Task recovery mismatch');
 return{kind:'task',actual_id:recovery.task_id,record_id:await recordId('task',recovery.task_id),commitment:recovery.scope_hash};
}
export function createVaultController({auth,onChange=()=>{},openTask=recoverTask,openMission=recoverFounderBrief}){
 let epoch=0,company=null,owner=null,bindings=[],notice='',busy=false;const ram=new Map();
 const scrub=()=>{for(const row of ram.values())if(row.recovery)row.recovery.record_key='';ram.clear();bindings=[];};
 const snapshot=()=>{if(!auth.identity)scrub();return{company,owner,authenticated:!!auth.identity,busy,notice,records:bindings.map(binding=>({binding,opened:ram.has(binding.record_id),view:ram.get(binding.record_id)?.view??null}))};};
 const emit=()=>onChange(snapshot());
 function invalidate(){epoch++;scrub();auth.clear();busy=false;notice='Private memory cleared. Unlock again to restore work.';emit();}
 const ticket=()=>({epoch,company,owner,identity:auth.identity});
 function current(t){if(t.epoch!==epoch||t.company!==company||t.owner!==owner||t.identity!==auth.identity)throw Error('Private owner changed');}
 const env=()=>({configuration:auth.configuration,identity:auth.identity});
 function checked(value,t){current(t);return validateBinding(value,env());}
 async function openChecked(binding,t,recoveryOverride=null){
  let recovery=recoveryOverride;
  if(!recovery){const reply=await auth.recovery('open',{kind:binding.kind,record_id:binding.record_id,commitment:binding.commitment});current(t);exact(reply,['recovery','binding']);if(!same(checked(reply.binding,t),binding))throw Error('Opened binding mismatch');recovery=parseRecoveryText(reply.recovery);}
  const id=await recoveryIdentity(recovery,company);current(t);
  if(id.kind!==binding.kind||id.record_id!==binding.record_id||id.commitment!==binding.commitment)throw Error('Recovery commitment mismatch');
  const response=await auth.recovery('context',{kind:id.kind,record_id:id.record_id,commitment:id.commitment,actual_id:id.actual_id});current(t);exact(response,['binding','context']);if(!same(checked(response.binding,t),binding))throw Error('Context binding mismatch');
  const context=response.context;let view;
  if(id.kind==='task'){
   exact(context,['company_id','task_id','task']);if(context.company_id!==company||context.task_id!==id.actual_id||context.task?.id!==id.actual_id||context.task.scope_hash!==id.commitment)throw Error('Task context mismatch');
   const result=await openTask(context.task,recovery,{companyId:company});current(t);
   if(!object(result?.artifact)||typeof result.artifact.title!=='string'||typeof result.artifact.summary!=='string'||!Array.isArray(result.artifact.items)||result.artifact.items.some(x=>typeof x.text!=='string'))throw Error('Unsupported opened task presentation');
   view={type:'task',title:result.artifact.title,text:result.artifact.summary,items:result.artifact.items.map(x=>x.text)};
  }else{
   exact(context,['company_id','company']);if(context.company_id!==company||recovery.owner!==owner)throw Error('Mission owner mismatch');
   const result=await openMission(recovery,{owner,companyId:company,company:context.company});current(t);view={type:'mission',title:result.name,text:result.goal,items:[]};
  }
  return{recovery,view};
 }
 async function refresh(){
  if(!auth.identity)throw Error('Unlock first');const t=ticket();busy=true;notice='Restoring matching private work into this tab…';emit();
  try{
   const result=await auth.recovery('list',{});current(t);exact(result,['bindings']);if(!Array.isArray(result.bindings)||result.bindings.length>32)throw Error('Unbounded record list');
   const seen=new Set();const next=result.bindings.map(value=>{const b=checked(value,t);if(seen.has(b.record_id))throw Error('Duplicate private record');seen.add(b.record_id);return b;});scrub();bindings=next;
   let opened=0,unopened=0;
   for(const binding of bindings){if(!['mission','task'].includes(binding.kind)){unopened++;continue;}try{const value=await openChecked(binding,t);current(t);ram.set(binding.record_id,value);opened++;}catch{current(t);unopened++;}}
   notice=bindings.length?`${opened} private record(s) opened in memory.`+(unopened?' Some records could not be opened; no spending action was taken.':''):'This vault is empty. Older work needs a one-time private import by its owner.';
  }finally{if(t.epoch===epoch){busy=false;emit();}}
 }
 return Object.freeze({snapshot,invalidate,
  async unlock(wallet,nextOwner,nextCompany){invalidate();company=nextCompany;owner=nextOwner;auth.selectCompany(company);const n=epoch;busy=true;notice='Approve only the wallet sign-in message. No transaction or key grant.';emit();try{await auth.signIn(wallet,owner);if(n!==epoch)throw Error('Owner changed');await refresh();}catch(error){if(n===epoch){scrub();auth.clear();notice='Private unlock did not complete. Check the owner and try an explicit unlock again.';}throw error;}finally{if(n===epoch){busy=false;emit();}}},
  async restoreSession(nextOwner,nextCompany){invalidate();company=nextCompany;owner=nextOwner;auth.selectCompany(company);const n=epoch;await auth.restore(owner);if(n!==epoch)throw Error('Owner changed');await refresh();},
  refresh,
  async importLegacy(recovery){if(!auth.identity)throw Error('Unlock first');const t=ticket();busy=true;notice='Checking the selected legacy recovery against its original chain record…';emit();try{
   const id=await recoveryIdentity(recovery,company);current(t);const response=await auth.recovery('context',{kind:id.kind,record_id:id.record_id,commitment:id.commitment,actual_id:id.actual_id});current(t);exact(response,['binding','context']);const binding=checked(response.binding,t);if(binding.kind!==id.kind||binding.record_id!==id.record_id||binding.commitment!==id.commitment)throw Error('Import binding mismatch');
   // Decrypt and validate before submitting recovery material for managed custody.
   const opened=await openChecked(binding,t,recovery);current(t);
   const recoveryText=serializeRecovery(recovery);const saved=await auth.recovery('save',{kind:id.kind,record_id:id.record_id,commitment:id.commitment,recovery:recoveryText});current(t);exact(saved,['schema','saved','binding','kind','record_id','commitment','vault_record','custody','wallet_native_storage']);
   if(saved.schema!==1||saved.saved!==true||saved.kind!==id.kind||saved.record_id!==id.record_id||saved.commitment!==id.commitment||!SHA.test(saved.vault_record)||saved.custody!=='service-wrapped'||saved.wallet_native_storage!==false||!same(checked(saved.binding,t),binding))throw Error('Vault did not acknowledge exact custody');
   if(!bindings.some(b=>b.record_id===binding.record_id))bindings.push(binding);ram.set(binding.record_id,opened);notice='Original private work opened and saved in the managed vault. Routine restore needs no file download.';
  }finally{if(t.epoch===epoch){busy=false;emit();}}},
  async lock(){epoch++;scrub();busy=false;company=null;owner=null;notice='Private memory cleared.';emit();await auth.logout();emit();},
 });
}
