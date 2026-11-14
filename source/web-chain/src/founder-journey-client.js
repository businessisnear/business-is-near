import {inspectWalletCandidate} from './founder-reconcile.js';
import {founderWalletLeaseKey} from './wallet-popup.js';
import {FOUNDER_RECOVERY, FOUNDER_RECOVERY_ONLY, recoveryFactory, assertFounderCreationAllowed, founderCreationAvailability} from './founder-service-policy.js';
import {checkFounderNetwork,founderQuery,founderView,createFounderRPC,FounderAccountMissing} from './founder-rpc.js';
import {founderAccount, validateFounderConfig, validateFounderService, founderRequest, founderBudget,
  founderCreateAction, FACTORY_CUSTODY_ACK, FACTORY_GAS, canonicalFactory, factoryPublicKeyHex,
  factoryFingerprint, factoryWalletTransaction, validateFactoryWalletOutcome, verifyProvisionedCompany,
  setupPending, validateSetupOutcome, validateFounderPending, companyFactoryRecovery, founderWorkerReadiness, validateFounderSetupTransaction,ownedFounderRecords} from './founder-journey-core.js';

const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const b64=value=>btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),c=>String.fromCharCode(c)).join(''));
const pendingKey=(factory,owner)=>'business-is-near-founder-pending-v1:'+factory+':'+owner;
const recordKey=(factory,owner)=>'business-is-near-founder-company-v1:'+factory+':'+owner;
function decode(value) {
  if (!Array.isArray(value) || value.length>1000000 || value.some(x=>!Number.isInteger(x)||x<0||x>255)) throw Error('Invalid finalized company response.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value)));
}
export async function inspectFounderWorkspace({config,recordId,rpc=createFounderRPC()}) {
  await validateFounderConfig(config);if(typeof recordId!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(recordId))throw Error('Choose a valid saved company request.');
  await checkFounderNetwork(rpc);const block=await rpc.finalBlock();
  const view=(id,method,args={})=>founderView(rpc,founderAccount(id),method,args,block);
  const [factory,template,record,protocol]=await Promise.all([
    founderQuery(rpc,{request_type:'view_account',account_id:config.factory_id},block),
    view(config.factory_id,'template'),view(config.factory_id,'record',{id:recordId}),rpc.request('EXPERIMENTAL_protocol_config',{block_id:block.hash})]);
  if(factory.code_hash!==config.factory_code_hash||template.sha256!==config.company_template_sha256||template.schema!=='near-company-factory-v1'||record?.id!==recordId||record.phase!=='active'||record.template_sha256!==config.company_template_sha256||!record.child?.endsWith('.'+config.factory_id))throw Error('This company is not a verified active creation from the reviewed factory.');
  founderAccount(record.creator);founderAccount(record.child);
  const [account,keys,treasury,profile]=await Promise.all([
    founderQuery(rpc,{request_type:'view_account',account_id:record.child},block),
    founderQuery(rpc,{request_type:'view_access_key_list',account_id:record.child},block),view(record.child,'state'),view(record.child,'execution_profile')]);
  const context={network:'testnet',factory:config.factory_id,creator:record.creator,factory_code_hash:factory.code_hash,expected_factory_code_hash:config.factory_code_hash,template_sha256:template.sha256,template_bytes:template.bytes,protocol_storage_byte_cost:protocol?.runtime_config?.storage_amount_per_byte};
  verifyProvisionedCompany(context,record,{account_id:record.child,code_hash:account.code_hash,owner:treasury.owner,keys:keys.keys});
  if(account.code_hash!==config.company_code_hash||treasury.operator!==config.operator_id||profile?.worker_key_id!==config.worker_key_id||profile.worker_public_key!==config.worker_public_key||profile.profile!=='business-operations-v1')throw Error('Your company’s reviewed worker profile or operator changed.');
  return Object.freeze({record_id:recordId,company_id:record.child,code_hash:config.company_code_hash,worker_key_id:config.worker_key_id,owner:record.creator});
}
export async function readFounderReadiness({config,companyId,block,rpc=createFounderRPC()}) {
  if(recoveryFactory(config)&&companyId!==FOUNDER_RECOVERY.company)return {ready:false,reason:FOUNDER_RECOVERY_ONLY,service_mode:FOUNDER_RECOVERY.mode};
  const [service,keys,company,policy,originalTask]=await Promise.all([
    founderView(rpc,config.factory_id,'worker_service',{},block),
    founderQuery(rpc,{request_type:'view_access_key_list',account_id:config.operator_id},block),
    recoveryFactory(config)?founderView(rpc,companyId,'company_state',{},block):null,
    recoveryFactory(config)?founderView(rpc,companyId,'ai_policy',{},block):null,
    recoveryFactory(config)?founderView(rpc,companyId,'company_task',{id:FOUNDER_RECOVERY.originalTask},block):null]);
  try{return founderWorkerReadiness(service,keys,config,companyId,{company,policy,originalTask:originalTask?{...originalTask,id:FOUNDER_RECOVERY.originalTask}:null});}catch(error){return {ready:false,reason:error.message,service_expires_at:service?.service_expires_at,heartbeat_at:service?.heartbeat_at,observed_at:service?.observed_at};}
}
export function createFounderClient({config, getWalletState, storage=globalThis.localStorage, rpc=createFounderRPC(), changed=()=>{}}) {
  let epoch=0;
  const invalidate=()=>{epoch++;changed();};
  function ticket(){const {selector,account}=getWalletState();founderAccount(account);return {epoch,selector,account};}
  function current(t){const s=getWalletState();if(t.epoch!==epoch||s.selector!==t.selector||s.account!==t.account) throw Error('Your wallet changed. Review this step again before approving.');}
  async function finalBlock(){await checkFounderNetwork(rpc);return rpc.finalBlock();}
  async function view(contract,method,args,block){return founderView(rpc,founderAccount(contract),method,args,block);}
  async function service(block){const state=await view(config.factory_id,'worker_service',{},block);return validateFounderService(state,config);}
  async function context({availability=true}={}) {
    if(availability)assertFounderCreationAllowed(config);
    const t=ticket();await validateFounderConfig(config);const block=await finalBlock();
    const [info,template,state,protocol,owner,keys,live]=await Promise.all([
      founderQuery(rpc,{request_type:'view_account',account_id:config.factory_id},block),view(config.factory_id,'template',{},block),
      view(config.factory_id,'state',{},block),rpc.request('EXPERIMENTAL_protocol_config',{block_id:block.hash}),
      founderQuery(rpc,{request_type:'view_account',account_id:t.account},block),
      availability?founderQuery(rpc,{request_type:'view_access_key_list',account_id:t.account},block):Promise.resolve({keys:[]}),
      availability?service(block):Promise.resolve(null)]);
    current(t);
    if(info.code_hash!==config.factory_code_hash || template.schema!=='near-company-factory-v1' || template.sha256!==config.company_template_sha256 || template.full_access_custody_ack!==FACTORY_CUSTODY_ACK || template.create_gas!==FACTORY_GAS.create || template.init_method!=='init' || !Number.isSafeInteger(template.bytes) || template.bytes<1 || typeof state.frozen!=='boolean' || state.max_records!==128 || !Number.isSafeInteger(state.count)) throw Error('Company creation code differs from the reviewed release.');
    if(availability&&state.frozen) throw Error('New company creation is paused. Existing companies remain available.');
    if(availability&&state.count>=8)throw Error('All eight places in this testnet pilot have been used. You can still inspect your existing company or the recorded example.');
    if(!Array.isArray(keys.keys)||keys.keys.length>128) throw Error('Could not verify this wallet’s original account keys.');
    const full=keys.keys.filter(k=>k.access_key?.permission==='FullAccess').map(k=>{try{return {publicKey:k.public_key,hex:factoryPublicKeyHex(k.public_key)};}catch{return null;}}).filter(Boolean);
    if(availability&&full.length!==1) throw Error('This guided pilot requires an account with exactly one Ed25519 owner key. Your wallet’s signing key cannot be chosen safely from multiple owner keys. Use a separate testnet account; never paste a private key.');
    const cost=protocol?.runtime_config?.storage_amount_per_byte;
    if(typeof cost!=='string'||!/^[1-9][0-9]{0,38}$/.test(cost)||typeof owner.amount!=='string'||!Number.isSafeInteger(owner.storage_usage)||owner.storage_usage<0) throw Error('Could not read the current test-token storage price or wallet balance.');
    return {t,block,owner,publicKey:full.length===1?full[0].publicKey:null,service:live,state,storageByteCost:cost,
      factory:{network:'testnet',factory:config.factory_id,creator:t.account,factory_code_hash:info.code_hash,
        expected_factory_code_hash:config.factory_code_hash,template_sha256:template.sha256,template_bytes:template.bytes,protocol_storage_byte_cost:cost}};
  }
  async function accountStatus(){
    const t=ticket();await validateFounderConfig(config);const block=await finalBlock();
    const owner=await founderQuery(rpc,{request_type:'view_account',account_id:t.account},block).catch(error=>{
      if(error instanceof FounderAccountMissing&&error.accountId===t.account&&error.blockHash===block.hash&&error.blockHeight===block.height)return null;throw error;
    });current(t);return {t,block,owner,status:owner?'activated':'unactivated'};
  }
  async function fundingStatus(){
    const {t,block,owner,status}=await accountStatus();
    const [info,snapshot,state,protocol]=await Promise.all([
      founderQuery(rpc,{request_type:'view_account',account_id:config.factory_id},block),view(config.factory_id,'worker_service',{},block),
      view(config.factory_id,'state',{},block),rpc.request('EXPERIMENTAL_protocol_config',{block_id:block.hash})]);current(t);
    if(info.code_hash!==config.factory_code_hash||typeof state.frozen!=='boolean'||state.max_records!==128||!Number.isSafeInteger(state.count)||state.count<0)throw Error('Company creation code differs from the reviewed release.');
    let availability={ready:true,reason:''};
    try{validateFounderService(snapshot,config);if(state.frozen)throw Error('New company creation is paused. Existing companies remain available.');if(state.count>=8)throw Error('All eight places in this testnet pilot have been used. Existing companies remain available.');}
    catch(error){availability={ready:false,reason:error.message};}
    availability=founderCreationAvailability(config)||availability;
    const storageByteCost=protocol?.runtime_config?.storage_amount_per_byte;
    if(typeof storageByteCost!=='string'||!/^[1-9][0-9]{0,38}$/.test(storageByteCost))throw Error('Could not read the current test-token storage price.');
    if(owner&&(typeof owner.amount!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(owner.amount)||!Number.isSafeInteger(owner.storage_usage)||owner.storage_usage<0))throw Error('Could not read this wallet’s public balance.');
    const retained=owner?BigInt(storageByteCost)*BigInt(owner.storage_usage):0n;
    const spendable=owner?String(BigInt(owner.amount)>retained?BigInt(owner.amount)-retained:0n):'0';
    return {status,account:t.account,block,spendable,service:snapshot,availability,places:availability.service_mode?0:Math.max(0,8-state.count)};
  }
  async function savedPending(owner=getWalletState().account){if(!owner)return null;const raw=storage.getItem(pendingKey(config.factory_id,owner));if(!raw)return null;if(raw.length>32000) throw Error('Saved wallet action is too large. Keep it for inspection.');return validateFounderPending(JSON.parse(raw),config,owner);}
  function savePending(value){const owner=value.kind==='create'?value.pending.creator:value.account,key=pendingKey(config.factory_id,owner),raw=storage.getItem(key);if(raw){const old=JSON.parse(raw),oldId=old.kind==='create'?old.pending.request_id:old.request_id,newId=value.kind==='create'?value.pending.request_id:value.request_id;if(oldId!==newId)throw Error('Another wallet action remains unresolved. Inspect it before approving another.');}storage.setItem(key,JSON.stringify(value));changed();}
  function clearPending(value){const owner=value.kind==='create'?value.pending.creator:value.account,key=pendingKey(config.factory_id,owner),raw=storage.getItem(key);if(!raw)return;const old=JSON.parse(raw);if((old.kind==='create'?old.pending.request_id:old.request_id)!==(value.kind==='create'?value.pending.request_id:value.request_id))throw Error('Saved action changed during verification.');storage.removeItem(key);changed();}
  async function quote({name,requestId}) {
    assertFounderCreationAllowed(config);
    const c=await context();if(await savedPending(c.t.account))throw Error('Inspect your saved wallet action before requesting another signature.');
    const request=founderRequest({config,owner:c.t.account,name,requestId,publicKey:c.publicKey});
    const quote=await view(config.factory_id,'quote',request,c.block);current(c.t);
    await founderCreateAction(c.factory,request,quote,true);current(c.t);
    return {...c,request,quote,budget:founderBudget(quote,c.storageByteCost,c.owner)};
  }
  async function withLease(owner,action){if(!navigator.locks)throw Error('This browser cannot coordinate wallet approvals safely. Use a current browser.');return navigator.locks.request(founderWalletLeaseKey(owner),{ifAvailable:true},lock=>{if(!lock)throw Error('Another tab is handling this company’s wallet approval.');return action();});}
  async function send(transaction,t,dispatch) {
    if(transaction?.actions?.some(action=>action.params?.methodName==='create'||action.params?.methodName==='init'))assertFounderCreationAllowed(config);
    current(t);const wallet=await t.selector.wallet();current(t);
    const accounts=await wallet.getAccounts();current(t);
    if(!Array.isArray(accounts)||!accounts.some(x=>x.accountId===t.account))throw Error('Your selected wallet no longer owns this account.');
    if(transaction.signerId!==t.account)throw Error('The reviewed wallet account changed.');
    const {internalActionToNaj}=await import('./wallet-sdk.js');current(t);
    const request={...transaction,actions:transaction.actions.map(internalActionToNaj),callbackUrl:new URL('./founder.html',location.href).href};
    dispatch.reservation?.assertOpen();dispatch.invoked=true;return wallet.signAndSendTransaction(request);
  }
  async function finish(value,out,verified=null) {
    const rawBlock=verified?null:await rpc.request('block',{block_id:out?.transaction_outcome?.block_hash});
    const checked=verified||(value.kind==='create'?validateFactoryWalletOutcome(out,value.pending,rawBlock.header):validateSetupOutcome(out,value,rawBlock.header));
    if(value.kind==='create') {
      const p=value.pending;
      storage.setItem(recordKey(config.factory_id,p.creator),JSON.stringify({schema:1,owner:p.creator,request_id:p.action.args.id,factory:config.factory_id}));
    }
    clearPending(value);return checked;
  }
  async function finalizeReturned(value,returned) {
    const hash=returned?.transaction?.hash||returned?.transaction_outcome?.id||null;
    if(value.kind==='create')value.pending.tx_hash=HASH.test(hash||'')?hash:null;else value.tx_hash=HASH.test(hash||'')?hash:null;
    savePending(value);
    if(!HASH.test(hash||''))throw Error('Your wallet returned without a transaction hash. Your original action is saved; inspect wallet history before trying another action.');
    const result=returned.final_execution_status==='FINAL'?returned:await rpc.request('tx',{tx_hash:hash,sender_account_id:value.kind==='create'?value.pending.creator:value.account,wait_until:'FINAL'});
    return finish(value,result);
  }
  async function create(review,acknowledged,reservation=null) {
    assertFounderCreationAllowed(config);
    return withLease(review.t.account,async()=>{
      current(review.t);if(await savedPending(review.t.account))throw Error('Resolve the saved wallet action first.');
      const fresh=await context();current(review.t);if(factoryPublicKeyHex(fresh.publicKey)!==review.request.owner_key_hex)throw Error('Your original owner key changed. Review a new creation quote.');const request=review.request;const currentQuote=await view(config.factory_id,'quote',request,fresh.block);current(review.t);const budget=founderBudget(currentQuote,fresh.storageByteCost,fresh.owner);
      const action=await founderCreateAction(fresh.factory,request,currentQuote,acknowledged);
      const original=await founderCreateAction(review.factory,review.request,review.quote,acknowledged);
      if(canonicalFactory(action)!==canonicalFactory(original))throw Error('The creation quote changed. Review the latest amount again.');
      if(budget.shortfall!=='0')throw Error('Add the displayed free test tokens before creating your company.');
      const p={version:1,request_id:crypto.randomUUID().replaceAll('-',''),network:'testnet',chain_id:'testnet',factory:config.factory_id,
        creator:fresh.t.account,factory_code_hash:config.factory_code_hash,template_sha256:config.company_template_sha256,
        action,started_height:fresh.block.height,started_block:fresh.block.hash,tx_hash:null};p.fingerprint=await factoryFingerprint(p);
      const value={kind:'create',pending:p};current(review.t);savePending(value);
      const dispatch={invoked:false,reservation};try{return await finalizeReturned(value,await send(factoryWalletTransaction(action,p.creator),review.t,dispatch));}catch(error){if(!dispatch.invoked)clearPending(value);throw error;}
    });
  }
  async function inspect(requestId) {
    const c=await context({availability:false});const record=await view(config.factory_id,'record',{id:requestId},c.block);current(c.t);
    if(!record)return {...c,record:null};
    if(record.id!==requestId||record.creator!==c.t.account||record.template_sha256!==config.company_template_sha256)throw Error('This creation request belongs to another wallet or template.');
    if(record.phase!=='active')return {...c,record};
    const [info,keys,treasury,company,profile,policy]=await Promise.all([
      founderQuery(rpc,{request_type:'view_account',account_id:record.child},c.block),
      founderQuery(rpc,{request_type:'view_access_key_list',account_id:record.child},c.block),
      view(record.child,'state',{},c.block),view(record.child,'company_state',{},c.block),
      view(record.child,'execution_profile',{},c.block),view(record.child,'ai_policy',{},c.block)]);current(c.t);
    if(info.code_hash!==config.company_code_hash)throw Error('Your company code differs from the reviewed template.');
    const verification=verifyProvisionedCompany(c.factory,record,{account_id:record.child,code_hash:info.code_hash,owner:treasury.owner,keys:keys.keys});
    let readiness={ready:false,reason:'Preparing your company’s restricted worker permission.'},serviceSnapshot=null;
    if(profile?.profile==='business-operations-v1'){
      try{const[live,operatorKeys,originalTask]=await Promise.all([view(config.factory_id,'worker_service',{},c.block),founderQuery(rpc,{request_type:'view_access_key_list',account_id:config.operator_id},c.block),recoveryFactory(config)&&record.child===FOUNDER_RECOVERY.company?view(record.child,'company_task',{id:FOUNDER_RECOVERY.originalTask},c.block):null]);current(c.t);serviceSnapshot=live;readiness=founderWorkerReadiness(live,operatorKeys,config,record.child,{company,policy,originalTask:originalTask?{...originalTask,id:FOUNDER_RECOVERY.originalTask}:null});}catch(error){current(c.t);readiness={ready:false,reason:error.message};}
    }
    return {...c,record,verification,treasury,company,profile,policy,readiness,serviceSnapshot};
  }
  async function configure(prepared,inspected,reservation=null) {
    assertFounderCreationAllowed(config);
    const t=inspected.t;return withLease(t.account,async()=>{
      current(t);if(await savedPending(t.account))throw Error('Resolve the saved wallet action first.');
      const fresh=await inspect(inspected.record.id);current(t);await service(fresh.block);current(t);
      if(fresh.profile?.profile==='business-operations-v1')throw Error('Your company already has a worker profile. Read its current state instead of configuring it again.');
      if(fresh.company?.storage_blocks!==0||fresh.treasury.owner!==t.account||fresh.treasury.frozen)throw Error('This company is no longer an empty owner-controlled setup. Inspect its current state.');
      if(prepared.transaction.signerId!==t.account||prepared.transaction.receiverId!==fresh.record.child||prepared.worker_key_id!==config.worker_key_id||prepared.storage!==String(BigInt(fresh.storageByteCost)*65536n))throw Error('Setup quote or owner changed. Review the boundaries again.');
      await validateFounderSetupTransaction(prepared.transaction,{owner:t.account,companyId:fresh.record.child,config,storageByteCost:fresh.storageByteCost});current(t);
      const pending=await setupPending(prepared.transaction,config.company_code_hash,fresh.block);current(t);savePending(pending);
      const dispatch={invoked:false,reservation};try{return await finalizeReturned(pending,await send(prepared.transaction,t,dispatch));}catch(error){if(!dispatch.invoked)clearPending(pending);throw error;}
    });
  }
  async function reviewRefund(requestId){const c=await context({availability:false}),record=await view(config.factory_id,'record',{id:requestId},c.block);current(c.t);const method=record?.phase==='refund_failed'?'retry_refund':'claim_refund';const action=companyFactoryRecovery(c.factory,record,method);return {...c,record,action};}
  async function refund(review,reservation=null){return withLease(review.t.account,async()=>{
    current(review.t);if(await savedPending(review.t.account))throw Error('Inspect the original saved action before approving a refund.');
    const fresh=await reviewRefund(review.record.id);current(review.t);if(canonicalFactory(fresh.action)!==canonicalFactory(review.action))throw Error('The refund state changed. Review the current request again.');
    const p={version:1,request_id:crypto.randomUUID().replaceAll('-',''),network:'testnet',chain_id:'testnet',factory:config.factory_id,creator:fresh.t.account,
      factory_code_hash:config.factory_code_hash,template_sha256:config.company_template_sha256,action:fresh.action,started_height:fresh.block.height,started_block:fresh.block.hash,tx_hash:null};p.fingerprint=await factoryFingerprint(p);
    const value={kind:'create',pending:p};savePending(value);const dispatch={invoked:false,reservation};
    try{return await finalizeReturned(value,await send(factoryWalletTransaction(fresh.action,p.creator),review.t,dispatch));}catch(error){if(!dispatch.invoked)clearPending(value);throw error;}
  });}
  async function startNewAfterRefund(){assertFounderCreationAllowed(config);const saved=savedCompany();if(!saved)throw Error('No refunded company request is saved.');if(await savedPending())throw Error('Inspect the original pending action first.');const c=await context({availability:false}),record=await view(config.factory_id,'record',{id:saved.request_id},c.block);current(c.t);if(record?.creator!==c.t.account||record.phase!=='refunded')throw Error('Read the known finalized refund before starting another company.');const historyKey=recordKey(config.factory_id,c.t.account)+':history',raw=storage.getItem(historyKey),history=raw?JSON.parse(raw):[];if(!Array.isArray(history)||history.length>8)throw Error('Saved company history needs inspection.');storage.setItem(historyKey,JSON.stringify([...history,saved].slice(-8)));storage.removeItem(recordKey(config.factory_id,c.t.account));}
  async function serviceSnapshot(){const c=await context({availability:false}),snapshot=await view(config.factory_id,'worker_service',{},c.block);current(c.t);return snapshot;}
  async function discover(){const c=await context({availability:false}),page=await view(config.factory_id,'list',{from:0,limit:8},c.block);current(c.t);return ownedFounderRecords(page,config,c.t.account);}
  async function selectCompany(requestId){if(await savedPending())throw Error('Inspect the original saved wallet action before switching companies.');const selected=await inspect(requestId);if(!selected.record)throw Error('The selected company request was not found.');storage.setItem(recordKey(config.factory_id,selected.t.account),JSON.stringify({schema:1,owner:selected.t.account,request_id:requestId,factory:config.factory_id}));return selected;}
  async function reconcile(hash) {
    const value=await savedPending();if(!value)throw Error('There is no unresolved wallet action.');
    const t=ticket(),known=value.kind==='create'?value.pending.tx_hash:value.tx_hash;
    if(!HASH.test(hash||known||''))throw Error('Enter the exact transaction hash from wallet history.');
    if(known&&hash&&known!==hash)throw Error('That hash differs from the original saved wallet action.');
    const {candidate,out,result}=await inspectWalletCandidate({pending:value,hash,knownHash:known,account:t.account,rpc,
      setHash:(next,selected)=>{if(next.kind==='create')next.pending.tx_hash=selected;else next.tx_hash=selected;},
      validate:(out,next,header)=>next.kind==='create'?validateFactoryWalletOutcome(out,next.pending,header):validateSetupOutcome(out,next,header)});
    current(t);return finish(candidate,out,result);
  }
  function savedCompany(){const account=getWalletState().account;if(!account)return null;const raw=storage.getItem(recordKey(config.factory_id,account));if(!raw)return null;const v=JSON.parse(raw);if(Object.keys(v).sort().join(',')!=='factory,owner,request_id,schema'||v.schema!==1||v.factory!==config.factory_id||v.owner!==account||!/^[A-Za-z0-9_-]{1,48}$/.test(v.request_id))throw Error('Saved company metadata needs inspection.');return v;}
  return {invalidate,accountStatus,fundingStatus,context,quote,create,inspect,configure,reconcile,savedPending,savedCompany,service,view,finalBlock,reviewRefund,refund,startNewAfterRefund,discover,selectCompany,serviceSnapshot};
}
