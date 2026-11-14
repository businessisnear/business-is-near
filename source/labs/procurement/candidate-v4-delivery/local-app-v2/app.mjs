import {policyPreparationState,identityCandidatesMatchAccounts,requireCreateKeyReadiness} from '/policy-preparation.mjs';
import {positiveUnsignedRefusal,discardAcknowledgedUnsignedReview,financialActionsAvailable} from '/pending-review.mjs';
import {prepareDelivery,openDelivery,RECIPIENT_PROFILE,IDENTITY_PROFILE} from '/delivery-envelope.mjs';
import {assignmentPreview,PUBLIC_ACK,canonical} from '/modules/assignment-client.mjs';
import {digest,publicKeyId} from '/web-chain/src/crypto.js';
const $=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m);};
const names={owner:'Company owner',operator:'Company operator',proofreader:'Independent reviewer (test role)'};
const source='Harbor Studio is a fictional product photography business. Its offer is a one-hour photography session with five edited images. Please proofread this description. Keep only these facts. Do not invent a price, location, testimonial, contact address or booking method.';
const corrected='Harbor Studio offers a one-hour product photography session with five edited images. Pricing, location and booking details will be confirmed by the business owner before publication.';
let hello,state,role='owner',busy=false,identities={},opened=null,doAction=null,knownUnsigned=null;
const near=x=>{const n=BigInt(x??'0');return (Number(n)/1e24).toLocaleString('en-US',{maximumFractionDigits:6})+' local NEAR';};
const text=(id,v)=>$(id).textContent=v;
const node=(tag,content,cls)=>{const x=document.createElement(tag);if(content!==undefined)x.textContent=content;if(cls)x.className=cls;return x;};
const pendingKey=()=>`bin-local-original:${hello.run_id}`;
const notice=(s,error=false)=>{$('notice').hidden=!s;text('notice',s);$('notice').classList.toggle('error',error);};
async function api(url,body){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{'x-bin-local-capability':hello?.cap??'',...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok)throw Error(v.error??'Current records could not be verified.');return v;}
async function identity(account_id){
 const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const b64=btoa(Array.from(new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)),x=>String.fromCharCode(x)).join(''));
 const pem='-----BEGIN PUBLIC KEY-----\n'+b64.match(/.{1,64}/g).join('\n')+'\n-----END PUBLIC KEY-----\n';
 return {profile:IDENTITY_PROFILE,account_id,key_id:await publicKeyId(pem),key_version:'1',public_key_pem:pem,private_jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};
}
const publicIdentity=x=>Object.fromEntries(['account_id','key_id','key_version','public_key_pem'].map(k=>[k,x[k]]));
async function initializePolicy(){
 state=await api('/api/state');check(financialActionsAvailable(state),'Financial actions are paused; public policy preparation is unavailable.');
 const before=policyPreparationState(state,identities,hello.accounts);
 if(before==='ready_for_create'){notice('The original local delivery keys already match this prepared policy.');return;}
 check(before==='prepare_public_policy','An original policy or mandate already exists. Its public recipients cannot be overwritten.');
 notice('Preparing this local run’s encrypted delivery keys in this page… No transaction is being signed.');
 if(!identityCandidatesMatchAccounts(identities,hello.accounts))for(const r of ['owner','worker'])identities[r]=await identity(hello.accounts[r==='worker'?'operator':r]);
 await api('/api/policy',{recipient_policy:{profile:RECIPIENT_PROFILE,owner:publicIdentity(identities.owner),worker:publicIdentity(identities.worker)}});
 state=await api('/api/state');requireCreateKeyReadiness(state,identities,hello.accounts);
 notice('Original local delivery keys are ready. They stay in this page’s memory. Finish the delivery review before reloading; this fixture does not save private recovery keys.');
}

function copy(s){$('content').append(node('div',s,'copy-block'));}
function field(label,value){const box=node('label',undefined,'field'),span=node('span',label),input=node('textarea');input.value=value;input.maxLength=3000;input.rows=6;box.append(span,input);$('content').append(box);return input;}
function summary(label,value){const row=node('div',undefined,'stat-line');row.append(node('span',label),node('strong',value));$('content').append(row);}
function action(label,needed,fn,note='Every action has its own exact cost review.'){
 const permitted=role===needed;doAction=permitted?fn:null;$('primary').disabled=!permitted||busy;
 text('primary',permitted?label:`Switch to ${names[needed].toLowerCase()} →`);
 text('action-note',permitted?note:`The next decision belongs to the ${names[needed].toLowerCase()}. Choose that test wallet above.`);
}
async function review(actionName,data={}){
 check(financialActionsAvailable(state),'Financial actions are paused; inspect the original records.');if(actionName==='create')requireCreateKeyReadiness(state,identities,hello.accounts);check(!localStorage.getItem(pendingKey()),'Inspect or explicitly discard the exact original review first.');
 const p=await api('/api/prepare',{action:actionName,data}),d=$('review-dialog');
 $('review-summary').replaceChildren(node('p',`You are approving as ${names[p.role].toLowerCase()}. This acts only on the isolated local chain.`));
 for(const [label,value] of [['Attached deposit',p.costs.attached_deposit],['Network gas authorization',p.costs.network_gas_authorization],['New storage collateral',p.costs.storage_collateral],['Shared code charged again',p.costs.project_code_charge]]){const row=node('div',undefined,'stat-line');row.append(node('span',label),node('strong',near(value)));$('review-summary').append(row);}
 $('review-summary').append(node('p','Storage is locked record collateral in this prototype. Business funds and gas are separate. Approval expires in 45 seconds; it grants one original transaction.'));
 if(actionName==='share'){$('review-summary').append(node('strong','These exact words will become public and permanent on the local chain.'));$('review-summary').append(node('div',p.intent.args.assignment.text,'copy-block'));}
 text('review-title',actionName==='accept'?'Accept the work you read.':actionName==='pay'?'Pay the original reviewer.':'Review your exact action.');text('review-data',JSON.stringify(p.intent,null,2));
 $('review-ack').checked=false;$('review-approve').disabled=true;d.returnValue='cancel';d.showModal();
 await new Promise(resolve=>d.addEventListener('close',resolve,{once:true}));if(d.returnValue!=='approve')return;
 check(role===p.role,'Selected test wallet changed. Review the action again.');check(Date.now()<=p.expires_at_ms,'This review expired. Prepare a fresh review.');
 const reviewed_intent_sha256=await digest(canonical(p.intent));
 // Only an opaque original ID and public digest are stored in the browser.
 // The server saves the signed wire/hash/nonce before its sole broadcast.
 localStorage.setItem(pendingKey(),JSON.stringify({request_id:p.request_id,intent_sha256:reviewed_intent_sha256}));
 const result=await api('/api/approve',{request_id:p.request_id,reviewed_intent_sha256});
 settle(result);await refresh();
}
function settle(result){
 const pending=localStorage.getItem(pendingKey());const original=pending?JSON.parse(pending):null;
 check(original&&result.request_id===original.request_id,'Original pending request identity changed');
 if(positiveUnsignedRefusal(result,original)){
  knownUnsigned=structuredClone(result);notice('This exact review was positively refused before signing. No transaction was signed. You may explicitly discard this unsigned review and prepare a fresh one.',true);return;
 }
 knownUnsigned=null;
 if(result.status==='final'){
  localStorage.removeItem(pendingKey());
  check(result.checked?.status==='final','The original transaction failed. Its receipt is preserved; inspect it before any different action.');
  notice(result.principal?`Native transfer confirmed: ${near(result.principal.amount)} to the original recipient.`:'Original transaction is FINAL. The next step uses the resulting chain records.');
 }else notice('The original request is unresolved. Refresh inspects that same request; it will not sign or broadcast it again.',true);
}
async function refresh(){
 let inspectionError=null;
 if(localStorage.getItem(pendingKey())){try{const p=JSON.parse(localStorage.getItem(pendingKey()));const r=await api('/api/inspect',{request_id:p.request_id});settle(r);}catch(error){knownUnsigned=null;inspectionError=error;}}
 // A failed original inspection does not hide separately verified records.
 state=await api('/api/state');render();if(inspectionError)notice('Original request remains unresolved: '+inspectionError.message,true);
}
async function discardUnsignedReview(){
 const pending=JSON.parse(localStorage.getItem(pendingKey()));check(positiveUnsignedRefusal(knownUnsigned,pending),'Only this exact positively unsigned review can be discarded.');
 const result=await api('/api/reset-review',{request_id:pending.request_id,reviewed_intent_sha256:pending.intent_sha256});
 discardAcknowledgedUnsignedReview({storage:localStorage,key:pendingKey(),pending,result});knownUnsigned=null;
 notice('Unsigned review discarded. Its refusal record remains preserved. Prepare a new exact cost review when actions are available.');await refresh();
}
function render(){
 const {m,job,assignment,delivery}=state;$('content').replaceChildren();doAction=null;
 const pending=Boolean(localStorage.getItem(pendingKey()));let step='plan',heading='',explanation='',badge='Ready';
 $('costs').replaceChildren();
 for(const [label,value] of [['Reviewer price per job',near('100000000000000000000000')],['Business budget',near(m?.funded??'400000000000000000000000')],['Record storage collateral',m?near(m.storage_collected):'Quoted before approval'],['Shared project code',near('0')],['Network gas','Quoted for each action']]){const r=node('div');r.append(node('dt',label),node('dd',value));$('costs').append(r);}
 if(!m&&policyPreparationState(state,identities,hello.accounts)!=='ready_for_create'){
  const preparation=policyPreparationState(state,identities,hello.accounts);
  if(preparation==='prepare_public_policy'){heading='Prepare your original delivery keys.';explanation='Prepare local encryption recipients before approving a business budget. This step uses only public metadata and does not sign a transaction.';action('Prepare local delivery keys →','owner',initializePolicy,'Private delivery keys stay in this page’s memory. No business budget is created by this step.');}
  else{heading='Inspect the original prepared policy.';explanation='This page no longer holds the private keys matching the original public recipients. Create stays disabled. Do not overwrite the policy or create another mandate.';text('primary','Original delivery keys unavailable');$('primary').disabled=true;text('action-note','Original public policy is still inspectable. Key recovery requires a separately reviewed path.');}
 }
 else if(!m){heading='Set the direction. Set the limit.';explanation='Commission one careful proofreading job for the fictional Harbor Studio offer. Approve the original owner, reviewer, recipient keys and firm budget limits.';summary('Goal','A clear, factual photography offer');summary('Work','One owner-approved proofreading job');summary('Maximum job price',near('100000000000000000000000'));summary('Unused business budget','Returned to this original owner after closing');action('Review plan & budget →','owner',()=>review('create'));}
 else if(!job){heading='Put the approved plan to work.';explanation='The company operator can post only the job already covered by the owner’s approved policy. Posting does not approve a reviewer or spend the business budget.';summary('Owner approval','Recorded on NEAR');summary('Allowed job','Proofread · cycle 1 of 1');action('Post the approved work →','operator',()=>review('post'));}
 else if(!assignment){step='brief';heading='A useful brief. No guesswork.';explanation='Give the reviewer the facts and the exact result you want. Read this text carefully: sharing makes it public, including transaction arguments.';const input=field('Exact public brief and source copy',source),ack=node('label',undefined,'check-row'),checkbox=node('input');checkbox.type='checkbox';ack.append(checkbox,node('span','I approve sharing these exact words publicly and permanently on the local NEAR chain.'));$('content').append(ack);input.addEventListener('input',()=>checkbox.checked=false);action('Review & share this brief →','owner',async()=>{check(checkbox.checked,'Read the exact brief and check the public-sharing approval first.');const packet=await assignmentPreview({context:state.assignment_context,source_evidence_sha256:await digest(source),text:input.value});await review('share',{packet,public_share_ack:PUBLIC_ACK});});}
 else if(job.status==='open'&&job.bids.length===0){step='work';heading='A real brief, ready for a reviewer.';explanation='The approved reviewer can read the whole assignment before offering a price. This local test role is controlled by the test operator; it is not an actual human hire.';copy(assignment.text);summary('Proposed review price',near('100000000000000000000000'));action('Offer to review this work →','proofreader',()=>review('bid'));}
 else if(job.status==='open'){step='work';heading='You choose who does the work.';explanation='This offer is bound to the exact brief you approved. Accepting it reserves the price from your existing business budget; it does not pay the reviewer.';copy(assignment.text);summary('Reviewer offer',near(job.bids[0].price));summary('Proposed reviewer','Allowlisted synthetic local test role');action('Review & appoint reviewer →','owner',()=>review('award'));}
 else if(job.status==='awarded'){step='work';heading='The reviewer can begin.';explanation='Only the reviewer selected by the owner can claim this job. The brief, recipients and agreed price stay bound to the original award.';copy(assignment.text);action('Accept the assigned work →','proofreader',()=>review('claim'));}
 else if(job.status==='claimed'){step='work';heading='Good work deserves a careful finish.';explanation='Read the source, correct the wording, and keep the facts. The output is encrypted in this browser for the original owner and worker before it reaches NEAR.';copy(assignment.text);const input=field('Reviewer’s finished text',corrected);summary('Provider delivery storage deposit',near('0'));action('Encrypt & review delivery →','proofreader',async()=>{const packet=await prepareDelivery({context:state.delivery_context,recipientPolicy:m.policy.recipient_policy,body:input.value});await review('deliver',{delivery:packet});});}
 else if(job.status==='delivered'){step='review';heading='Read it before you accept it.';explanation='The encrypted output was read back from the original NEAR job. Open it with the owner key kept in this page, then decide whether the work meets your brief.';
  if(opened?.hash===delivery.envelope_sha256){copy(opened.body);summary('Owner and worker decryption','Both original recipients opened this exact output');action('Review & accept this work →','owner',()=>review('accept'));}
  else action('Open the delivered work →','owner',async()=>{check(identities.owner&&identities.worker,'This fixture’s private keys left memory on reload. Do not create another mandate. Original ciphertext and chain receipts remain available for inspection.');const expectedContext={...state.delivery_context,content_sha256:delivery.context.content_sha256};const a=await openDelivery(delivery,{expectedContext,recipientPolicy:m.policy.recipient_policy,recipient:'owner',identity:identities.owner}),b=await openDelivery(delivery,{expectedContext,recipientPolicy:m.policy.recipient_policy,recipient:'worker',identity:identities.worker});check(a.body===b.body,'Original recipients opened different output');opened={hash:delivery.envelope_sha256,body:a.body};render();notice('Both original recipients opened the exact encrypted output read back from NEAR.');},'Opening is local decryption. It does not sign a transaction or pay anyone.');
 }
 else if(job.status==='accepted'){step='review';heading='Accepted. Ready to settle.';explanation='The owner accepted the exact delivery. The reviewer now has a claim to the agreed amount. Acceptance itself is not payment.';if(opened)copy(opened.body);summary('Original reviewer credit',near(job.credit));summary('Confirmed paid',near(job.paid));action('Withdraw reviewer payment →','proofreader',()=>review('pay'));}
 else if(job.status==='paid'&&!m.closed){step='review';heading='Work delivered. Reviewer paid.';explanation='The native transfer and its callback confirm payment to the original reviewer. Close this finished job’s budget to make unused business funds returnable.';summary('Reviewer paid',near(job.paid));summary('Unused business funds',near(m.available));action('Close the finished budget →','owner',()=>review('close'));}
 else if(m.closed&&BigInt(m.owner_credit)>0n){step='review';heading='Return what you didn’t spend.';explanation='The budget is closed. The original owner can withdraw the remaining business credit. Record storage collateral stays locked in this prototype.';summary('Reviewer paid',near(job.paid));summary('Owner credit to return',near(m.owner_credit));action('Return unused business funds →','owner',()=>review('refund'));}
 else if(job.status==='paid'&&m.closed&&BigInt(m.owner_paid)>0n){step='review';heading='A complete local work cycle.';badge='Verified';explanation='A public approved brief led to a reviewer offer, owner award, encrypted delivery, readable acceptance, native payment and an unused-budget return. Every action has its own original transaction receipt.';if(opened)copy(opened.body);summary('Reviewer paid',near(job.paid));summary('Returned to original owner',near(m.owner_paid));summary('Unresolved transfer liability',near(m.transfer_pending));text('primary','Work cycle verified ✓');$('primary').disabled=true;text('action-note','Synthetic local roles. No real human hire, AI inference, public deployment or mainnet funds were involved.');}
 else throw Error('This state needs inspection before another action.');
 text('headline',heading);text('explanation',explanation);text('status',pending?'Inspect original':badge);text('stage-label',role==='owner'?'YOUR NEXT DECISION':names[role].toUpperCase());
 const steps=['plan','brief','work','review'];document.querySelectorAll('[data-step]').forEach(x=>{x.classList.toggle('current',x.dataset.step===step);x.classList.toggle('done',steps.indexOf(x.dataset.step)<steps.indexOf(step));});
 if(state.requests.some(r=>r.inspection_conflict)){doAction=null;$('primary').disabled=true;text('action-note','An original observation conflict requires inspection. No new financial action is available.');}
 if(pending){doAction=null;$('primary').disabled=true;text('action-note','An original request is unresolved. Refresh only inspects that original; no new signature is available.');}
 const resettable=pending&&positiveUnsignedRefusal(knownUnsigned,JSON.parse(localStorage.getItem(pendingKey())));$('reset-review').hidden=!resettable;$('reset-review').disabled=busy;
 const available=financialActionsAvailable(state);$('maintenance').hidden=available;
 if(!available){text('maintenance','Your original records and receipts remain readable. Financial actions are paused: '+(state.maintenance?.reasons??['unverified_admission']).join(', ')+'.');doAction=null;$('primary').disabled=true;text('primary','Financial actions paused');text('action-note','Refresh or inspect the original receipts. No signing, approval or financial preparation is available in maintenance.');text('status','Read only');}

 text('final-block',`FINAL block ${state.final.height} · isolated local NEAR`);
 $('events').replaceChildren();for(const r of state.requests){const description=`${r.action.replaceAll('_',' ')} · ${r.checked?.status==='final'?'FINAL':r.status}${r.principal?' · exact native transfer confirmed':''} · ${r.hash??r.request_id}`;$('events').append(node('li',description));}if(!state.requests.length)$('events').append(node('li','No browser-approved transactions in this run yet.'));
 text('technical-data',JSON.stringify({environment:state.environment,company_is_fictional:true,real_human_hire:false,model_calls:0,pins:state.pins,mandate_id:state.mandate_id,policy_sha256:m?.policy_sha256,job,mandate:m,requests:state.requests,final:state.final,project_deployment_subsidy:state.project_quote,maintenance:state.maintenance,limitations:['New isolated node and synthetic local role wallets.','Company ID is fixture metadata; this does not prove an existing company/goal runner or real hire.','Private delivery keys live in page RAM only. Reload after review/settlement to retain read-only receipts.','The server persists original signed wires before one broadcast. Real Nightly behavior is a separate unproved integration.']},null,2));
}
$('review-ack').addEventListener('change',()=>{$('review-approve').disabled=!$('review-ack').checked;});
$('actor').addEventListener('change',()=>{role=$('actor').value;render();});
$('technical-toggle').addEventListener('click',()=>{const show=$('technical').hidden;$('technical').hidden=!show;$('technical-toggle').setAttribute('aria-expanded',String(show));text('technical-toggle',show?'Hide technical details −':'Show technical details ＋');});
async function run(fn){if(busy)return;busy=true;$('primary').disabled=true;$('reset-review').disabled=true;$('refresh').disabled=true;$('actor').disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;$('refresh').disabled=false;$('actor').disabled=false;if(state)render();}}
$('primary').addEventListener('click',()=>{const fn=doAction;if(fn)run(fn);});$('refresh').addEventListener('click',()=>run(refresh));$('reset-review').addEventListener('click',()=>run(discardUnsignedReview));
await run(async()=>{hello=await api('/api/hello');$('actor').replaceChildren(...Object.entries(names).map(([value,label])=>{const x=node('option',label);x.value=value;return x;}));state=await api('/api/state');await refresh();});
