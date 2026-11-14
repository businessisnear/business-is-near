// Owner UI only: prepares encrypted intents through the normal recovery review.
// It never signs, calls a model or persists plaintext. Selected result inputs
// require authenticated recovery and a separate exact owner review.
import {decrypt} from './crypto.js';
import {recoverTask} from './business-actions.js';
import {GOAL_OPERATIONS,goalTaskId,goalScope,validateGoalScope,selectedGoalScope,
 goalStepDependencies,prepareGoalPlan,prepareGoalStep,canonicalGoal} from './goal-plan-actions.js';
import {t,localizedError,translateMarked,languageName,formatUsdNanos,statusLabel,validateLocale} from './localization.js';
import {claimReviewPresentation} from './claim-review.js';

const names={research_summary:'Research summary',website_build:'Website draft',content_draft:'Content draft',support_draft:'Support draft',outreach_draft:'Outreach draft',social_draft:'Social draft',ads_draft:'Advertising draft',analytics_report:'Analytics report'};
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const same=(a,b)=>canonicalGoal(a)===canonicalGoal(b);
export function goalUiContextKey(state){return JSON.stringify([state.company?.contract??null,state.company?.treasury?.owner??null,state.account??null,state.locale??'en',state.manifest?.worker_key_id??null,state.manifest?.worker_public_key??null,state.profile?.version??null,state.pin??null,state.ready??false]);}

// Public status can establish that an approval exists, not that prose is true.
// Execution still authenticates each exact encrypted dependency in the worker.
export function goalStepReadiness(scope,payload,children,step,{owner,workerKey,profileVersion}){
 const item=payload.goal_plan.steps[step-1],id=item.task_id,required=goalStepDependencies(scope,payload,step),current=children.get(id);
 const valid=(record,index)=>!!record&&record.id===payload.goal_plan.steps[index-1].task_id&&record.kind==='general'&&record.approved_by===owner&&record.operation===payload.goal_plan.steps[index-1].operation&&record.worker_key_id===workerKey&&record.execution_profile_version===profileVersion&&!record.inbox_id&&!record.mandate_id&&record.not_before==='0'&&Array.isArray(record.dependencies)&&same(record.dependencies,goalStepDependencies(scope,payload,index))&&hash(record.scope_hash);
 if(current)return {state:valid(current,step)?'submitted':'conflict',id,status:current.status,missing:[],waiting:[]};
 const missing=[],waiting=[],conflicts=[];
 for(const index of item.depends_on){const dependency=payload.goal_plan.steps[index-1].task_id,record=children.get(dependency);if(!record)missing.push(dependency);else if(!valid(record,index))conflicts.push(dependency);else if(!['attested','archived'].includes(record.status))waiting.push(dependency);}
 return {state:conflicts.length?'conflict':missing.length?'missing':'ready',id,required,missing,waiting,conflicts};
}

export function createGoalPlanUI({getState,stage,notice,requireCompany,invalidateDraft,lockControl=()=>{},setControlDisabled=(control,value)=>{control.disabled=value;},readTask,
 mount=document.querySelector('[data-panel="work"]')}){
 if(!mount)return {update(){},clear(){}};
 if(typeof readTask!=='function')throw Error('A fixed-company FINAL task reader is required.');
 let policy=null,policyBlock=null,loaded=null,continuation=null,revision=0,operation=0,busy=false,stagedId=null;
 let identity=goalUiContextKey(getState()),observedEpoch=getState().epoch;const chosenPrior=new Map();
 const locale=()=>getState().locale??'en',tr=(key,params={})=>t(key,locale(),params);
 const el=(tag,attrs={},...children)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(key==='class')node.className=value;else if(key==='checked')node.checked=!!value;else if(key==='disabled')node.disabled=!!value;else node.setAttribute(key,String(value));}for(const child of children.flat())if(child!==undefined&&child!==null)node.append(child instanceof Node?child:document.createTextNode(String(child)));lockControl(node);return node;};
 const fixed=(tag,key,attrs={})=>el(tag,{'data-i18n':key,...attrs},tr(key));
 const literal=(tag,value,attrs={})=>el(tag,{'data-i18n-literal':'',...attrs},value);
 const field=(key,control)=>el('label',{},fixed('span',key),control);
 const randomId=()=>crypto.randomUUID().replaceAll('-','').slice(0,16);
 const planId=el('input',{id:'goal-plan-id',value:randomId(),maxlength:16,pattern:'[0-9a-f]{16}',required:''});
 const goal=el('textarea',{id:'goal-plan-goal',maxlength:400,required:'',rows:3,'data-i18n-placeholder':'Describe the business goal to decompose.'});
 const context=el('textarea',{id:'goal-plan-context',maxlength:600,required:'',rows:2});
 const facts=el('textarea',{id:'goal-plan-facts',maxlength:600,required:'',rows:3});
 const min=el('input',{id:'goal-plan-min',type:'number',min:1,max:4,value:2,required:''}),max=el('input',{id:'goal-plan-max',type:'number',min:1,max:4,value:3,required:''});
 const requireDependency=el('input',{id:'goal-plan-require-dependency',type:'checkbox',checked:true});
 const requestedLocale=el('select',{id:'goal-plan-locale'},el('option',{value:'en'},'English'),el('option',{value:'es'},'Spanish'));
 const planningConsent=el('input',{id:'goal-plan-ai-consent',type:'checkbox'}),priorConsent=el('input',{id:'goal-plan-prior-consent',type:'checkbox'});
 const priorList=el('div',{id:'goal-plan-prior-list'}),revisionLabel=el('p',{id:'goal-plan-revision',class:'hint'}),cost=el('p',{id:'goal-plan-policy',class:'hint'});
 const priorGroup=el('div',{id:'goal-plan-prior-group',hidden:''},fixed('h3','Referenced prior results'),priorList,field('Use these exact archived results’ bounded summaries as untrusted inputs to the next plan',priorConsent));
 const choices=el('div',{id:'goal-plan-allowed'}),allowed=new Map();
 for(const name of GOAL_OPERATIONS){const enabled=el('input',{type:'checkbox','data-goal-allowed':name}),ai=el('input',{type:'checkbox','data-goal-ai':name,disabled:true});allowed.set(name,{enabled,ai});choices.append(el('div',{class:'conversation-choice'},field(names[name],enabled),field('Allow inference only if this child is separately approved',ai)));}
 const prepare=fixed('button','Review encrypted goal plan',{type:'submit',id:'prepare-goal-plan',class:'button primary'});
 const form=el('form',{id:'goal-plan-form'},field('Public goal plan ID',planId),revisionLabel,field('Your private business goal',goal),field('Company context',context),field('Approved source facts',facts),
  fixed('h3','Permitted kinds of work'),choices,el('div',{class:'form-grid'},field('Minimum steps',min),field('Maximum steps',max)),field('Require at least one dependency between steps',requireDependency),
  field('Requested plan language',requestedLocale),fixed('p','The requested output language does not change the company language.',{class:'hint'}),priorGroup,
  field('Approve one bounded inference request to propose this goal plan',planningConsent),cost,prepare);
 const recovery=el('input',{id:'goal-plan-recovery',type:'file',accept:'application/json,.json'}),results=el('div',{id:'goal-plan-results'});
 const inputRecovery=el('input',{id:'goal-input-recovery',type:'file',accept:'application/json,.json',multiple:''});
 const selectedInputs=new Map();
 const refresh=fixed('button','Refresh goal status',{id:'goal-plan-refresh',type:'button',class:'text-button'}),next=fixed('button','Use selected archived results for the next revision',{id:'goal-plan-next',type:'button',class:'button secondary'});
 const ownerHint=el('p',{id:'goal-plan-owner-hint',class:'hint'}),status=el('p',{id:'goal-plan-status',class:'hint'});
 const section=el('section',{id:'owner-goal-planning',class:'panel','data-i18n-managed':'true'},fixed('p','OWNER-REVIEWED GOAL PLANNING',{class:'eyebrow'}),fixed('h2','Plan a business goal'),
  fixed('p','Propose a bounded graph of concrete work. Every child needs a separate owner approval.',{class:'hint'}),
  fixed('p','Dependencies order work and verify lineage. Original facts stay unchanged; you may separately approve recovered archived summaries as untrusted inputs.',{class:'notice'}),ownerHint,form,
  fixed('button','Clear and start a new goal',{id:'goal-plan-new',type:'button',class:'text-button'}),fixed('h3','Recover an archived goal plan'),field('Matching private goal recovery file',recovery),
  fixed('p','Recovery keys and plaintext stay in memory and must be supplied again after reload.',{class:'hint'}),
  field('Optional private recovery files for archived dependency summaries',inputRecovery),
  fixed('p','Recovering a result does not select it. Check each summary under the later step before its separate approval.',{class:'hint'}),status,refresh,results,next);
 mount.prepend(section);
 function owner(){const state=getState();return !!state.ready&&!!state.company&&state.account===state.company.treasury.owner;}
 function ticket(){const state=getState();return {epoch:state.epoch,revision,identity:goalUiContextKey(state),rpc:state.rpc,companyId:state.company?.contract,owner:state.company?.treasury.owner,account:state.account,manifest:state.manifest,version:state.profile?.version,pin:state.pin};}
 class Stale extends Error{}
 function current(value){if(value.epoch!==getState().epoch||value.revision!==revision||value.identity!==goalUiContextKey(getState()))throw new Stale();}
 function requireOwner(){requireCompany();if(!owner())throw Error('Connect the actual company owner to prepare or recover a goal plan.');return ticket();}
 async function read(id,block,value){current(value);const record=await readTask(id,block);current(value);return record?{...record,id:record.id??id}:null;}
 function disable(control,value){setControlDisabled(control,!!value);lockControl(control);}
 function renderPolicy(){
  if(!policy){cost.textContent=tr('Refresh the finalized owner AI policy to inspect current limits.');return;}
  try{for(const key of ['count','max_calls_per_day','max_calls_per_job','max_input_tokens','max_output_tokens'])if(!Number.isSafeInteger(policy[key])||policy[key]<0)throw Error();
   cost.textContent=[tr('Owner policy ceilings: per call {per}, daily {daily}, lifetime {lifetime}.',{per:formatUsdNanos(policy.per_call_nanos,locale()),daily:formatUsdNanos(policy.daily_nanos,locale()),lifetime:formatUsdNanos(policy.lifetime_nanos,locale())}),
    tr('Observed lifetime reservation count')+': '+policy.count+' · '+tr('daily call limit')+': '+policy.max_calls_per_day+' · '+tr('per-job call limit')+': '+policy.max_calls_per_job+' · '+tr('input token limit')+': '+policy.max_input_tokens+' · '+tr('output token limit')+': '+policy.max_output_tokens+'.',
    tr('Planning inference policy: {state}.',{state:tr(policy.enabled?'enabled':'disabled')}),policyBlock?tr('Policy observed at FINAL block {height}.',{height:policyBlock.height}):'',tr('Local compute cost is unknown; reservation estimates are not Cloud invoices.')].filter(Boolean).join(' ');
  }catch{cost.textContent=tr('Current AI policy limits are unavailable.');}
 }
 function controls(){
  if(stagedId&&getState().prepared?.intent?.args?.id!==stagedId)stagedId=null;
  const enabled=owner()&&!busy;for(const control of form.querySelectorAll('input,textarea,select,button'))disable(control,!enabled);
  for(const {enabled:permission,ai}of allowed.values())disable(ai,!enabled||!permission.checked);
  for(const button of results.querySelectorAll('[data-goal-approve-step]')){
   const step=Number(button.dataset.goalApproveStep),readiness=loaded&&enabled?goalStepReadiness(loaded.scope,loaded.payload,loaded.children,step,expectedMeta()):null;
   disable(button,!readiness||readiness.state!=='ready'||stagedId===readiness.id);
  }
  for(const input of results.querySelectorAll('[data-goal-prior-step]')){
   const step=Number(input.dataset.goalPriorStep),item=loaded?.payload.goal_plan.steps[step-1],record=item?loaded.children.get(item.task_id):null;
   const readiness=loaded&&enabled?goalStepReadiness(loaded.scope,loaded.payload,loaded.children,step,expectedMeta()):null;
   disable(input,!readiness||readiness.state!=='submitted'||record.status!=='archived'||!hash(record.evidence_hash));
  }
  for(const input of results.querySelectorAll('[data-goal-input-for]'))disable(input,!enabled||!loaded||!!loaded.children.get(payloadStepId(Number(input.dataset.goalInputFor))));
  disable(inputRecovery,!enabled||!loaded);
  disable(recovery,!enabled);disable(refresh,!enabled||!loaded);disable(next,!enabled||!loaded||chosenPrior.size===0||loaded.scope.goal_plan.revision>=1000);
  ownerHint.textContent=owner()?tr('Only review and encryption happen here. Wallet approval and worker inference are separate actions.'):tr('Connect the actual company owner to prepare or recover a goal plan.');
  revisionLabel.textContent=tr('Goal revision {revision}.',{revision:continuation?.revision??1});planId.readOnly=!!continuation;
 }
 async function fresh(value,{needInference=false}={}){
  current(value);const block=await value.rpc.finalBlock();current(value);
  const [account,treasury,profile,ai]=await Promise.all([value.rpc.request('query',{request_type:'view_account',account_id:value.companyId,block_id:block.hash}),value.rpc.view(value.companyId,'state',{},block.hash),value.rpc.view(value.companyId,'execution_profile',{},block.hash),value.rpc.view(value.companyId,'ai_policy',{},block.hash)]);current(value);
  if(account.code_hash!==value.pin||treasury.owner!==value.owner||profile?.worker_key_id!==value.manifest.worker_key_id||profile?.worker_public_key!==value.manifest.worker_public_key||profile?.version!==value.version||profile?.profile!=='business-operations-v1'){
   clear();throw Error('Company identity, owner or worker changed; reconnect and recover again.');
  }
  policy=ai;policyBlock=block;renderPolicy();if(needInference&&ai?.enabled!==true)throw Error('The finalized owner AI policy must enable planning inference.');return block;
 }
 function safely(callback){return async event=>{event?.preventDefault();if(busy||getState().busy){notice(tr('Wait for the current approval or local action to finish.'),true);return;}const serial=++operation;busy=true;controls();try{await callback(event);}catch(error){if(serial===operation&&!(error instanceof Stale))notice(localizedError(error,locale()),true);}finally{if(serial===operation){busy=false;if(loaded)renderLoaded();else controls();}}};}
 function changed(){revision++;stagedId=null;invalidateDraft();observedEpoch=getState().epoch;renderPolicy();if(loaded)renderLoaded();else controls();}
 form.addEventListener('input',changed);form.addEventListener('change',()=>controls());
 form.addEventListener('submit',safely(async()=>{
  const value=requireOwner();if(!planningConsent.checked)throw Error('Explicit consent for one planning inference request is required.');
  if(continuation&&!priorConsent.checked)throw Error('Approve the referenced prior summaries as untrusted inputs first.');
  const permitted=[...allowed].filter(([,item])=>item.enabled.checked).map(([operation,item])=>({operation,use_ai:item.ai.checked}));
  const scope=goalScope({companyId:value.companyId,planId:planId.value.trim(),revision:continuation?.revision??1,goal:goal.value.trim(),context:context.value.trim(),sources:[{id:'company_facts',text:facts.value.trim()}],allowed:permitted,minSteps:Number(min.value),maxSteps:Number(max.value),requireDependency:requireDependency.checked,previous:continuation?.previous??null,locale:validateLocale(requestedLocale.value)});
  const block=await fresh(value,{needInference:true}),id=goalTaskId(scope.goal_plan.plan_id,scope.goal_plan.revision);
  if(await read(id,block,value))throw Error('This canonical goal revision already exists. Recover it or start a new goal.');
  if(continuation)await checkPrevious(value,block);
  const prepared=await prepareGoalPlan(scope,value.manifest,value.version,value.companyId);current(value);
  const latest=await value.rpc.finalBlock();current(value);if(await read(id,latest,value))throw Error('This canonical goal revision already exists. Recover it or start a new goal.');
  const summary=[tr('Goal: {goal} Step bounds: {min}–{max}. Each child requires a separate approval.',{goal:scope.brief,min:scope.goal_plan.min_steps,max:scope.goal_plan.max_steps}),
   tr('Permitted child policy: {policy}',{policy:scope.goal_plan.allowed.map(item=>tr(names[item.operation])+' · '+tr(item.use_ai?'inference separately allowed':'inference off')).join('; ')}),
   tr('A dependency is required: {value}.',{value:tr(scope.goal_plan.require_dependency?'yes':'no')}),tr('Approved context: {context}',{context:scope.context}),tr('Approved source facts: {facts}',{facts:scope.sources[0].text}),
   ...(scope.goal_plan.previous?[tr('Referenced prior evidence: {refs}. Its bounded summaries are untrusted.',{refs:scope.goal_plan.previous.results.map(item=>goalTaskId(scope.goal_plan.plan_id,scope.goal_plan.revision-1,item.step)+' · '+item.evidence_hash).join('; ')})]:[]),cost.textContent].join(' ');
  stage({...prepared,requestLocale:scope.locale},tr('Approve encrypted goal decomposition'),summary,'work');stagedId=id;
 }));
 function payloadStepId(step){return loaded?.payload.goal_plan.steps[step-1]?.task_id;}
 function forgetLoaded(){if(loaded?.recovery)loaded.recovery.record_key='';for(const entry of loaded?.inputs?.values()??[])entry.recovery.record_key='';loaded=null;chosenPrior.clear();selectedInputs.clear();inputRecovery.value='';results.replaceChildren();next.hidden=true;}
 function clear(){revision++;operation++;busy=false;stagedId=null;forgetLoaded();continuation=null;planningConsent.checked=false;priorConsent.checked=false;priorGroup.hidden=true;priorList.replaceChildren();
  goal.value='';context.value='';facts.value='';planId.value=randomId();min.value='2';max.value='3';requireDependency.checked=true;requestedLocale.value=locale();recovery.value='';status.textContent='';policy=null;policyBlock=null;for(const {enabled,ai}of allowed.values()){enabled.checked=false;ai.checked=false;}identity=goalUiContextKey(getState());observedEpoch=getState().epoch;renderPolicy();controls();}
 section.querySelector('#goal-plan-new').addEventListener('click',()=>{clear();invalidateDraft();});
 async function loadChildren(value,block,parent){return new Map(await Promise.all(parent.payload.goal_plan.steps.map(async item=>[item.task_id,await read(item.task_id,block,value)])));}
 function verifyParent(record,parent,value){if(!record||record.id!==parent.task.id||record.kind!=='general'||record.approved_by!==value.owner||record.status!=='archived'||record.operation!=='strategy_plan'||record.worker_key_id!==value.manifest.worker_key_id||record.execution_profile_version!==value.version||record.scope_hash!==parent.task.scope_hash||record.evidence_hash!==parent.task.evidence_hash||record.encrypted_scope!==parent.task.encrypted_scope||record.encrypted_evidence!==parent.task.encrypted_evidence)throw Error('The exact archived goal plan changed; recover it again.');}
 recovery.addEventListener('change',safely(async event=>{
  const value=requireOwner(),file=event.target.files?.[0];let privateRecovery;
  try{if(!file||file.size>16384)throw Error('Choose the matching small private goal recovery file.');privateRecovery=JSON.parse(await file.text());current(value);
   if(privateRecovery.version!==1||typeof privateRecovery.record_key!=='string'||!hash(privateRecovery.scope_hash)||!/^goal_[0-9a-f]{16}_[1-9][0-9]{0,3}_plan$/.test(privateRecovery.task_id??'')||privateRecovery.contract&&privateRecovery.contract!==value.companyId)throw Error('Recovery is not a matching company goal plan.');
   const network=getState().rehearsal?'sandbox':'testnet';if(privateRecovery.network&&privateRecovery.network!==network)throw Error('Recovery belongs to another network.');
   const block=await fresh(value),task=await read(privateRecovery.task_id,block,value);
   if(!task||task.kind!=='general'||task.status!=='archived'||task.operation!=='strategy_plan'||task.approved_by!==value.owner||task.worker_key_id!==value.manifest.worker_key_id||task.execution_profile_version!==value.version||task.inbox_id||task.mandate_id)throw Error('Recover an archived goal plan authorized by this owner and worker profile.');
   if(task.scope_hash!==privateRecovery.scope_hash)throw Error('Recovery scope changed.');
   const scope=JSON.parse(await decrypt(task.encrypted_scope,privateRecovery.record_key,task.scope_hash));current(value);validateGoalScope(scope,value.companyId);
   const payload=await recoverTask(task,privateRecovery,{companyId:value.companyId});current(value);
   const parent={task,scope,payload,recovery:{...privateRecovery},children:new Map(),inputs:new Map(),block};parent.children=await loadChildren(value,block,parent);current(value);forgetLoaded();loaded=parent;renderLoaded();status.textContent=tr('Recovered an exact archived goal plan at FINAL block {height}. No model was called.',{height:block.height});
  }finally{if(privateRecovery)privateRecovery.record_key='';event.target.value='';}
 }));
 inputRecovery.addEventListener('change',safely(async event=>{
  const value=requireOwner();if(!loaded)throw Error('Recover an archived goal plan first.');const original=loaded,files=[...(event.target.files??[])];if(!files.length||files.length>3)throw Error('Choose one to three matching dependency recovery files.');
  try{const block=await refreshLoaded(value);for(const file of files){let privateRecovery;try{
    if(file.size>16384)throw Error('Choose one to three matching dependency recovery files.');privateRecovery=JSON.parse(await file.text());current(value);
    if(privateRecovery.version!==1||typeof privateRecovery.record_key!=='string'||!hash(privateRecovery.scope_hash)||privateRecovery.contract&&privateRecovery.contract!==value.companyId||privateRecovery.network&&privateRecovery.network!==(getState().rehearsal?'sandbox':'testnet'))throw Error('Matching archived dependency recovery is required.');
    const task=await read(privateRecovery.task_id,block,value),index=original.payload.goal_plan.steps.find(item=>item.task_id===privateRecovery.task_id)?.step;
    if(!index||!task||task.kind!=='general'||task.status!=='archived'||task.approved_by!==value.owner||task.worker_key_id!==value.manifest.worker_key_id||task.execution_profile_version!==value.version||task.inbox_id||task.mandate_id)throw Error('Matching archived dependency recovery is required.');
    const payload=await recoverTask(task,privateRecovery,{companyId:value.companyId});current(value);
    if(payload.goal_ref?.plan_task_id!==original.task.id||payload.goal_ref.evidence_hash!==original.task.evidence_hash||payload.goal_ref.plan_hash!==original.payload.goal_plan.plan_hash||payload.goal_ref.step!==index)throw Error('Matching archived dependency recovery is required.');
    const summary=[...payload.artifact.summary].slice(0,120).join('');if(original.inputs.has(index))original.inputs.get(index).recovery.record_key='';original.inputs.set(index,{task,recovery:{...privateRecovery},summary});
   }finally{if(privateRecovery)privateRecovery.record_key='';}}
   current(value);renderLoaded();status.textContent=tr('Archived summaries recovered privately. Select each untrusted input separately; no model or transaction occurred.');
  }finally{event.target.value='';}
 }));
 function expectedMeta(){return {owner:getState().company.treasury.owner,workerKey:getState().manifest.worker_key_id,profileVersion:getState().profile.version};}
 function renderLoaded(){
  results.replaceChildren();next.hidden=!loaded;if(!loaded){controls();return;}
  const {scope,payload,task,children}=loaded,review=claimReviewPresentation(payload),policy=scope.goal_plan;
  const sourceDetails=el('details',{},fixed('summary','Approved source context'),literal('p',scope.context),...scope.sources.map(source=>el('div',{},literal('strong',source.id),literal('pre',source.text),literal('p',payload.sources.find(item=>item.id===source.id)?.sha256??''))));
  results.append(fixed('h3','Archived proposed goal graph'),literal('p',scope.brief),literal('p',payload.artifact.summary),literal('p',task.id+' · '+task.evidence_hash),fixed('p','Private proposal only. Every child still needs a separate exact owner approval.',{class:'notice'}),
   el('p',{class:'hint'},tr(review.label)+' '+tr('Owner review required.')+' '+tr('English-only claim heuristics; all copy remains unverified.')),
   el('p',{class:'hint'},tr('Approved language: {language}. Step bounds: {min}–{max}.',{language:languageName(scope.locale??'en',locale()),min:policy.min_steps,max:policy.max_steps})),sourceDetails);
  results.append(el('p',{class:'hint'},tr('Permitted child policy: {policy}',{policy:policy.allowed.map(item=>tr(names[item.operation])+' · '+tr(item.use_ai?'inference separately allowed':'inference off')).join('; ')})));
  for(const item of payload.goal_plan.steps){
   const readiness=goalStepReadiness(scope,payload,children,item.step,expectedMeta()),child=children.get(item.task_id);
   const card=el('article',{class:'card','data-goal-step':item.step},el('h4',{},tr('Step {step}: {operation}',{step:item.step,operation:tr(names[item.operation])})),literal('p',item.brief),literal('p',item.task_id),
    el('p',{class:'hint'},tr('Required approvals: {ids}',{ids:goalStepDependencies(scope,payload,item.step).join(', ')})),
    el('details',{},fixed('summary','Planned base child scope'),literal('pre',JSON.stringify(selectedGoalScope(scope,payload,item.step),null,2))));
   let message;if(readiness.state==='submitted')message=tr('Already submitted: {status}. This ID cannot be approved again.',{status:statusLabel(child.status,locale())});
   else if(readiness.state==='conflict')message=tr('An existing record differs from the approved graph. Inspect it before further approvals.');
   else if(readiness.state==='missing')message=tr('Approve these prior step IDs first: {ids}',{ids:readiness.missing.join(', ')});
   else if(readiness.waiting.length)message=tr('Prior approvals exist; execution waits for their completion.');
   else message=tr('Ready for a separate exact owner review.');
   card.append(el('p',{class:'hint','data-goal-readiness':readiness.state},message));
   for(const index of item.depends_on){const entry=loaded.inputs.get(index),actual=children.get(payload.goal_plan.steps[index-1].task_id);if(!entry||actual?.status!=='archived'||actual.evidence_hash!==entry.task.evidence_hash)continue;
    const input=el('input',{type:'checkbox','data-goal-input-for':item.step,'data-goal-input-step':index});input.checked=selectedInputs.get(item.step)?.has(index)??false;disable(input,!owner()||busy||!!child);
    input.addEventListener('change',()=>{let selected=selectedInputs.get(item.step);if(!selected){selected=new Set();selectedInputs.set(item.step,selected);}if(input.checked)selected.add(index);else selected.delete(index);stagedId=null;invalidateDraft();observedEpoch=getState().epoch;controls();});
    card.append(field('Use this exact archived summary as an untrusted source for this child',input),literal('p',entry.summary),literal('p',entry.task.id+' · '+entry.task.evidence_hash,{class:'hint'}));
   }
   const button=fixed('button','Review this exact child',{type:'button',class:'button secondary','data-goal-approve-step':item.step});disable(button,!owner()||busy||readiness.state!=='ready'||stagedId===item.task_id);button.addEventListener('click',safely(()=>prepareChild(item.step)));card.append(button);
   const canReference=readiness.state==='submitted'&&child.status==='archived'&&hash(child.evidence_hash);
   const choose=el('input',{type:'checkbox','data-goal-prior-step':item.step,disabled:!canReference||!owner()||busy});choose.checked=canReference&&chosenPrior.get(item.step)===child.evidence_hash;if(!choose.checked)chosenPrior.delete(item.step);
   choose.addEventListener('change',()=>{if(choose.checked&&canReference)chosenPrior.set(item.step,child.evidence_hash);else chosenPrior.delete(item.step);controls();});
   card.append(field('Reference this exact archived result for a later plan',choose));if(canReference)card.append(literal('p',child.evidence_hash,{class:'hint'}));results.append(card);
  }
  controls();
 }
 async function refreshLoaded(value){const block=await fresh(value);if(!loaded)throw Error('Recover an archived goal plan first.');const original=loaded;verifyParent(await read(original.task.id,block,value),original,value);const children=await loadChildren(value,block,original);current(value);if(loaded!==original)throw new Stale();loaded.children=children;loaded.block=block;renderLoaded();return block;}
 refresh.addEventListener('click',safely(()=>refreshLoaded(requireOwner())));
 async function prepareChild(step){
  const value=requireOwner();if(!loaded)throw Error('Recover an archived goal plan first.');const original=loaded;await refreshLoaded(value);
  const readiness=goalStepReadiness(original.scope,original.payload,original.children,step,expectedMeta());
  if(readiness.state==='submitted')throw Error('This canonical child task already exists. No repeat approval is allowed.');if(readiness.state!=='ready')throw Error('Submit the exact required prior approvals before reviewing this child.');
  const selected=selectedGoalScope(original.scope,original.payload,step);if(selected.use_ai&&policy?.enabled!==true)throw Error('The finalized owner AI policy must enable child inference.');
  const dependencyInputs=[...(selectedInputs.get(step)??[])].sort((a,b)=>a-b).map(index=>{const entry=original.inputs.get(index),actual=original.children.get(original.payload.goal_plan.steps[index-1].task_id);if(!entry||!actual||actual.status!=='archived'||actual.evidence_hash!==entry.task.evidence_hash||actual.scope_hash!==entry.task.scope_hash)throw Error('Referenced archived results changed. Refresh and select them again.');return {task:actual,recovery:entry.recovery};});
  const prepared=await prepareGoalStep({task:original.task,scope:original.scope,payload:original.payload,step,companyId:value.companyId,owner:value.owner,recovery:original.recovery,dependencyInputs},value.manifest,value.version);current(value);
  const block=await value.rpc.finalBlock();current(value);if(await read(prepared.intent.args.id,block,value))throw Error('This canonical child task already exists. No repeat approval is allowed.');
  const inputSummary=dependencyInputs.map(({task})=>{const entry=original.inputs.get(Number(task.id.split('_').at(-1)));return task.id+' · '+task.evidence_hash+' · '+entry.summary;}).join('; ');
  stage({...prepared,requestLocale:selected.locale??'en'},tr('Approve exact goal child'),tr('Step {step}: {operation}. Request: {brief}. Required IDs: {ids}',{step,operation:tr(names[selected.operation]),brief:selected.brief,ids:prepared.intent.args.dependencies.join(', ')})+' '+(inputSummary?tr('Explicit untrusted summary inputs: {inputs}',{inputs:inputSummary}):tr('Original approved source facts stay unchanged; sibling prose is not automatically copied.'))+(selected.use_ai?' '+cost.textContent:''),'work');stagedId=prepared.intent.args.id;renderLoaded();
 }
 async function checkPrevious(value,block,proposal=continuation){
  if(!proposal||!loaded)throw Error('Recover the original plan before continuing.');verifyParent(await read(loaded.task.id,block,value),loaded,value);
  for(const reference of proposal.previous.results){const id=goalTaskId(loaded.scope.goal_plan.plan_id,loaded.scope.goal_plan.revision,reference.step),record=await read(id,block,value),expected=loaded.children.get(id);
   if(!record||record.status!=='archived'||record.evidence_hash!==reference.evidence_hash||!expected||record.scope_hash!==expected.scope_hash)throw Error('Referenced archived results changed. Refresh and select them again.');
   const entries=new Map([[id,record]]);if(goalStepReadiness(loaded.scope,loaded.payload,entries,reference.step,expectedMeta()).state!=='submitted')throw Error('Referenced result is not an exact approved goal child.');}
 }
 next.addEventListener('click',safely(async()=>{
  const value=requireOwner();if(!loaded||loaded.scope.goal_plan.revision>=1000||!chosenPrior.size)throw Error('Select one or more archived child results first.');
  const selected=[...chosenPrior].sort(([a],[b])=>a-b).map(([step,evidence_hash])=>({step,evidence_hash}));const original=loaded;const block=await refreshLoaded(value);
  for(const item of selected){const record=original.children.get(goalTaskId(original.scope.goal_plan.plan_id,original.scope.goal_plan.revision,item.step));if(!record||record.status!=='archived'||record.evidence_hash!==item.evidence_hash)throw Error('Referenced archived results changed. Refresh and select them again.');}
  const proposal={revision:original.scope.goal_plan.revision+1,previous:{plan_task_id:original.task.id,evidence_hash:original.task.evidence_hash,results:selected}};
  if(original.scope.sources.length!==1||original.scope.sources[0].id!=='company_facts')throw Error('This form supports one company_facts source. Prepare other source layouts through the reviewed API.');
  await checkPrevious(value,block,proposal);current(value);continuation=proposal;planId.value=original.scope.goal_plan.plan_id;goal.value=original.scope.brief;context.value=original.scope.context;
  facts.value=original.scope.sources[0].text;min.value=String(original.scope.goal_plan.min_steps);max.value=String(original.scope.goal_plan.max_steps);requireDependency.checked=original.scope.goal_plan.require_dependency;requestedLocale.value=locale();
  for(const [name,item]of allowed){const prior=original.scope.goal_plan.allowed.find(entry=>entry.operation===name);item.enabled.checked=!!prior;item.ai.checked=prior?.use_ai??false;}
  planningConsent.checked=false;priorConsent.checked=false;priorGroup.hidden=false;priorList.replaceChildren(...selected.map(item=>literal('p',goalTaskId(original.scope.goal_plan.plan_id,original.scope.goal_plan.revision,item.step)+' · '+item.evidence_hash)));
  changed();form.scrollIntoView({behavior:'smooth',block:'center'});status.textContent=tr('Next revision prepared locally. Review both inference and untrusted-context consent; no model was called.');
 }));
 function update(actualPolicy){const nextIdentity=goalUiContextKey(getState());if(nextIdentity!==identity||getState().epoch!==observedEpoch)clear();if(actualPolicy){policy=actualPolicy;policyBlock=getState().company?.block??null;}
  requestedLocale.options[0].textContent=languageName('en',locale());requestedLocale.options[1].textContent=languageName('es',locale());
  if(stagedId&&getState().prepared?.intent?.args?.id!==stagedId)stagedId=null;
  if(loaded){for(const record of getState().tasks??[])if(loaded.children.has(record.id))loaded.children.set(record.id,record);renderLoaded();}
  translateMarked(section,locale());renderPolicy();controls();}
 clear();update();return {update,clear};
}
