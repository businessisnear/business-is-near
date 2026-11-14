// One bounded company plan. Completion consumes only the server's separately
// validated original protocol observation, never a client-supplied receipt.
import {createHash} from 'node:crypto';
import {canonical} from '../financial-fork/assignment-client.mjs';
import {positiveUnsignedRefusal} from '../local-app-v2/pending-review.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(','),'Exact company fields required');
const hash=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
export const PRICE='100000000000000000000000';
export const MODEL='gemma4:e2b-it-q4_K_M';
const ACTIONS=['create','post','share','bid','award','claim','deliver','accept','pay','close','refund'];
const METHODS=['create_mandate','post_job','publish_assignment','bid','approve_award','claim','deliver_encrypted','accept','withdraw_provider','close_mandate','withdraw_owner'];
const ROLES=['owner','operator','owner','proofreader','owner','proofreader','proofreader','owner','proofreader','owner','owner'];
const text=(v,max)=>{check(typeof v==='string'&&v.trim()===v&&v.length>0&&new TextEncoder().encode(v).length<=max&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(v)&&v.isWellFormed(),'Bounded plain company text required');check(!/PRIVATE KEY|seed phrase|api[_ -]?key\s*[:=]|ed25519:[A-Za-z0-9]{70,}/i.test(v),'Do not enter secrets in company facts');return v;};
export function companyInput(value){
 exact(value,['name','goal','facts','budget']);
 check(['200000000000000000000000','300000000000000000000000','400000000000000000000000'].includes(value.budget),'Choose a bounded 0.2, 0.3 or 0.4 local NEAR budget');
 return{name:text(value.name,80),goal:text(value.goal,280),facts:text(value.facts,1200),budget:value.budget};
}
const TASKS=[['prepare_offer','draft_offer'],['review_offer','human_proofread'],['review_publication','publication_review']];
export const PLANNER_RESPONSE_SCHEMA={type:'object',additionalProperties:false,required:['draft','tasks'],properties:{draft:{type:'object',additionalProperties:false,required:['title','text'],properties:{title:{type:'string',minLength:1,maxLength:80},text:{type:'string',minLength:1,maxLength:500}}},tasks:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['id','kind','title','reason'],properties:{id:{type:'string',enum:TASKS.map(x=>x[0])},kind:{type:'string',enum:TASKS.map(x=>x[1])},title:{type:'string',minLength:1,maxLength:60},reason:{type:'string',minLength:1,maxLength:120}}}}}};
export function plannerRequest(input){return{model:MODEL,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:'Return JSON {draft:{title,text},tasks:[{id,kind,title,reason}]}. Write a concise offer draft ONLY from owner facts: title <=80 characters, text <=500. It is unverified until owner and human review. Include exactly three ordered tasks: prepare_offer/draft_offer, review_offer/human_proofread, review_publication/publication_review. Task titles <=60 and reasons <=120 characters. No invented facts, spending, tools or extra fields. Only human review may execute after separate owner approval.'},{role:'user',content:JSON.stringify(companyInput(input))}]};}
export async function deterministicCompletionMock(request){
 check(request.model===MODEL&&request.messages?.[1]?.role==='user','Expected local model API contract');
 const input=JSON.parse(request.messages[1].content);
 return{choices:[{message:{role:'assistant',content:JSON.stringify({draft:{title:'Offer draft for owner review',text:'Draft for review: '+input.facts.slice(0,100)},tasks:[
  {id:'prepare_offer',kind:'draft_offer',title:'Prepare the factual offer',reason:'The draft is unverified; the owner must compare it with the full facts.'},
  {id:'review_offer',kind:'human_proofread',title:'Ask a reviewer to check the offer',reason:'A separately approved reviewer can correct wording while preserving the facts.'},
  {id:'review_publication',kind:'publication_review',title:'Review the finished offer for publication',reason:'Publication needs a later owner decision after delivery and settlement.'}
 ]})}}]};
}
export function validatePlannerCompletion(completion){
 exact(completion,['choices']);check(Array.isArray(completion.choices)&&completion.choices.length===1,'One planner choice required');exact(completion.choices[0],['message']);const m=completion.choices[0].message;exact(m,['role','content']);check(m.role==='assistant'&&typeof m.content==='string'&&m.content.length<=6000,'Bounded planner message required');const x=JSON.parse(m.content);exact(x,['draft','tasks']);exact(x.draft,['title','text']);const draft={title:text(x.draft.title,80),text:text(x.draft.text,500)};check(Array.isArray(x.tasks)&&x.tasks.length===3,'Three typed suggestions required');
 const tasks=x.tasks.map((t,i)=>{exact(t,['id','kind','title','reason']);check(t.id===TASKS[i][0]&&t.kind===TASKS[i][1],'Planner cannot change execution routes');return{...t,title:text(t.title,60),reason:text(t.reason,120),execution:i===0?'advisory_draft':i===1?'native_procurement':'suggestion_only'};});return{draft,tasks};
}
export function createCompanyLoop({owner,operator,provider,mandateId,jobId,complete=deterministicCompletionMock,plannerProvenance=()=>({backend:'deterministic_api_contract_mock',model_contract:MODEL,attempted_calls:0,completed_calls:0,actual_model_calls:0,cloud_verified:false})}){
 let proposal=null,approved=null,completion=null,planning=false,nativePolicyHash=null;
 const read=({m=null,job=null}={})=>structuredClone({proposal,approved,completion,native_policy_public_json_sha256:nativePolicyHash,planner:plannerProvenance(),recurrence:'not_implemented',queue:proposal?.tasks.map(t=>({...t,status:t.id==='review_offer'?(completion?'settled_and_linked':approved?(job?'native_'+job.status:m?'funded_waiting_for_job':'approved_waiting_on_native_work'):'needs_owner_plan_approval'):t.id==='review_publication'?(completion?'suggested_next_requires_new_approval':'blocked_by_review_settlement'):(approved?'draft_approved_for_human_review':'draft_unverified_needs_owner_review')}))??[]});
 function approvedPlan(){check(approved&&proposal&&approved.plan_sha256===proposal.plan_sha256,'Approve the exact company plan and limits first');return structuredClone(proposal);}
 return{
  read,
  async propose(input){check(!approved&&!planning,'A single original approved plan is allowed in this run');planning=true;try{
   const value=companyInput(input),request=plannerRequest(value),{draft,tasks}=validatePlannerCompletion(await complete(request));
   const public_brief=`${value.name}\nGoal: ${value.goal}\nOwner-approved facts: ${value.facts}\nUnverified planner draft title: ${draft.title}\nUnverified planner draft: ${draft.text}\nTask: review this draft against the owner facts, remove unsupported claims and correct the wording. Do not invent prices, locations, contact details, testimonials or booking methods. Return the corrected offer for owner review.`;
   check(new TextEncoder().encode(public_brief).length<=3000,'Public brief exceeds the protocol bound');
   const body={schema:'bin-company-plan-v5',company_name:value.name,company_id:owner,goal:value.goal,goal_id:'goal_'+hash(value).slice(0,16),facts:value.facts,draft,draft_status:'unverified_owner_factual_review_required',public_brief,tasks,limits:{business_budget:value.budget,per_job:PRICE,max_jobs:1,max_cycles:1,max_open:1,automatic_spending:false},scope_sha256:hash(public_brief),criteria_sha256:hash(['check_draft_against_owner_facts','remove_unsupported_claims','correct_wording','owner_must_open_exact_delivery']),operator,provider,mandate_id:mandateId,job_id:jobId};
   proposal={...body,plan_sha256:hash(body)};return read();
  }finally{planning=false;}},
  approve(value){exact(value,['plan_sha256','ack']);check(!planning&&proposal&&!approved&&value.plan_sha256===proposal.plan_sha256&&value.ack==='APPROVE_EXACT_PLAN_LIMITS_PUBLIC_BRIEF','Read the exact plan, public brief and bounded limits before approval');approved={plan_sha256:value.plan_sha256,authority:'local_owner_review_then_separate_native_owner_funding',financial_authorization:false};return read();},
  approvedPlan,
  bindNativePolicy(policy){const p=approvedPlan();check(policy.plan_sha256===p.plan_sha256&&policy.company_id===owner&&policy.goal_id===p.goal_id,'Original company policy commitment required');const pinned=hash(policy);check(!nativePolicyHash||nativePolicyHash===pinned,'Original native recipients and policy cannot be replaced');nativePolicyHash=pinned;},
  policyOverrides(){const p=approvedPlan();return{company_id:owner,goal_id:p.goal_id,plan_sha256:p.plan_sha256,steps:[{id:'proofread',kind:'human_proofread',scope_sha256:p.scope_sha256,criteria_sha256:p.criteria_sha256}],per_job:PRICE,daily:p.limits.business_budget,lifetime:p.limits.business_budget,max_cycles:1,max_open:1};},
  requireBrief(packet){const p=approvedPlan();check(packet?.text===p.public_brief&&packet.source_evidence_sha256===hash(p.public_brief),'Exact approved company brief required');},
  reconcileVerifiedState(s){
   const p=approvedPlan();check(s&&s.environment==='ACTUAL_ISOLATED_LOCAL_NEAR'&&s.accounts.owner===owner&&s.accounts.operator===operator&&s.accounts.proofreader===provider,'Original company actors required');
   const {m,job,assignment,delivery}=s;check(m&&job&&assignment&&delivery&&m.id===mandateId&&job.id===jobId&&job.mandate_id===m.id&&m.owner===owner&&job.provider===provider,'Original company work records required');
   check(nativePolicyHash&&hash(m.policy)===nativePolicyHash,'Original prepared public recipients and full native policy required');
   check(m.policy.company_id===owner&&m.policy.goal_id===p.goal_id&&m.policy.plan_sha256===p.plan_sha256&&m.policy.operator===operator&&canonical(m.policy.providers)===canonical([provider])&&canonical(m.policy.steps)===canonical(this.policyOverrides().steps),'Original company plan/recipient binding changed');
   check(m.policy.lifetime===p.limits.business_budget&&m.policy.per_job===PRICE&&m.policy.max_cycles===1&&m.policy.max_open===1,'Original owner limits changed');
   check(job.status==='paid'&&job.price===PRICE&&job.paid===PRICE&&job.credit==='0'&&m.closed===true&&m.owner_credit==='0'&&m.available==='0'&&m.escrow==='0'&&m.provider_credit==='0'&&m.transfer_pending==='0'&&m.pending_transfer===''&&m.funded===p.limits.business_budget&&m.provider_paid===PRICE&&BigInt(m.owner_paid)===BigInt(m.funded)-BigInt(PRICE),'Native payment, callback and unused-budget return must all be settled');
   this.requireBrief(assignment);check(assignment.assignment_sha256===job.assignment_sha256&&delivery.envelope_sha256===job.delivery_sha256&&/^[a-f0-9]{64}$/.test(delivery.context?.content_sha256),'Original delivered output commitment changed');
   check(Array.isArray(s.requests),'Original request inventory required');const original=s.requests.filter(r=>!(positiveUnsignedRefusal(r,r)&&r.review_reset_acknowledged===true));check(original.length===ACTIONS.length&&new Set(original.map(r=>r.hash)).size===ACTIONS.length,'Complete unique original transaction inventory required');
   for(const [i,action]of ACTIONS.entries()){const rows=original.filter(r=>r.action===action),r=rows[0],actor=s.accounts[ROLES[i]];check(rows.length===1&&r.status==='final'&&r.checked?.status==='final'&&!r.inspection_conflict&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.hash)&&r.checked.tx?.hash===r.hash&&r.checked.tx.method===METHODS[i]&&r.checked.tx.signer===actor&&r.checked.tx.receiver===s.pins.registry_id&&r.checked.tx.job_id===(['share','bid','award','claim','deliver','accept','pay'].includes(action)?jobId:null),'Unresolved, failed or foreign original transaction blocks company completion');}
   const pay=original.find(r=>r.action==='pay'),refund=original.find(r=>r.action==='refund');
   check(pay.principal?.recipient===provider&&pay.principal.amount===PRICE&&typeof pay.principal.receipt_id==='string'&&pay.principal.receipt_id.length>0&&refund.principal?.recipient===owner&&refund.principal.amount===m.owner_paid&&typeof refund.principal.receipt_id==='string'&&refund.principal.receipt_id.length>0,'Exact original native principal receipts required');
   check(s.final&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.final.hash)&&Number.isSafeInteger(s.final.height),'Original FINAL observation required');
   const linked={schema:'bin-company-task-result-v5',plan_sha256:p.plan_sha256,company_id:owner,goal_id:p.goal_id,task_id:'review_offer',planner_draft_sha256:hash(p.draft),mandate_id:m.id,job_id:job.id,assignment_sha256:job.assignment_sha256,delivery_sha256:job.delivery_sha256,output_content_sha256:delivery.context.content_sha256,provider,provider_paid:job.paid,owner,owner_returned:m.owner_paid,final:completion?.final??s.final,original_transactions:original.map(r=>({action:r.action,hash:r.hash})),native_principal_receipts:[pay.principal,refund.principal],next_suggestion:'review_publication',new_work_authorized:false};
   if(completion)check(canonical(completion)===canonical(linked),'Original linked result is immutable; inspect changed evidence');else completion=structuredClone(linked);return read();
  }
 };
}
