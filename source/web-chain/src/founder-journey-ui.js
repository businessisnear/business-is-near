import {createFounderClient} from './founder-journey-client.js';
import {validateFounderConfig, prepareFounderSetup, founderWorkspaceURL, founderAIPolicy,recoverFounderBrief,founderServiceTiming} from './founder-journey-core.js';
import {factoryNear} from './company-factory-client.js';
import {reserveMyNearWalletPopup} from './wallet-popup.js';
import {recoveryFactory, assertFounderCreationAllowed, FOUNDER_RECOVERY, FOUNDER_CREATION_PAUSED} from './founder-service-policy.js';

const SESSION='business-is-near-founder-brief-v1';
const HANDOFF='business-is-near-founder-work-v1';
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const node=(root,tag,text)=>{const n=root.createElement(tag);n.textContent=text;return n;};
export function createFounderJourneyUI({config,getWalletState,connectWallet,disconnectWallet=async()=>{},copyText=value=>navigator.clipboard.writeText(value),rpc,storage=globalThis.localStorage,
  tabStorage=globalThis.sessionStorage,root=document,navigate=url=>location.assign(url),
  downloadFile=(value,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=root.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}) {
  const $=selector=>root.querySelector(selector);
  let step=0,busy=false,busyDepth=0,review=null,company=null,prepared=null,preparedBrief=null,refundReview=null,missionDownloaded=false,pending=null,lastAccount=null,generation=0,requestId='company_'+crypto.randomUUID().replaceAll('-','').slice(0,16);
  const client=createFounderClient({config,getWalletState,storage,rpc,changed:()=>{}});
  const locked=new Map();
  function notice(message,bad=false){const box=$('#journey-notice');box.setAttribute('role',bad?'alert':'status');box.setAttribute('aria-live',bad?'assertive':'polite');box.setAttribute('aria-atomic','true');box.hidden=false;box.textContent=message;box.className='journey-notice'+(bad?' error':'');if(bad){box.tabIndex=-1;box.focus({preventScroll:true});box.scrollIntoView({block:'center',behavior:'auto'});}}
  function focusPanel(selector){const panel=$(selector),heading=panel.querySelector('h1');heading.tabIndex=-1;heading.focus({preventScroll:true});panel.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function controls(){
    const paused=recoveryFactory(config);$('#create-another-company').disabled=busy||paused;
    $('#business-form').hidden=paused;$('#business-form button[type="submit"]').disabled=busy||paused;
    $('#disconnect-founder-wallet').disabled=busy;$('#switch-founder-wallet').disabled=busy;
    $('#create-founder-company').disabled=busy||paused||!review||pending||!$('#creation-custody').checked;
    $('#review-creation').disabled=busy||paused||!review||review.budget.shortfall!=='0'||!!pending;
    $('#approve-founder-setup').disabled=busy||paused||!prepared||!!pending||!missionDownloaded||!$('#mission-recovery-saved').checked;
    $('#prepare-founder-setup').disabled=busy||paused||!company?.verification||!!pending;
    $('#download-mission-recovery').disabled=busy||!prepared;
    $('#mission-recovery-saved').disabled=busy||!missionDownloaded;
    $('#approve-backing-refund').disabled=busy||!refundReview||!!pending||!$('#backing-refund-consent').checked;
    $('#open-founder-workspace').setAttribute('aria-disabled',busy?'true':'false');
    root.querySelectorAll('[data-step-back]').forEach(button=>button.disabled=busy||!!pending);
  }
  function setBusy(value){busyDepth=Math.max(0,busyDepth+(value?1:-1));const next=busyDepth>0;if(next===busy)return;busy=next;$('#journey-main').setAttribute('aria-busy',String(busy));
    if(busy){for(const c of root.querySelectorAll('button,input,textarea')){locked.set(c,c.disabled);c.disabled=true;}}
    else{for(const[c,disabled]of locked)if(c.isConnected)c.disabled=disabled;locked.clear();controls();}}
  const guard=fn=>async event=>{event?.preventDefault();if(busy)return;setBusy(true);try{await fn(event);}catch(error){notice(error.message,true);await updatePending().catch(()=>{});}finally{setBusy(false);}};
  function show(index,focus=true){if(index===0)forgetPrepared();step=index;root.querySelectorAll('[data-journey-step]').forEach(s=>s.hidden=Number(s.dataset.journeyStep)!==index);
    root.querySelectorAll('#journey-steps li').forEach((s,i)=>{if(i===index)s.setAttribute('aria-current','step');else s.removeAttribute('aria-current');s.dataset.complete=String(i<index);});
    if(focus){const heading=$('[data-journey-step="'+index+'"] h1');heading.tabIndex=-1;heading.focus({preventScroll:true});$('#journey-main').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}controls();}
  function showService(snapshot){$('#pilot-window').textContent=founderServiceTiming(recoveryFactory(config)?{...snapshot,service_mode:FOUNDER_RECOVERY.mode}:snapshot);$('#pilot-window').hidden=false;}
  function clearBrief(){tabStorage.removeItem(SESSION);$('#business-name').value='';$('#business-goal').value='';$('#restore-mission-file').value='';$('#restored-mission').textContent='';$('#restored-mission').hidden=true;}
  async function selectExisting(id){clearBrief();forgetPrepared();await client.selectCompany(id);$('#owned-companies').hidden=true;await inspectCompany();}
  async function discoverCompanies(forceChooser=false){const records=await client.discover();if(records.length===1&&records[0].phase==='active'&&!forceChooser){await selectExisting(records[0].id);return true;}if(!records.length)return false;show(0,false);$('[data-journey-step="0"]').hidden=true;$('#owned-companies').hidden=false;const list=$('#owned-company-list');list.replaceChildren();for(const record of records){const button=node(root,'button','Open '+record.child.slice(0,-config.factory_id.length-1)+' · '+record.phase.replaceAll('_',' '));button.type='button';button.className='journey-button secondary';const detail=node(root,'details',''),summary=node(root,'summary','Inspect company record');detail.className='journey-detail';detail.append(summary,node(root,'p',record.child+' · '+record.id));button.addEventListener('click',guard(()=>selectExisting(record.id)));list.append(button,detail);}focusPanel('#owned-companies');return true;}
  function details(selector,rows){const dl=$(selector);dl.replaceChildren();for(const[label,value]of rows){const row=root.createElement('div');row.append(node(root,'dt',label),node(root,'dd',String(value)));dl.append(row);}}
  function brief(){const name=$('#business-name').value.trim(),goal=$('#business-goal').value.trim();if(name.length<2||name.length>80||goal.length<10||goal.length>400)throw Error('Add a business name and a specific first goal.');return {name,goal};}
  function saveBrief(){const value={...brief(),owner:getWalletState().account||null};tabStorage.setItem(SESSION,JSON.stringify(value));return value;}
  function restoreBrief(account){try{const raw=tabStorage.getItem(SESSION);if(!raw||raw.length>2200)return;const v=JSON.parse(raw);if(typeof v.name!=='string'||typeof v.goal!=='string'||v.name.length>80||v.goal.length>400||v.owner!==null&&v.owner!==account)return;$('#business-name').value=v.name;$('#business-goal').value=v.goal;}catch{}}
  function forgetPrepared(){if(prepared?.recovery)prepared.recovery.record_key='';prepared=null;preparedBrief=null;missionDownloaded=false;$('#mission-recovery-saved').checked=false;$('#setup-recovery').hidden=true;$('#setup-technical').textContent='';}
  function setupSummary(value){details('#setup-summary',[['Business name',value.name],['First goal',value.goal],['Company',company.record.child],['Owner',company.t.account],['Encrypted setup storage',factoryNear(String(BigInt(company.storageByteCost)*131072n))],['Capacity','First draft + one revision'],['Model','Pinned local Gemma 4 · Cloud / TEE unverified']]);}
  async function updatePending(){pending=await client.savedPending();$('#journey-pending').hidden=!pending;if(pending){const p=pending.kind==='create'?pending.pending:pending;$('#reconcile-hash').value=p.tx_hash||'';const label=pending.kind==='create'?(p.action.method==='create'?'Company creation':'Backing refund'):'Company setup';$('#pending-description').textContent=label+' has an unresolved wallet outcome. Your original action is saved; checking it will not submit another transaction.';}controls();}
  function walletSessionChanged(){
    const state=getWalletState(),connected=!!state.account,remembered=state.remembered;
    $('#wallet-session-panel').hidden=!connected&&!remembered&&!state.message;
    $('#wallet-session-status').textContent=connected?'Connected '+(state.walletId==='nightly'?'Nightly':'wallet'):remembered?'Your wallet is remembered':'Connect your wallet';
    $('#wallet-session-detail').textContent=connected?'NEAR testnet · '+state.account:state.message||'Unlock your wallet and connect to resume. Only your public account is remembered.';
    $('#resume-connected-business').hidden=!connected;$('#switch-founder-wallet').hidden=false;$('#switch-founder-wallet').textContent=connected?'Switch wallet':'Reconnect Nightly';
    $('#disconnect-founder-wallet').textContent=connected?'Disconnect & forget':'Forget remembered connection';
  }
  async function loadQuote(){
    const value=saveBrief();review=null;controls();notice('Checking your public testnet account and available pilot places…');
    $('#wallet-balance-panel').hidden=false;$('#wallet-receive-address').textContent=getWalletState().account;$('#wallet-balance').textContent='Checking…';$('#wallet-required').textContent='About 12 testNEAR · estimate';$('#wallet-funding-status').textContent='Checking your account before preparing its exact setup quote.';
    const funding=await client.fundingStatus();showService(funding.service);
    $('#wallet-balance').textContent=factoryNear(funding.spendable);
    $('#wallet-pilot-capacity').textContent=funding.availability.service_mode?funding.availability.reason:funding.places+' of 8 company places available · first draft + one revision per company. '+(funding.availability.ready?'The worker is available.':funding.availability.reason);
    if(funding.availability.service_mode){$('#wallet-required').textContent='Creation paused';$('#wallet-funding-status').textContent=funding.availability.reason;notice(funding.availability.reason);return;}
    if(funding.status==='unactivated'){
      $('#wallet-funding-status').textContent='Your wallet is connected. This public address is not active on testnet yet. Request free testnet NEAR for the address below, then check again. Plan for about 12 testNEAR; the exact amount is shown after activation.';
      notice(funding.availability.ready?'Activate your connected wallet with free test tokens to continue.':funding.availability.reason);return;
    }
    if(!funding.availability.ready){$('#wallet-funding-status').textContent='Your account balance is verified. '+funding.availability.reason;notice(funding.availability.reason);return;}
    notice('Reading the reviewed factory, your public wallet keys and exact setup quote…');
    review=await client.quote({name:value.name,requestId});showService(review.service);
    $('#wallet-balance').textContent=factoryNear(review.budget.spendable);$('#wallet-required').textContent=factoryNear(review.budget.recommended);
    const enough=review.budget.shortfall==='0';$('#wallet-funding-status').textContent=enough?'Your test-token balance covers the displayed setup and recommended gas headroom.':'Add at least '+factoryNear(review.budget.shortfall)+' in free test tokens, then check again.';
    details('#creation-summary', [['Company account',review.quote.child],['Owned by',review.t.account],['Company creation',factoryNear(review.budget.creation)],['Encrypted setup and two task slots',factoryNear(review.budget.setup)],['Recommended gas headroom',factoryNear(review.budget.gasHeadroom)]]);
    $('#creation-owner-key').textContent=review.publicKey;$('#creation-custody').checked=false;
    details('#creation-technical',[['Factory',config.factory_id],['Factory code',config.factory_code_hash],['Company template SHA-256',config.company_template_sha256],['Immutable request',review.request.id],['Nonrefundable factory record',factoryNear(review.quote.storage)],['Initial company storage backing',factoryNear(review.quote.backing)],['FINAL block',review.block.height+' · '+review.block.hash]]);
    notice(enough?'Your wallet and the recent worker heartbeat are verified. Review company creation next.':'Your wallet is connected. Add free test tokens to finish setup.');controls();
  }
  async function inspectCompany(){
    const saved=client.savedCompany();if(!saved)return false;requestId=saved.request_id;company=await client.inspect(saved.request_id);
    if(!company.record){notice('Your saved request is not visible at the current finalized block. Check its original transaction before starting another.',true);return false;}
    if(company.record.phase!=='active'){
      const r=company.record,refundable=['create_failed','refund_failed'].includes(r.phase)&&r.refund_ready===true&&r.refund_attempt<3;
      show(2,false);$('[data-journey-step="2"]').hidden=true;$('#factory-recovery').hidden=false;
      $('#review-backing-refund').hidden=!refundable;$('#start-after-refund').hidden=r.phase!=='refunded';
      $('#factory-recovery-description').textContent=r.phase==='refunded'?'Your account backing has been returned to the original wallet. The factory record and its nonrefundable storage remain on NEAR.':refundable?'Your company could not be created, or its earlier refund failed. Review a return of the original account backing; no replacement creation is submitted.':'The original creation or refund outcome still needs inspection. Pending or unknown outcomes do not authorize another transaction.';
      details('#factory-recovery-details',[['Original request',r.id],['Company account',r.child],['Current phase',r.phase],['Original wallet',r.creator],['Account backing',factoryNear(r.backing)],['Nonrefundable record storage',factoryNear(r.storage)],['FINAL block',company.block.height+' · '+company.block.hash]]);
      focusPanel('#factory-recovery');notice(r.phase==='refunded'?'The original backing refund is complete.':refundable?'A known failure permits an owner-reviewed backing refund.':'Inspect the original request before making another decision.',r.phase!=='refunded');return true;
    }
    $('#factory-recovery').hidden=true;$('#owned-companies').hidden=true;if(company.serviceSnapshot)showService(company.serviceSnapshot);
    $('#company-created').textContent=company.record.child+' · owner and deployed code verified on NEAR';
    if(company.profile?.profile==='business-operations-v1'){
      if(company.profile.worker_key_id!==config.worker_key_id||company.profile.worker_public_key!==config.worker_public_key||company.company.storage_blocks!==2||company.treasury.operator!==config.operator_id||company.company.operator!==config.operator_id||Object.entries(founderAIPolicy()).some(([key,value])=>company.policy?.[key]!==value))throw Error('Your company’s setup differs from this guided pilot. Inspect the current on-chain configuration.');
      $('#company-ready').textContent=company.record.child+' · encrypted profile and owner-approved policy verified';
      $('#open-founder-workspace').href=founderWorkspaceURL(config,saved.request_id,location.href).href;
      $('#read-founder-company').href=$('#open-founder-workspace').href;
      const returning=company.company.lifetime_tasks>0;$('#open-founder-workspace').textContent=returning?'Continue my business →':'Prepare my first website →';
      const remaining=Math.max(0,2-company.company.lifetime_tasks),readyPanel=$('[data-journey-step="4"]');
      $('#ready-title').replaceChildren(node(root,'span','Your company.'),node(root,'br',''),node(root,'em',remaining===0?'Review its records.':returning?'Its next delivery.':'Its first delivery.'));
      readyPanel.querySelector('.journey-lede').textContent=remaining===0?'Both pilot task slots have been used. Read your saved records, recover completed results and review their public copy.':returning?'One task slot remains. Review your existing work before preparing a separately approved revision.':'Give the worker your approved facts, review the encrypted request, and approve your first draft.';
      if(recoveryFactory(config))readyPanel.querySelector('.journey-lede').textContent=company.readiness?.ready?company.readiness.reason:FOUNDER_CREATION_PAUSED+' '+(company.readiness?.reason||'');
      const next=readyPanel.querySelector('.journey-next ol');next.replaceChildren(...(remaining===0?['Read your existing task records and recover completed results with their separate recovery files.','Review the public copy and choose whether to publish or update your website.','This pilot has used both task slots; it cannot approve another task.']:returning?['Prepare your remaining revision and save its separate recovery file.','Approve the exact revision in your wallet.','Recover and review the result before making its copy public.']:['Prepare your task and save its separate recovery file.','Approve the exact task in your wallet.','Read real progress, recover the result and review a revision.']).map(text=>node(root,'li',text)));
      $('#open-founder-workspace').hidden=!company.readiness?.ready||company.company.lifetime_tasks>=2;
      $('#read-founder-company').hidden=!!company.readiness?.ready&&company.company.lifetime_tasks<2;
      $('#worker-enrollment').hidden=!recoveryFactory(config)&&(remaining===0||!!company.readiness?.ready);
      $('#worker-readiness-detail').textContent=company.readiness?.reason||'Checking your company-specific signing permission and current worker heartbeat.';
      details('#ready-technical',[['Company',company.record.child],['Owner',company.t.account],['Company code',config.company_code_hash],['Worker key identity',config.worker_key_id],['Verified FINAL block',company.block.height+' · '+company.block.hash]]);
      show(4);forgetPrepared();notice('Your original company and its existing setup are verified. Continue with the task capacity shown below.');return true;
    }
    if(company.company.storage_blocks!==0)throw Error('Your company has a partial setup. Keep its current state for inspection before another approval.');
    let value;try{value=brief();}catch{show(0);notice('Your company account is already created. Add its business name and first goal here, then prepare its encrypted setup.');return true;}
    setupSummary(value);show(3);notice('Your company account is verified. Review these business details before preparing its encrypted setup.');return true;
  }
  async function accountChanged(){
    setBusy(true);try{
    generation++;client.invalidate();review=null;company=null;forgetPrepared();refundReview=null;pending=null;$('#wallet-balance-panel').hidden=true;$('#factory-recovery').hidden=true;$('#backing-refund-review').hidden=true;$('#owned-companies').hidden=true;$('#pilot-window').hidden=true;$('#restored-mission').hidden=true;$('#restored-mission').textContent='';$('#restore-mission-file').value='';
    walletSessionChanged();const account=getWalletState().account;$('#wallet-account').textContent=account||'No wallet connected';
    $('#connect-founder-wallet').textContent=account?'Change wallet':'Connect NEAR wallet';
    if(lastAccount&&account!==lastAccount){tabStorage.removeItem(SESSION);$('#business-name').value='';$('#business-goal').value='';requestId='company_'+crypto.randomUUID().replaceAll('-','').slice(0,16);}
    lastAccount=account;if(account)notice('Reading your existing company records and original wallet outcomes…');if(!account){show(1,false);await updatePending();return;}
    restoreBrief(account);await updatePending();
    const callback=new URL(location.href).searchParams.get('transactionHashes');
    if(callback&&pending){const hashes=callback.split(',');if(hashes.length!==1||!HASH.test(hashes[0]))throw Error('The wallet returned an unexpected transaction list. Inspect the original action.');notice('Checking the exact transaction returned by your wallet…');await client.reconcile(hashes[0]);const url=new URL(location.href);url.searchParams.delete('transactionHashes');history.replaceState(null,'',url);await updatePending();}
    if(pending){show(1,false);return;}
    const activation=await client.accountStatus();
    if(activation.status==='unactivated'){if($('#business-name').value&&$('#business-goal').value){show(1,false);await loadQuote();}else{show(0,false);notice('Your wallet is connected. Describe your business, then get free test tokens for its setup.');}return;}
    if(await inspectCompany())return;
    if(await discoverCompanies())return;
    if($('#business-name').value&&$('#business-goal').value){show(1,false);await loadQuote();}
    else{show(0,false);notice('Your wallet session is restored. Describe your business to continue.');}
    }finally{setBusy(false);}
  }
  $('#resume-existing-business').addEventListener('click',guard(async()=>{show(1);if(getWalletState().account){if(!await discoverCompanies(true))notice(recoveryFactory(config)?FOUNDER_CREATION_PAUSED:'No company is registered to this wallet yet. Describe your business to create one.');}else notice('Connect the same testnet wallet you used before. Your existing companies will be read from NEAR.');}));
  $('#resume-connected-business').addEventListener('click',guard(async()=>{if(!getWalletState().account)throw Error('Unlock and connect your wallet to resume.');await accountChanged();}));
  $('#switch-founder-wallet').addEventListener('click',guard(()=>connectWallet(config.factory_id)));
  $('#disconnect-founder-wallet').addEventListener('click',guard(async()=>{await disconnectWallet();walletSessionChanged();notice('Connection forgotten on this browser. Your companies, saved wallet actions and private recovery files are kept.');}));
  $('#copy-founder-address').addEventListener('click',guard(async()=>{const account=getWalletState().account;if(!account)throw Error('Connect your testnet wallet first.');try{await copyText(account);notice('Public testnet receive address copied. Paste it into the faucet, then check again here.');}catch{throw Error('Copy is unavailable in this browser. Select and copy the public address shown above.');}}));
  $('#choose-owned-company').addEventListener('click',guard(()=>discoverCompanies(true)));
  $('#create-another-company').addEventListener('click',guard(async()=>{assertFounderCreationAllowed(config);clearBrief();company=null;review=null;forgetPrepared();requestId='company_'+crypto.randomUUID().replaceAll('-','').slice(0,16);$('#owned-companies').hidden=true;show(0);notice('Describe the next company. Its account and storage are separate from your existing companies.');}));
  $('#restore-mission-file').addEventListener('change',guard(async event=>{const file=event.target.files[0],selected=company,token=generation;let recovery;try{if(!selected?.verification||!file||file.size>8192)throw Error('Choose the matching small private company recovery file.');recovery=JSON.parse(await file.text());const value=await recoverFounderBrief(recovery,{owner:selected.t.account,companyId:selected.record.child,company:selected.company});if(token!==generation||selected!==company)throw Error('Your wallet or company changed while opening the brief. Choose its file again.');$('#business-name').value=value.name;$('#business-goal').value=value.goal;saveBrief();$('#restored-mission').textContent=value.name+' · '+value.goal;$('#restored-mission').hidden=false;notice('Your original brief is open locally. Its recovery key is not saved in this browser.');}finally{if(recovery)recovery.record_key='';event.target.value='';}}));
  $('#business-form').addEventListener('input',()=>{forgetPrepared();controls();});
  $('#business-form').addEventListener('submit',guard(async()=>{forgetPrepared();await validateFounderConfig(config);const value=saveBrief();if(company?.verification){setupSummary(value);show(3);notice('Your original company is selected. Prepare its encrypted setup with these details.');return;}show(1);if(getWalletState().account)await loadQuote();}));
  $('#connect-founder-wallet').addEventListener('click',guard(async()=>{await validateFounderConfig(config);if($('#business-name').value&&$('#business-goal').value)saveBrief();await connectWallet(config.factory_id);}));
  $('#refresh-founder-balance').addEventListener('click',guard(loadQuote));
  $('#review-creation').addEventListener('click',guard(async()=>{assertFounderCreationAllowed(config);if(!review||review.budget.shortfall!=='0'||pending)throw Error('Read the current quote and add the required free test tokens first.');show(2);}));
  $('#creation-custody').addEventListener('change',controls);
  $('#create-founder-company').addEventListener('click',guard(async()=>{
    assertFounderCreationAllowed(config);
    if(!review)throw Error('Read the creation quote first.');const token=generation;notice('Waiting for your wallet approval. Keep this page open…');
    const popup=reserveMyNearWalletPopup(getWalletState().selector);let result;try{result=await client.create(review,$('#creation-custody').checked,popup);}finally{popup?.closeIfBlank();}if(token!==generation)return;review=null;await updatePending();
    if(!await inspectCompany())throw Error('The creation receipt is final; the factory request still needs inspection.');
    if(result.status!=='final'){notice('The creation transaction reached FINAL with a failed receipt. Inspect the original request and its available backing refund.',true);return;}
    notice('Your company account is created and its owner and code are verified. Set its boundaries next.');
  }));
  $('#prepare-founder-setup').addEventListener('click',guard(async()=>{
    assertFounderCreationAllowed(config);
    const value=saveBrief();if(!company?.verification)throw Error('Verify your created company first.');forgetPrepared();const token=generation,selected=company;
    const next=await prepareFounderSetup({companyId:selected.record.child,owner:selected.t.account,config,name:value.name,goal:value.goal,storageByteCost:selected.storageByteCost,storageFundingId:'starter_'+requestId.slice(0,32)});
    if(token!==generation||company!==selected){next.recovery.record_key='';throw Error('Your wallet changed while encrypting. Prepare this setup again.');}prepared=next;preparedBrief={name:value.name,goal:value.goal};setupSummary(preparedBrief);
    $('#setup-recovery').hidden=false;$('#setup-technical').textContent=JSON.stringify({network:'testnet',company:company.record.child,actions:prepared.transaction.actions.map(x=>({method:x.params.methodName,deposit:x.params.deposit,gas:x.params.gas})),worker_key_id:config.worker_key_id},null,2);
    notice('Your brief is encrypted in this browser. Save its private recovery file, then approve the setup.');
  }));
  $('#download-mission-recovery').addEventListener('click',()=>{if(!prepared)return;downloadFile(prepared.recovery,'private-company-recovery-'+requestId+'.json');missionDownloaded=true;controls();});
  $('#mission-recovery-saved').addEventListener('change',controls);
  $('#approve-founder-setup').addEventListener('click',guard(async()=>{
    assertFounderCreationAllowed(config);
    if(!prepared||!missionDownloaded||!$('#mission-recovery-saved').checked)throw Error('Download and save the current mission recovery file first.');
    const value=brief();if(!preparedBrief||value.name!==preparedBrief.name||value.goal!==preparedBrief.goal){forgetPrepared();throw Error('Your business details changed. Prepare a new encrypted setup and save its new recovery file before approving.');}
    const token=generation;notice('Waiting for your wallet to approve the displayed boundaries…');const popup=reserveMyNearWalletPopup(getWalletState().selector);let result;try{result=await client.configure(prepared,company,popup);}finally{popup?.closeIfBlank();}if(token!==generation)return;await updatePending();
    if(result.status!=='final')throw Error('Setup reached FINAL with a failed receipt. Inspect the company’s current state before preparing another setup.');
    await inspectCompany();notice(company.readiness?.ready?'Your company’s boundaries and restricted worker permission are verified. Prepare your first website now.':'Your company’s boundaries are verified. Its restricted worker permission is being prepared.');
  }));
  $('#check-worker-readiness').addEventListener('click',guard(async()=>{await inspectCompany();notice(company?.readiness?.ready?'Your company’s restricted worker permission and recent heartbeat are verified.':'Your company is saved on NEAR. '+(company?.readiness?.reason||'Worker readiness is still being checked.'));}));
  $('#refresh-creation-request').addEventListener('click',guard(inspectCompany));
  $('#review-backing-refund').addEventListener('click',guard(async()=>{if(!company?.record)throw Error('Read the original creation request first.');const token=generation,next=await client.reviewRefund(company.record.id);if(token!==generation)return;refundReview=next;details('#backing-refund-details',[['Return backing to',next.action.review.recipient],['Account backing to return',factoryNear(next.action.review.backing)],['Nonrefundable record storage',factoryNear(next.action.review.nonrefundable_storage)],['Attached deposit','0 testNEAR · network gas still applies']]);$('#backing-refund-review').hidden=false;$('#backing-refund-consent').checked=false;}));
  $('#backing-refund-consent').addEventListener('change',controls);
  $('#approve-backing-refund').addEventListener('click',guard(async()=>{if(!refundReview||!$('#backing-refund-consent').checked)throw Error('Review the original backing refund first.');const token=generation,popup=reserveMyNearWalletPopup(getWalletState().selector);let result;try{result=await client.refund(refundReview,popup);}finally{popup?.closeIfBlank();}if(token!==generation)return;refundReview=null;$('#backing-refund-review').hidden=true;await updatePending();await inspectCompany();if(result.status!=='final')throw Error('The refund is FINAL with a failed receipt. Inspect its current known state before another decision.');}));
  $('#start-after-refund').addEventListener('click',guard(async()=>{await client.startNewAfterRefund();generation++;client.invalidate();review=null;company=null;refundReview=null;forgetPrepared();requestId='company_'+crypto.randomUUID().replaceAll('-','').slice(0,16);$('#factory-recovery').hidden=true;show(0);notice('The finalized refund is preserved in your public company history. Describe the next company setup.');}));
  $('#open-founder-workspace').addEventListener('click',event=>{if(busy){event.preventDefault();return;}try{const value=brief();tabStorage.setItem(HANDOFF,JSON.stringify({schema:1,company:company.record.child,owner:company.t.account,name:value.name,goal:value.goal}));tabStorage.removeItem(SESSION);}catch{} });
  $('#reconcile-form').addEventListener('submit',guard(async()=>{notice('Reading the original transaction at FINAL…');const result=await client.reconcile($('#reconcile-hash').value.trim()||null);await updatePending();if(result.status!=='final')throw Error('The original action is FINAL with a failed receipt. Inspect the company before another approval.');await inspectCompany();notice('Your original wallet action is finalized and reconciled. No replacement transaction was sent.');}));
  root.querySelectorAll('[data-step-back]').forEach(button=>button.addEventListener('click',()=>{if(!busy&&!pending)show(Number(button.dataset.stepBack));}));
  async function start(){
    walletSessionChanged();restoreBrief(getWalletState().account);
    if(recoveryFactory(config)){
      const first=$('[data-journey-step="0"]');
      first.querySelector('.journey-kicker').textContent='EXISTING COMPANIES';
      $('#business-title').replaceChildren(node(root,'span','Your company.'),node(root,'br',''),node(root,'em','Continue its work.'));
      first.querySelector('.journey-lede').textContent='New company setup is paused. Open an existing company to read its records, recover work or review its public website.';
      first.querySelector('.journey-detail').hidden=true;
      $('#resume-existing-business').className='journey-button';$('#resume-existing-business').textContent='Open my existing company →';
    }
    try{await validateFounderConfig(config);}catch(e){notice(e.message,true);}
    if(getWalletState().account)await accountChanged();else{show(0,false);if(recoveryFactory(config))notice(FOUNDER_CREATION_PAUSED);}
    controls();
  }
  return {start,accountChanged,walletSessionChanged,connectionNotice:message=>notice(message,true),client,show};
}
