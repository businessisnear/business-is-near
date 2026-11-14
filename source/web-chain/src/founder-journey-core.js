import {canonicalFactory, factoryFingerprint, factoryPublicKeyHex, factoryWalletTransaction, validateFactoryPending, validateFactoryWalletOutcome} from './company-factory-client.js';
import {FACTORY_CUSTODY_ACK, FACTORY_GAS, companyFactoryQuoteRequest, companyFactoryCreate, companyFactoryRecovery, verifyProvisionedCompany} from './company-factory-actions.js';
import {validateFinalOutcome} from '../../executor/outcome.mjs';
import {newRecordKey, encrypt, decrypt, sealKey, digest, publicKeyId, validateEnvelope} from './crypto.js';
import {assertFounderCreationAllowed, recoveryFactory, recoveryAdmission, FOUNDER_RECOVERY} from './founder-service-policy.js';

export const FOUNDER_STORAGE = 'business-is-near-founder-v1';
export const FOUNDER_STEPS = Object.freeze(['Your business', 'Your wallet', 'Create company', 'Set boundaries', 'First delivery']);
const ACCOUNT = /^(?:(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet|[a-f0-9]{64})$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, SHA = /^[a-f0-9]{64}$/;
const CONFIG_FIELDS = ['schema','network','deployment_status','factory_id','factory_code_hash','company_code_hash','company_template_sha256','worker_public_key','worker_key_id','operator_id','supplier_id','execution_backend','cloud_billing_verified','tee_verified'];
const CONFIGURATION_METHODS = ['company_set', 'company_fund_storage', 'set_execution_profile', 'ai_set_policy'];
const own = (v,k) => Object.hasOwn(v,k);
function exact(v, keys, label) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) throw Error('Unexpected '+label+'.');
  return v;
}
function amount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(value) || BigInt(value) >= 2n**128n) throw Error('Invalid test-token amount.');
  return BigInt(value);
}
export function founderAccount(value) { if (typeof value !== 'string' || !ACCOUNT.test(value)) throw Error('Use a NEAR testnet account.'); return value; }
export function founderSlug(name, factory) {
  const room=Math.min(24,63-factory.length);
  let label = String(name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,room).replace(/-+$/,'');
  if(!label)label='business'.slice(0,room);else if(!/^[a-z]/.test(label))label=('business-'+label).slice(0,room).replace(/-+$/,'');
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(label)) throw Error('The company account label could not be prepared.');
  founderAccount(label+'.'+factory); return label;
}
export async function validateFounderConfig(value) {
  exact(value, CONFIG_FIELDS, 'public onboarding configuration');
  if (value.schema !== 1 || value.network !== 'testnet' || value.deployment_status !== 'finalized' ||
      value.execution_backend !== 'local_gemma_mock' || value.cloud_billing_verified !== false || value.tee_verified !== false) {
    throw Error('New-company setup is not verified for this release yet. You can inspect the recorded example while setup is completed.');
  }
  for (const k of ['factory_id','operator_id','supplier_id']) founderAccount(value[k]);
  if (!HASH.test(value.factory_code_hash) || !HASH.test(value.company_code_hash) || !SHA.test(value.company_template_sha256) || !SHA.test(value.worker_key_id)) throw Error('Onboarding identities are incomplete.');
  if (await publicKeyId(value.worker_public_key) !== value.worker_key_id) throw Error('The reviewed worker encryption key changed.');
  return Object.freeze({...value});
}
export function founderCompanyConfig(config) {
  return {operator:config.operator_id,supplier:config.supplier_id,price:'1',fee:'1',reserve:'0',perJob:'1',daily:'1'};
}
export function validateFounderService(service, config) {
  if (!service || service.schema !== 'near-founder-worker-service-v1' || service.operator_id !== config.operator_id ||
      service.worker_public_key !== config.worker_public_key || service.worker_key_id !== config.worker_key_id ||
      service.model !== 'gemma4:e2b-it-q4_K_M' || service.model_digest !== 'b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2' ||
      service.execution_backend !== 'local_gemma_mock' || service.cloud_billing_verified !== false || service.tee_verified !== false ||
      service.max_companies !== 8 || service.max_reservations_per_company !== 2 || service.max_reservations_global !== 16) throw Error('The worker service differs from the reviewed pilot.');
  for (const key of ['service_expires_at','heartbeat_at','heartbeat_expires_at','observed_at']) {
    if (typeof service[key] !== 'string' || !/^(0|[1-9][0-9]{0,10})$/.test(service[key])) throw Error('Worker availability is incomplete.');
  }
  const now=BigInt(service.observed_at), heartbeat=BigInt(service.heartbeat_at), until=BigInt(service.heartbeat_expires_at), end=BigInt(service.service_expires_at);
  if (typeof service.online !== 'boolean' || heartbeat>now || until<heartbeat || until-heartbeat>600n || until>end) throw Error('Worker heartbeat identity is invalid.');
  if (!service.online || now>=until || now>=end) throw Error('The worker is offline or its pilot window has ended. Your company and saved work remain on NEAR. Check availability before approving new work.');
  return service;
}
export function founderAIPolicy() {
  return {enabled:true,scope_consent:true,selected_model:'economy',allow_economy:true,allow_expensive:false,
    per_call_nanos:'1000000',daily_nanos:'2000000',lifetime_nanos:'2000000',max_input_tokens:4608,
    max_output_tokens:512,max_calls_per_job:1,max_calls_per_day:2};
}
export function founderWorkerReadiness(service, keys, config, companyId, admission = null) {
  let limited = null;
  if (recoveryFactory(config)) {
    limited = recoveryAdmission({...admission, companyId, service});
    if (!limited.ready) return limited;
  }
  validateFounderService(service,config);founderAccount(companyId);
  if (!Array.isArray(keys?.keys) || keys.keys.length>128) throw Error('The worker’s company-specific signing permission is not available yet.');
  const methods=['company_tick','ai_reserve_call','ai_complete_call','company_attest','company_archive'].sort().join(',');
  const key=keys.keys.find(k=>{const p=k.access_key?.permission?.FunctionCall;return p&&p.receiver_id===companyId&&
    Array.isArray(p.method_names)&&p.method_names.length===5&&[...p.method_names].sort().join(',')===methods&&
    typeof p.allowance==='string'&&/^[1-9][0-9]{0,38}$/.test(p.allowance)&&BigInt(p.allowance)>=200000000000000000000000n;});
  if(!key)throw Error('Your company is created. Its restricted worker permission is still being prepared. Check readiness again shortly.');
  return {ready:true,...limited,public_key:key.public_key,heartbeat_at:service.heartbeat_at,heartbeat_expires_at:service.heartbeat_expires_at,observed_at:service.observed_at,service_expires_at:service.service_expires_at};
}
export function ownedFounderRecords(page,config,owner){
  founderAccount(owner);
  if(!page||!Array.isArray(page.records)||page.records.length>8||!Number.isSafeInteger(page.total)||page.total<0||page.total>8||page.records.length!==page.total)throw Error('The complete bounded company registry could not be read. Do not create a replacement company.');
  const ids=new Set();for(const r of page.records){if(!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(r.id)||['__proto__','constructor','prototype'].includes(r.id)||ids.has(r.id)||r.template_sha256!==config.company_template_sha256||typeof r.child!=='string'||!r.child.endsWith('.'+config.factory_id))throw Error('Company registry identity is incomplete.');founderAccount(r.creator);founderAccount(r.child);ids.add(r.id);}
  return page.records.filter(r=>r.creator===owner);
}
export async function recoverFounderBrief(recovery,{owner,companyId,company}){
  exact(recovery,['schema','network','company_id','owner','idea_hash','goal_hash','record_key'],'private company recovery file');
  if(recovery.schema!=='business-is-near-mission-recovery-v1'||recovery.network!=='testnet'||recovery.company_id!==companyId||recovery.owner!==owner||
    recovery.idea_hash!==company?.idea_hash||recovery.goal_hash!==company?.goal_hash||typeof recovery.record_key!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(recovery.record_key))throw Error('This private recovery file does not match the verified company, owner and encrypted brief.');
  const name=await decrypt(company.encrypted_idea,recovery.record_key,recovery.idea_hash),goal=await decrypt(company.encrypted_goal,recovery.record_key,recovery.goal_hash);
  if(name.length<2||name.length>80||goal.length<10||goal.length>400)throw Error('The recovered brief is outside this guided pilot’s bounds.');
  return {name,goal};
}
export function founderServiceTiming(service){
  if(service?.service_mode===FOUNDER_RECOVERY.mode)return 'Finite recovery service: only the original company’s remaining website revision. New company creation is paused. '+(service.admission_expires_at?'Current admission ends '+new Date(Number(service.admission_expires_at)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC')+'.':'Read the current recovery heartbeat before preparing work.');
  const values=['service_expires_at','heartbeat_at','observed_at'];
  if(!service||values.some(k=>typeof service[k]!=='string'||!/^(0|[1-9][0-9]{0,10})$/.test(service[k])))return 'The pilot’s worker lease could not be read. Existing records remain available.';
  const end=new Date(Number(service.service_expires_at)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC');
  const age=Number(service.observed_at)-Number(service.heartbeat_at);
  return 'Worker pilot ends '+end+'. '+(Number(service.heartbeat_at)>0&&age>=0?'Last on-chain check '+age+' seconds before this finalized read.':'No worker heartbeat has been recorded.')+' A recent heartbeat does not guarantee the next transaction will succeed.';
}
export function founderTaskPresentation(task,{startedAt,now=Date.now(),workerReady=false}={}) {
  if(!task)return {tone:'idle',title:'Prepare your first task',body:'Add the facts, review the request and save its recovery file before approving.'};
  if(['attested','archived'].includes(task.status)&&task.evidence_hash)return {tone:'success',title:'Your draft is ready to review',body:'Open the result with its matching private recovery file. Publishing remains a separate owner decision.'};
  if(task.status==='cancelled')return {tone:'attention',title:'This task was cancelled',body:'Its original identity and any recorded outcomes remain available. Cancellation does not erase history.'};
  if(task.status==='blocked')return {tone:'attention',title:'This task needs attention',body:'The chain reports a blocked task. Inspect its original record and current worker availability before another decision.'};
  if(['queued','awaiting_evidence','pending_review'].includes(task.status)) {
    if(!workerReady)return {tone:'attention',title:'Waiting for worker availability',body:'Your approved task remains on NEAR. Check the current worker status; this page will not resubmit it.'};
    if(Number.isFinite(startedAt)&&now-startedAt>=120000)return {tone:'attention',title:'Your original task is still awaiting a result',body:'A delayed or unknown outcome needs inspection. Keep the original task and recovery file; do not approve a duplicate request.'};
    return {tone:'waiting',title:task.status==='queued'?'Your task is queued on NEAR':'Your task is awaiting its result',body:'This is the current on-chain status. The page checks for an encrypted result; no additional approval or duplicate request is needed.'};
  }
  return {tone:'attention',title:'Inspect the original task',body:'This task has a status that needs review. No new transaction was submitted.'};
}
export async function validateFounderSetupTransaction(transaction,{owner,companyId,config,storageByteCost}) {
  exact(transaction,['signerId','receiverId','actions'],'setup transaction');
  if(transaction.signerId!==owner||transaction.receiverId!==companyId||!Array.isArray(transaction.actions)||transaction.actions.length!==4)throw Error('Setup signer, company or action count changed.');
  const params=transaction.actions.map((action,i)=>{exact(action,['type','params'],'setup action');exact(action.params,['methodName','args','gas','deposit'],'setup call');if(action.type!=='FunctionCall'||action.params.methodName!==CONFIGURATION_METHODS[i]||action.params.gas!=='40000000000000')throw Error('Unexpected setup call.');return action.params;});
  const reserve=String(amount(storageByteCost)*65536n);
  if(params[0].deposit!==reserve||params[1].deposit!==reserve||params[2].deposit!=='0'||params[3].deposit!=='0')throw Error('Setup storage or deposit changed.');
  const mission=exact(params[0].args,['idea_hash','goal_hash','encrypted_idea','encrypted_goal','public_idea','public_goal'],'encrypted mission');
  if(mission.public_idea!==''||mission.public_goal!==''||!SHA.test(mission.idea_hash)||!SHA.test(mission.goal_hash))throw Error('Public mission plaintext is not allowed.');
  validateEnvelope(mission.encrypted_idea);validateEnvelope(mission.encrypted_goal);
  if(await digest(mission.encrypted_idea)!==mission.idea_hash||await digest(mission.encrypted_goal)!==mission.goal_hash)throw Error('Encrypted mission hashes changed.');
  const storage=exact(params[1].args,['blocks','id'],'task storage');
  if(storage.blocks!==1||typeof storage.id!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(storage.id))throw Error('Review exactly one additional task slot.');
  const profile=exact(params[2].args,['worker_public_key','worker_key_id','mission_sealed_key','profile','target_origin'],'worker profile');
  if(profile.worker_public_key!==config.worker_public_key||profile.worker_key_id!==config.worker_key_id||profile.profile!=='business-operations-v1'||profile.target_origin!==''||typeof profile.mission_sealed_key!=='string'||!/^[A-Za-z0-9+/]{683}=$/.test(profile.mission_sealed_key))throw Error('The reviewed worker encryption profile changed.');
  if(canonicalFactory(params[3].args)!==canonicalFactory(founderAIPolicy()))throw Error('The fixed pilot reservation policy changed.');
  return transaction;
}
export function founderRequest({config, owner, name, requestId, publicKey}) {
  assertFounderCreationAllowed(config);
  founderAccount(owner);
  const room=Math.min(31,63-config.factory_id.length),suffix=requestId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g,'');
  if(room<8||suffix.length<4)throw Error('This factory account needs a shorter reviewed name or a new creation request.');
  const label=founderSlug(name,config.factory_id).slice(0,room-suffix.length-1).replace(/-+$/,'')+'-'+suffix;
  return companyFactoryQuoteRequest({factory:config.factory_id,id:requestId,creator:owner,label,owner_key_hex:factoryPublicKeyHex(publicKey),config:founderCompanyConfig(config)});
}
export async function founderCreateAction(context, request, quote, acknowledged) {
  assertFounderCreationAllowed({factory_id:context?.factory});
  if (!acknowledged) throw Error('Confirm the displayed original wallet key and company ownership first.');
  return companyFactoryCreate(context,request,quote,{custody_ack:FACTORY_CUSTODY_ACK,original_key_hex:request.owner_key_hex});
}
export function founderBudget(quote, storageByteCost, owner) {
  const storage = amount(storageByteCost)*65536n;
  const creation = amount(quote.total), setup = storage*2n;
  // This is deliberately labelled headroom, not a verified fee quote. The
  // protocol's upfront gas purchase can exceed actual burned gas.
  const gasHeadroom = 600000000000000000000000n;
  const retainedOwnerStorage = amount(storageByteCost)*BigInt(owner.storage_usage);
  const spendable = amount(owner.amount)>retainedOwnerStorage ? amount(owner.amount)-retainedOwnerStorage : 0n;
  const recommended = creation+setup+gasHeadroom;
  return {creation:String(creation),setup:String(setup),storageBlock:String(storage),gasHeadroom:String(gasHeadroom),
    recommended:String(recommended),spendable:String(spendable),shortfall:String(recommended>spendable?recommended-spendable:0n)};
}
export async function prepareFounderSetup({companyId, owner, config, name, goal, storageByteCost, storageFundingId}) {
  assertFounderCreationAllowed(config);
  founderAccount(companyId); founderAccount(owner);
  if (typeof name !== 'string' || name.trim().length<2 || name.length>80 || typeof goal !== 'string' || goal.trim().length<10 || goal.length>400) throw Error('Add a short business name and a clear first goal.');
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(storageFundingId)) throw Error('Keep the original setup funding identity.');
  const recordKey = newRecordKey(), idea = await encrypt(name.trim(),recordKey), objective = await encrypt(goal.trim(),recordKey);
  const mission = {idea_hash:idea.hash,goal_hash:objective.hash,encrypted_idea:idea.envelope,encrypted_goal:objective.envelope,public_idea:'',public_goal:''};
  const profile = {worker_public_key:config.worker_public_key,worker_key_id:config.worker_key_id,
    mission_sealed_key:await sealKey(recordKey,config.worker_public_key,config.worker_key_id),profile:'business-operations-v1',target_origin:''};
  const storage = String(amount(storageByteCost)*65536n), policy = founderAIPolicy();
  const actions = [
    {type:'FunctionCall',params:{methodName:'company_set',args:mission,gas:'40000000000000',deposit:storage}},
    {type:'FunctionCall',params:{methodName:'company_fund_storage',args:{blocks:1,id:storageFundingId},gas:'40000000000000',deposit:storage}},
    {type:'FunctionCall',params:{methodName:'set_execution_profile',args:profile,gas:'40000000000000',deposit:'0'}},
    {type:'FunctionCall',params:{methodName:'ai_set_policy',args:policy,gas:'40000000000000',deposit:'0'}},
  ];
  return {transaction:{signerId:owner,receiverId:companyId,actions},
    recovery:{schema:'business-is-near-mission-recovery-v1',network:'testnet',company_id:companyId,owner,
      idea_hash:idea.hash,goal_hash:objective.hash,record_key:recordKey},storage,worker_key_id:config.worker_key_id};
}
export async function validateFounderPending(value, config, owner) {
  if (value?.kind === 'create') {
    exact(value,['kind','pending'],'saved company creation');
    await validateFactoryPending(value.pending,{network:'testnet',chainId:'testnet',factory:config.factory_id,creator:owner});
    if (value.pending.factory_code_hash !== config.factory_code_hash || value.pending.template_sha256 !== config.company_template_sha256) throw Error('Saved creation belongs to another factory release.');
    return value;
  }
  exact(value,['kind','request_id','account','contract','code_hash','transaction','started_height','started_block','tx_hash','fingerprint'],'saved setup');
  if (value.kind !== 'setup' || value.account !== owner || !/^[a-f0-9]{32}$/.test(value.request_id) || value.code_hash !== config.company_code_hash ||
      !Number.isSafeInteger(value.started_height) || value.started_height < 0 || !HASH.test(value.started_block) || value.tx_hash!==null&&!HASH.test(value.tx_hash)) throw Error('Saved setup identity changed.');
  founderAccount(value.contract);
  if (value.transaction.signerId !== owner || value.transaction.receiverId !== value.contract || !Array.isArray(value.transaction.actions) || value.transaction.actions.length !== 4) throw Error('Saved setup signer or receiver changed.');
  for (const [i,action] of value.transaction.actions.entries()) {
    if (action.type !== 'FunctionCall' || action.params.methodName !== CONFIGURATION_METHODS[i] || action.params.gas !== '40000000000000') throw Error('Saved setup action changed.');
  }
  const {fingerprint,tx_hash,...immutable}=value;
  if (fingerprint !== await digest(canonicalFactory(immutable))) throw Error('Saved setup fingerprint changed.');
  return value;
}
export async function setupPending(transaction, codeHash, block) {
  const value={kind:'setup',request_id:crypto.randomUUID().replaceAll('-',''),account:transaction.signerId,contract:transaction.receiverId,
    code_hash:codeHash,transaction:structuredClone(transaction),started_height:block.height,started_block:block.hash,tx_hash:null};
  const {tx_hash,...immutable}=value;value.fingerprint=await digest(canonicalFactory(immutable));return value;
}
export function validateSetupOutcome(out, saved, block) {
  const tx=out?.transaction;
  if (!block || block.hash!==out?.transaction_outcome?.block_hash || !Number.isSafeInteger(block.height) || block.height<=saved.started_height || !Array.isArray(tx?.actions) || tx.actions.length!==4) throw Error('Setup receipt is incomplete or precedes its review.');
  for (const [i,raw] of tx.actions.entries()) {
    const actual=raw?.FunctionCall,expected=saved.transaction.actions[i]?.params;
    if (!actual || Object.keys(raw).join(',')!=='FunctionCall' || Object.keys(actual).sort().join(',')!=='args,deposit,gas,method_name' || actual.method_name!==expected.methodName || String(actual.gas)!==expected.gas || actual.deposit!==expected.deposit || typeof actual.args!=='string' || actual.args.length>32000) throw Error('Setup wallet actions differ from the approved batch.');
    let args;try{args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(actual.args),c=>c.charCodeAt(0))));}catch{throw Error('Setup receipt arguments are incomplete.');}
    if (canonicalFactory(args)!==canonicalFactory(expected.args)) throw Error('Setup receipt arguments changed.');
  }
  return validateFinalOutcome(out,{hash:saved.tx_hash,method:'founder_setup'},saved.account,saved.contract);
}
export function founderWorkspaceURL(config, recordId, base) {
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(recordId)) throw Error('A verified creation request is required.');
  const url=new URL('./business.html',base);url.searchParams.set('founder',recordId);return url;
}
export {FACTORY_CUSTODY_ACK, FACTORY_GAS, canonicalFactory, factoryFingerprint, factoryWalletTransaction, factoryPublicKeyHex, validateFactoryWalletOutcome, verifyProvisionedCompany, companyFactoryRecovery};
