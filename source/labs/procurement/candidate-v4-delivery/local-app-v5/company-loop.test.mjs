import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyLoop,companyInput,PRICE,MODEL,deterministicCompletionMock} from './company-loop.mjs';
import {createPlanner} from './planner-transport.mjs';
import {companyCommand} from './company-api.mjs';
const owner='a'.repeat(64),operator='b'.repeat(64),provider='c'.repeat(64),mid='d'.repeat(64),jid='proofread_0';
const input={name:'Harbor Studio',goal:'Prepare a factual offer for owner review',facts:'One-hour photography session with five edited images.',budget:'400000000000000000000000'};
const fresh=extra=>createCompanyLoop({owner,operator,provider,mandateId:mid,jobId:jid,...extra});
async function approved(extra){const loop=fresh(extra);const p=await loop.propose(input);loop.approve({plan_sha256:p.proposal.plan_sha256,ack:'APPROVE_EXACT_PLAN_LIMITS_PUBLIC_BRIEF'});return loop;}
function trustedTerminal(loop){
 // Explicit synthetic seam fixture: the real server obtains this shape only
 // after V2's same-FINAL ledger/crypto/original-transaction/receipt validation.
 const p=loop.approvedPlan(),policy={...loop.policyOverrides(),operator,providers:[provider],recipient_policy:{owner:{account_id:owner,key_id:'original-owner-public-key'},worker:{account_id:operator,key_id:'original-worker-public-key'}}};loop.bindNativePolicy(policy);
 const actions=['create','post','share','bid','award','claim','deliver','accept','pay','close','refund'],methods=['create_mandate','post_job','publish_assignment','bid','approve_award','claim','deliver_encrypted','accept','withdraw_provider','close_mandate','withdraw_owner'],roles=[owner,operator,owner,provider,owner,provider,provider,owner,provider,owner,owner];
 const requests=actions.map((action,i)=>{const hash='123456789ABCDEFG'[i].repeat(44);return{request_id:'synthetic-'+i,action,status:'final',hash,checked:{status:'final',tx:{hash,method:methods[i],job_id:['share','bid','award','claim','deliver','accept','pay'].includes(action)?jid:null,signer:roles[i],receiver:'registry.test.near'}}};});
 requests[8].principal={recipient:provider,amount:PRICE,receipt_id:'7'.repeat(44)};requests[10].principal={recipient:owner,amount:(BigInt(input.budget)-BigInt(PRICE)).toString(),receipt_id:'8'.repeat(44)};
 return{environment:'ACTUAL_ISOLATED_LOCAL_NEAR',accounts:{owner,operator,proofreader:provider},pins:{registry_id:'registry.test.near'},m:{id:mid,owner,policy,closed:true,owner_credit:'0',available:'0',escrow:'0',provider_credit:'0',transfer_pending:'0',pending_transfer:'',funded:input.budget,provider_paid:PRICE,owner_paid:(BigInt(input.budget)-BigInt(PRICE)).toString()},job:{id:jid,mandate_id:mid,provider,status:'paid',price:PRICE,paid:PRICE,credit:'0',assignment_sha256:'e'.repeat(64),delivery_sha256:'f'.repeat(64)},assignment:{text:p.public_brief,source_evidence_sha256:p.scope_sha256,assignment_sha256:'e'.repeat(64)},delivery:{envelope_sha256:'f'.repeat(64),context:{content_sha256:'1'.repeat(64)}},requests,final:{hash:'9'.repeat(44),height:123}};
}
test('goal produces typed advisory queue; approval commits exact owner limits before policy preparation',async()=>{
 const loop=fresh();assert.throws(()=>loop.policyOverrides(),/Approve/);const p=await loop.propose(input);assert.equal(p.planner.backend,'deterministic_api_contract_mock');assert.equal(p.planner.actual_model_calls,0);assert.equal(p.queue.filter(t=>t.execution==='native_procurement').length,1);assert.equal(p.recurrence,'not_implemented');assert.equal(p.approved,null);
 assert.throws(()=>loop.approve({plan_sha256:'f'.repeat(64),ack:'APPROVE_EXACT_PLAN_LIMITS_PUBLIC_BRIEF'}),/exact/);loop.approve({plan_sha256:p.proposal.plan_sha256,ack:'APPROVE_EXACT_PLAN_LIMITS_PUBLIC_BRIEF'});const policy=loop.policyOverrides();assert.equal(policy.plan_sha256,p.proposal.plan_sha256);assert.equal(policy.lifetime,input.budget);assert.equal(policy.per_job,PRICE);assert.equal(policy.max_cycles,1);assert.equal(policy.max_open,1);await assert.rejects(loop.propose({...input,goal:'Changed goal'}),/single original/);
});
test('advisory completion cannot change routes, add money/authority, create extra work or omit a typed task',async()=>{
 for(const mutate of [x=>x.tasks[1].kind='withdraw_owner',x=>x.tasks.push(x.tasks[1]),x=>x.tasks[1].price='1',x=>x.tasks[0].id='untrusted',x=>x.execute=true]){
  const loop=fresh({complete:async request=>{const c=await deterministicCompletionMock(request),x=JSON.parse(c.choices[0].message.content);mutate(x);c.choices[0].message.content=JSON.stringify(x);return c;}});await assert.rejects(loop.propose(input));assert.equal(loop.read().proposal,null);assert.equal(loop.read().approved,null);
 }
});
test('bounded owner inputs reject hidden fields, unsupported budgets and obvious secret-shaped text',()=>{
 for(const x of [{...input,private_key:'secret'},{...input,budget:'1'},{...input,budget:'100000000000000000000000'},{...input,facts:'api_key=synthetic'},{...input,name:'x'.repeat(81)}])assert.throws(()=>companyInput(x));
});
test('public brief cannot change after plan approval or drift from its exact source commitment',async()=>{
 const loop=await approved(),p=loop.approvedPlan();loop.requireBrief({text:p.public_brief,source_evidence_sha256:p.scope_sha256});assert.throws(()=>loop.requireBrief({text:p.public_brief+' changed',source_evidence_sha256:p.scope_sha256}));assert.throws(()=>loop.requireBrief({text:p.public_brief,source_evidence_sha256:'0'.repeat(64)}));
});
test('same completion includes an unverified draft; changing draft changes approval and human brief commitments',async()=>{
 const a=await approved(),p=a.approvedPlan();assert.equal(p.draft_status,'unverified_owner_factual_review_required');assert.ok(p.public_brief.includes(p.draft.text));assert.ok(p.public_brief.includes(input.facts));
 const b=await approved({complete:async request=>{const c=await deterministicCompletionMock(request),x=JSON.parse(c.choices[0].message.content);x.draft.text='A changed, unverified offer for owner review.';c.choices[0].message.content=JSON.stringify(x);return c;}});assert.notEqual(b.approvedPlan().plan_sha256,p.plan_sha256);assert.notEqual(b.approvedPlan().scope_sha256,p.scope_sha256);
 const state=trustedTerminal(a),linked=a.reconcileVerifiedState(state).completion;assert.equal(linked.output_content_sha256,state.delivery.context.content_sha256);assert.match(linked.planner_draft_sha256,/^[a-f0-9]{64}$/);
});
test('only original settled terminal evidence links one company task and unlocks a suggestion, never authority',async()=>{
 const loop=await approved(),s=trustedTerminal(loop),out=loop.reconcileVerifiedState(s);assert.equal(out.completion.task_id,'review_offer');assert.equal(out.completion.provider_paid,PRICE);assert.equal(out.completion.owner_returned,s.m.owner_paid);assert.equal(out.completion.new_work_authorized,false);assert.equal(out.queue[2].status,'suggested_next_requires_new_approval');assert.equal(out.completion.original_transactions.length,11);s.final.height++;s.final.hash='A'.repeat(44);assert.deepEqual(loop.reconcileVerifiedState(s).completion,out.completion);
});
for(const [name,mutate]of [
 ['accepted-but-unpaid',s=>{s.job.status='accepted';s.job.paid='0';}],
 ['unknown native transfer',s=>{s.m.transfer_pending=PRICE;s.m.pending_transfer='original';}],
 ['wrong original recipient',s=>s.requests[8].principal.recipient=owner],
 ['wrong principal amount',s=>s.requests[10].principal.amount='1'],
 ['foreign delivery commitment',s=>s.delivery.envelope_sha256='0'.repeat(64)],
 ['foreign company goal',s=>s.m.policy.goal_id='foreign'],
 ['replaced decryption recipient',s=>s.m.policy.recipient_policy.owner.key_id='replaced'],
 ['larger owner budget',s=>s.m.policy.lifetime='999999999999999999999999'],
 ['missing original transaction',s=>s.requests.pop()],
 ['unknown original journal',s=>{s.requests[6].status='unknown';delete s.requests[6].checked;}],
 ['failed original transaction',s=>s.requests[6].checked.status='failed'],
 ['foreign signer or destination',s=>s.requests[8].checked.tx.receiver='elsewhere.near'],
 ['conflicting original observation',s=>s.requests[8].inspection_conflict=true],
])test('company result refuses '+name+' without marking task complete',async()=>{const loop=await approved(),s=trustedTerminal(loop);mutate(s);assert.throws(()=>loop.reconcileVerifiedState(s));assert.equal(loop.read().completion,null);assert.equal(loop.read().queue[2].status,'blocked_by_review_settlement');});
test('two simultaneous proposals cannot race an approval or substitute the approved plan',async()=>{
 let release;const loop=fresh({complete:request=>new Promise(resolve=>release=async()=>resolve(await deterministicCompletionMock(request)))});const first=loop.propose(input);await assert.rejects(loop.propose({...input,name:'Different'}),/single original/);assert.throws(()=>loop.approve({plan_sha256:'a'.repeat(64),ack:'APPROVE_EXACT_PLAN_LIMITS_PUBLIC_BRIEF'}));await release();await first;assert.equal(loop.read().proposal.company_name,input.name);
});
test('finite local Gemma adapter has one attempt, pinned model/token cap and no Cloud/key/redirect',async()=>{
 let calls=0;const adapter=createPlanner({url:'http://127.0.0.1:11439/v1/chat/completions',fetchImpl:async(url,options)=>{calls++;const request=JSON.parse(options.body);assert.equal(request.model,MODEL);assert.equal(request.max_tokens,512);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');const c=await deterministicCompletionMock(request);return new Response(JSON.stringify({model:MODEL,choices:[{...c.choices[0],finish_reason:'stop'}]}));}});const loop=fresh({complete:adapter.complete,plannerProvenance:adapter.provenance});await loop.propose(input);assert.equal(calls,1);assert.equal(loop.read().planner.backend,'local_gemma_api_contract');assert.equal(loop.read().planner.completed_calls,1);await assert.rejects(loop.propose(input),/already attempted/);assert.equal(calls,1);
});
test('uncertain planner request is never retried and cannot claim zero actual calls or a plan',async()=>{
 let calls=0;const a=createPlanner({url:'http://127.0.0.1:11439/v1/chat/completions',fetchImpl:async()=>{calls++;throw Error('synthetic lost response');}}),loop=fresh({complete:a.complete,plannerProvenance:a.provenance});await assert.rejects(loop.propose(input),/lost response/);assert.equal(loop.read().proposal,null);assert.equal(a.provenance().actual_model_calls,null);assert.equal(a.provenance().original_call_unknown,true);await assert.rejects(loop.propose(input),/already attempted/);assert.equal(calls,1);
});
test('local planner refuses external endpoints, truncated responses, tool calls and oversized output',async()=>{
 for(const url of ['https://cloud-api.near.ai/v1/chat/completions','http://localhost:11439/v1/chat/completions','http://127.0.0.1:11439/v1/chat/completions?key=x'])assert.throws(()=>createPlanner({url}));
 for(const payload of [{model:MODEL,choices:[{finish_reason:'length',message:{role:'assistant',content:'{}'}}]},{model:MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}',tool_calls:[{name:'withdraw'}]}}]},'x'.repeat(16001)]){
  const a=createPlanner({url:'http://127.0.0.1:11439/v1/chat/completions',fetchImpl:async()=>new Response(typeof payload==='string'?payload:JSON.stringify(payload))});await assert.rejects(fresh({complete:a.complete}).propose(input));assert.equal(a.provenance().attempted_calls,1);
 }
});
test('company API preserves unresolved original guard before planning, approval or completion',async()=>{
 const loop=fresh();let reads=0;for(const pathname of ['/api/company/plan','/api/company/approve','/api/company/reconcile'])await assert.rejects(companyCommand({pathname,body:input,company:loop,requireReconciledReviews:()=>{throw Error('inspect original');},readVerifiedState:async()=>{reads++;}}),/inspect original/);assert.equal(loop.read().proposal,null);assert.equal(reads,0);
});
test('company API joins the plan and terminal result using only the injected verified reader',async()=>{
 const loop=fresh(),base={company:loop,requireReconciledReviews:()=>{}};const p=await companyCommand({...base,pathname:'/api/company/plan',body:input});await companyCommand({...base,pathname:'/api/company/approve',body:{plan_sha256:p.proposal.plan_sha256,ack:'APPROVE_EXACT_PLAN_LIMITS_PUBLIC_BRIEF'}});const s=trustedTerminal(loop);let reads=0;
 await assert.rejects(companyCommand({...base,pathname:'/api/company/reconcile',body:{state:s},readVerifiedState:async()=>{reads++;return s;}}),/no caller-supplied/);assert.equal(reads,0);assert.equal(loop.read().completion,null);
 const result=await companyCommand({...base,pathname:'/api/company/reconcile',body:{},readVerifiedState:async()=>{reads++;return s;}});assert.equal(reads,1);assert.equal(result.completion.delivery_sha256,s.job.delivery_sha256);assert.equal(result.completion.new_work_authorized,false);
});
