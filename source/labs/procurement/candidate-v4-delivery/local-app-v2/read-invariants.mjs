// Contradictory reads are rejected, never relabelled as maintenance.
import {amount,sha,PROFILE,SUPPORTED_STORAGE_BYTE_COST} from '../financial-fork/v4-quote.mjs';
import {mandateId,policyHash} from '../financial-fork/v4-id.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const money=['available','escrow','owner_credit','provider_credit','transfer_pending','owner_paid','provider_paid'];
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v,min,max,m)=>check(Number.isSafeInteger(v)&&v>=min&&v<=max,m);
const sum=(rows,key)=>rows.reduce((n,r)=>n+amount(r[key]),0n);
const open=new Set(['open','awarded','claimed','delivered']);
const terminal=new Set(['accepted','paid','cancelled','expired','refunded','timed_out']);
export function validateMandateRecord(m,registryId){
 check(m&&m.policy&&m.id===mandateId(m.owner,m.client_id)&&m.policy_sha256===policyHash(registryId,m.id,m.owner,m.policy),'Original mandate identity/policy changed');
 check(amount(m.funded)===money.reduce((n,k)=>n+amount(m[k]),0n)&&m.funded===m.policy.lifetime,'Mandate money/funding conservation mismatch');
 check(typeof m.closed==='boolean'&&typeof m.frozen==='boolean'&&typeof m.pending_transfer==='string','Explicit original mandate state required');
 integer(m.slot_count,1,8,'Bounded original slots required');integer(m.job_count,0,m.slot_count,'Bounded original job count required');integer(m.open_jobs,0,m.job_count,'Bounded original open count required');integer(m.owner_intents,0,8,'Bounded original owner intents required');
 check(m.slot_count===Math.min(8,m.policy.steps.length*m.policy.max_cycles)&&m.unassigned_slots===m.slot_count-m.job_count,'Permanent original prepaid slots mismatch');
 let allocated=0n,remaining=0n;for(const b of ['base','assignment','delivery']){const a=amount(m[b+'_allocation_bytes']),r=amount(m[b+'_remaining_bytes']);check(r<=a,'Original bucket remaining exceeds allocation');allocated+=a;remaining+=r;}
 check(amount(m.storage_allocation_bytes)===allocated&&amount(m.storage_remaining_bytes)===remaining,'Mandate storage bucket conservation mismatch');
 check(amount(m.base_allocation_bytes)>=73728n&&(amount(m.base_allocation_bytes)-73728n)%1280n===0n&&amount(m.assignment_allocation_bytes)===BigInt(m.slot_count)*12288n&&amount(m.delivery_allocation_bytes)===BigInt(m.slot_count)*20480n,'Original prepaid storage allocation changed');
 check(amount(m.storage_collected)===allocated*BigInt(SUPPORTED_STORAGE_BYTE_COST),'Mandate collected storage mismatch');
 check(amount(m.lifetime_awarded)<=amount(m.policy.lifetime)&&amount(m.day_awarded)<=amount(m.lifetime_awarded)&&amount(m.day_awarded)<=amount(m.policy.daily),'Original award budget totals changed');
 check((amount(m.transfer_pending)===0n)===(m.pending_transfer===''),'Original pending transfer facts contradict');amount(m.transfer_count);
}
export function validateRegistryAggregate(registry,mandates,registryId){
 check(mandates.length===registry.mandate_count&&new Set(mandates.map(m=>m.id)).size===mandates.length,'Complete unique original mandate inventory required');
 for(const m of mandates)validateMandateRecord(m,registryId);
 for(const k of ['funded',...money])check(amount(registry[k])===sum(mandates,k),'Registry/mandate aggregate money mismatch: '+k);
 check(amount(registry.storage_collected)===sum(mandates,'storage_collected')&&amount(registry.allocated_bytes)===sum(mandates,'storage_allocation_bytes')&&amount(registry.reserved_unused_bytes)===sum(mandates,'storage_remaining_bytes'),'Registry/mandate aggregate storage mismatch');
}
export function validateJobInventory(m,jobs){
 check(jobs.length===m.job_count&&new Set(jobs.map(j=>j.id)).size===jobs.length,'Complete unique original job inventory required');
 let assignedA=BigInt(m.unassigned_slots)*12288n,assignedD=BigInt(m.unassigned_slots)*20480n,escrow=0n,credit=0n,paid=0n,awarded=0n,openCount=0;
 for(const j of jobs){
  const step=m.policy.steps.find(s=>s.id===j.step_id);integer(j.cycle,0,m.policy.max_cycles-1,'Original bounded job cycle required');
  check(step&&j.mandate_id===m.id&&j.id===j.step_id+'_'+j.cycle&&j.kind===step.kind&&j.scope_sha256===step.scope_sha256&&j.criteria_sha256===step.criteria_sha256,'Original job scope/identity changed');
  check(open.has(j.status)||terminal.has(j.status),'Original job status unsupported');integer(j.intents,0,2,'Bounded original provider intents required');
  const price=amount(j.price),c=amount(j.credit),p=amount(j.paid);check(c<=price&&p<=price&&c+p<=price,'Original job credit/payment exceeds price');
  check(amount(j.assignment_remaining_bytes)<=12288n&&amount(j.delivery_remaining_bytes)<=20480n,'Original per-job storage quota exceeded');assignedA+=amount(j.assignment_remaining_bytes);assignedD+=amount(j.delivery_remaining_bytes);
  if(price===0n)check(j.provider===null&&['open','cancelled','expired'].includes(j.status)&&c===0n&&p===0n,'Unawarded job payment facts contradict');
  else check(m.policy.providers.includes(j.provider)&&price<=amount(m.policy.per_job),'Original provider/price changed');
  if(['accepted','paid'].includes(j.status)){
   check(price>0n&&hash(j.assignment_sha256)&&hash(j.delivery_sha256)&&hash(j.dependency_sha256)&&hash(j.bid_sha256),'Original accepted job commitments required');
   check(j.award_approval_sha256===sha(JSON.stringify([PROFILE,m.id,m.policy_sha256,j.id,j.assignment_sha256,j.bid_sha256,j.dependency_sha256,m.owner]))&&j.acceptance_sha256===sha(JSON.stringify([PROFILE,m.id,m.policy_sha256,j.id,j.assignment_sha256,j.provider,j.price,j.delivery_sha256,j.award_approval_sha256,m.owner])),'Original owner award/acceptance changed');
   if(j.status==='paid')check(p===price&&c===0n&&typeof j.transfer_id==='string'&&j.transfer_id.length>0&&j.intents>0,'Paid job must have exact positive price/payment and no credit');
   else check(p===0n&&(c===price||(c===0n&&j.transfer_id===m.pending_transfer&&amount(m.transfer_pending)===price)),'Accepted job credit/pending transfer facts contradict');
  }else check(c===0n&&p===0n,'Unaccepted job payment facts contradict');
  if(open.has(j.status))openCount++;if(['awarded','claimed','delivered'].includes(j.status))escrow+=price;credit+=c;paid+=p;awarded+=price;
 }
 check(assignedA===amount(m.assignment_remaining_bytes)&&assignedD===amount(m.delivery_remaining_bytes),'Assigned/unassigned job storage mismatch');
 check(openCount===m.open_jobs&&escrow===amount(m.escrow)&&credit===amount(m.provider_credit)&&paid===amount(m.provider_paid)&&awarded===amount(m.lifetime_awarded),'Original job/mandate accounting mismatch');
}
