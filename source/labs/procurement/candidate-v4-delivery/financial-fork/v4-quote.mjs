// Pure quote preparation from caller-supplied trusted FINAL observations.
// No RPC, signing, provider key, deployment or dynamic on-chain price getter.
import {createHash,createPublicKey} from 'node:crypto';
import {mandateId,policyHash} from './v4-id.mjs';

export const PROFILE='near-shared-procurement-v4';
export const SUPPORTED_STORAGE_BYTE_COST='10000000000000000000';
export const MANDATE_STORAGE_BYTES=73728n;
export const ASSIGNMENT_SLOT_BYTES=12288n,DELIVERY_SLOT_BYTES=20480n;
export const EXTRA_RECORD_BYTES=1280n;
export const ROOT_RESERVE_BYTES=4096n;
export const ROOT_CUSHION_BYTES=65536n;
export const MAX_OBSERVATION_AGE_SECONDS=60;
const MAX_GAS=300000000000000n;
const MAX_U128=2n**128n;
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const check=(value,message)=>{if(!value)throw Error(message);};
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function exact(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(','),'Exact fields required');}
export function amount(value,{positive=false}={}){
 check(typeof value==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(value),'Canonical amount required');
 const n=BigInt(value);check(n<MAX_U128&&(!positive||n>0n),'Bounded positive/u128 amount required');return n;
}
export function account(value){check(typeof value==='string'&&value.length>=2&&value.length<=64&&/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value),'NEAR account required');return value;}
export function commitment(value){check(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'SHA256 required');return value;}
export function block(value){check(typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value),'Block/code identity required');return value;}
export function identifier(value){check(typeof value==='string'&&/^[a-z][a-z0-9_-]{0,23}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value),'Bounded identifier required');return value;}
function integer(value,min,max,message){check(Number.isSafeInteger(value)&&value>=min&&value<=max,message);return value;}
function protocolNumber(value){if(typeof value==='number'){check(Number.isSafeInteger(value)&&value>=0,'Exact protocol integer required');value=String(value);}return amount(value);}
export function codeHash(wasm){
 check(wasm instanceof Uint8Array&&wasm.length>=8&&Buffer.from(wasm.subarray(0,8)).equals(Buffer.from([0,97,115,109,1,0,0,0])),'Reviewed WASM bytes required');
 const bytes=createHash('sha256').update(wasm).digest();let n=BigInt('0x'+bytes.toString('hex')),out='';while(n>0n){out=B58[Number(n%58n)]+out;n/=58n;}for(const x of bytes){if(x!==0)break;out='1'+out;}return out;
}
export function assertObservation(observation,pins,now,{requireSupportedStorage=true}={}){
 check(pins&&typeof pins==='object'&&!Array.isArray(pins),'Trusted pins required');
 const base=['chain_id','genesis_hash','registry_id','registry_code_hash','storage_byte_cost'];
 const present=Object.keys(pins).sort(),expected=[...base,...(('mandate_id'in pins||'policy_sha256'in pins)?['mandate_id','policy_sha256']:[])].sort();check(present.join(',')===expected.join(','),'Exact network/registry pins required');
 check(typeof pins.chain_id==='string'&&pins.chain_id.length>0&&pins.chain_id.length<=80,'Chain ID pin required');block(pins.genesis_hash);account(pins.registry_id);block(pins.registry_code_hash);
 check(pins.storage_byte_cost===SUPPORTED_STORAGE_BYTE_COST,'Unsupported trusted storage-price pin');
 if('mandate_id'in pins){commitment(pins.mandate_id);commitment(pins.policy_sha256);}
 check(observation?.finality==='FINAL'&&observation.chain_id===pins.chain_id&&observation.genesis_hash===pins.genesis_hash,'Final chain/genesis observation required');block(observation.block_hash);integer(observation.height,1,Number.MAX_SAFE_INTEGER,'Final height required');
 integer(now,1,18446744073,'Trusted current seconds required');const observed=amount(observation.observed_at,{positive:true});check(observed<=18446744073n,'Bounded timestamp required');check(BigInt(now)-observed<=BigInt(MAX_OBSERVATION_AGE_SECONDS)&&observed<=BigInt(now)+5n,'Stale or future observation');
 const p=observation.protocol;check(p&&p.chain_id===pins.chain_id&&p.genesis_hash===pins.genesis_hash&&p.block_hash===observation.block_hash&&p.height===observation.height&&p.observed_at===observation.observed_at,'Same FINAL protocol observation required');
 const price=amount(p.storage_amount_per_byte,{positive:true}),gasPrice=amount(p.gas_price,{positive:true});
 if(p.runtime_config)check(p.runtime_config.storage_amount_per_byte===p.storage_amount_per_byte,'Contradictory protocol storage prices');
 if(requireSupportedStorage)check(price.toString()===SUPPORTED_STORAGE_BYTE_COST,'Unsupported protocol storage price: funded actions halted');
 return {storagePrice:price,gasPrice,supportedStorage:price.toString()===SUPPORTED_STORAGE_BYTE_COST};
}
export const assertFreshProtocol=(observation,pins,now)=>assertObservation(observation,pins,now);
export function assertRegistry(observation,pins,now,{requireSupportedStorage=true}={}){
 const prices=assertObservation(observation,pins,now,{requireSupportedStorage}),r=observation.registry,s=r?.state;
 check(r&&r.contract_id===pins.registry_id&&r.code_hash===pins.registry_code_hash&&r.block_hash===observation.block_hash&&r.height===observation.height,'Pinned same-FINAL registry required');
 check(s?.profile===PROFILE&&s.contract_id===pins.registry_id&&s.observed_at===observation.observed_at,'Registry identity/time changed');
 check(s.assumed_storage_byte_cost===SUPPORTED_STORAGE_BYTE_COST&&s.fresh_external_protocol_price_guard_required===true&&s.contract_can_detect_protocol_price_change===false,'Explicit fixed-price regime required');
 check(s.base_mandate_allocation_bytes===MANDATE_STORAGE_BYTES.toString()&&s.assignment_slot_bytes===ASSIGNMENT_SLOT_BYTES.toString()&&s.delivery_slot_bytes===DELIVERY_SLOT_BYTES.toString()&&s.provider_delivery_deposit==='0'&&s.assignment_mode==='owner_public_text_v1'&&s.extra_record_bytes===EXTRA_RECORD_BYTES.toString()&&s.root_initial_reserve_bytes===ROOT_RESERVE_BYTES.toString()&&s.root_cushion_bytes===ROOT_CUSHION_BYTES.toString(),'Reviewed registry storage allocation changed');
 check(s.operator_service_fee==='0'&&s.admin_can_withdraw===false&&s.pending_excluded_from_held===true,'Registry fee/authority/backing model changed');
 return {...prices,registry:s};
}
export function assertExistingBacking(state){
 const held=['available','escrow','owner_credit','provider_credit'].reduce((n,k)=>n+amount(state[k]),0n);
 check(state.held===held.toString(),'Contradictory held liabilities');
 const all=['available','escrow','owner_credit','provider_credit','transfer_pending','owner_paid','provider_paid'].reduce((n,k)=>n+amount(state[k]),0n);check(amount(state.funded)===all,'Registry money conservation mismatch');
 check(state.backed===true&&amount(state.account_balance)>=amount(state.required_retained)+held,'Existing registry backing deficit; new deposit must not bail it out');
 return held;
}
// Explicit gas authorization, including observed action/receipt fees and the
// observed pessimistic price inflation ratio. It is not an actual fee invoice.
export function gasAuthorization({observation,pins,now,actions}){
 const {gasPrice}=assertFreshProtocol(observation,pins,now);check(Array.isArray(actions)&&actions.length>=1&&actions.length<=4,'Bounded action list required');
 const costs=observation.protocol.runtime_config?.transaction_costs,a=costs?.action_creation_config;
 check(a&&costs.action_receipt_creation_config&&Array.isArray(costs.pessimistic_gas_price_inflation_ratio),'Full observed protocol fee schedule required');
 const fee=v=>{check(v&&typeof v==='object','Protocol fee missing');return protocolNumber(v.send_not_sir)+protocolNumber(v.execution);};
 let fixed=fee(costs.action_receipt_creation_config),attached=0n;
 const rows=actions.map(action=>{
  let units=0n,execution=0n;
  if(action.type==='CreateAccount'){exact(action,['type']);units=fee(a.create_account_cost);}
  else if(action.type==='Transfer'){exact(action,['type']);units=fee(a.transfer_cost);}
  else if(action.type==='DeployContract'){exact(action,['type','bytes']);integer(action.bytes,8,4194304,'Bounded WASM size required');units=fee(a.deploy_contract_cost)+fee(a.deploy_contract_cost_per_byte)*BigInt(action.bytes);}
  else if(action.type==='FunctionCall'){
   exact(action,['type','method','args','gas']);identifier(action.method);check(action.args&&typeof action.args==='object'&&!Array.isArray(action.args),'Exact function arguments required');execution=amount(action.gas,{positive:true});check(execution<=MAX_GAS,'Gas authorization exceeds300Tgas');
   const bytes=Buffer.byteLength(action.method)+Buffer.byteLength(JSON.stringify(action.args));units=fee(a.function_call_cost)+fee(a.function_call_cost_per_byte)*BigInt(bytes);attached+=execution;
  }else throw Error('Unsupported action kind');
  fixed+=units;return {type:action.type,observed_fixed_gas:units.toString(),attached_execution_gas:execution.toString()};
 });
 const ratio=costs.pessimistic_gas_price_inflation_ratio;check(ratio.length===2,'Observed inflation ratio required');const num=protocolNumber(ratio[0]),den=protocolNumber(ratio[1]);check(den>0n&&num>=den&&num<=den*2n,'Bounded observed inflation ratio required');
 const observedLimit=protocolNumber(observation.protocol.runtime_config?.wasm_config?.limit_config?.max_total_prepaid_gas??MAX_GAS.toString());check(observedLimit>0n&&observedLimit<=MAX_GAS&&fixed+attached<=observedLimit,'Observed transaction gas authorization limit exceeded');
 const fixedCost=fixed*gasPrice,executionCap=(attached*gasPrice*num+den-1n)/den,total=fixedCost+executionCap;check(total<MAX_U128,'Gas authorization overflow');
 return {fixed_action_receipt_gas:fixed.toString(),attached_execution_gas:attached.toString(),gas_price:gasPrice.toString(),inflation_ratio:[num.toString(),den.toString()],fixed_action_receipt_cost:fixedCost.toString(),execution_authorization:executionCap.toString(),total_authorization:total.toString(),rows,scope:'Observed send_not_sir+execution fees and attached execution gas authorization; future protocol/price changes require a fresh quote. Actual fees use original complete FINAL graphs.'};
}
function wallet(balance,total){const b=amount(balance);return {spendable_balance:b.toString(),requirement:total.toString(),shortfall:(b<total?total-b:0n).toString()};}
function provenance(observation){return {chain_id:observation.chain_id,genesis_hash:observation.genesis_hash,block_hash:observation.block_hash,height:observation.height,observed_at:observation.observed_at,environment:observation.environment??'CALLER_SUPPLIED_FINAL_OBSERVATION',mainnet_price_claim:false,observation_is_state_proof:false};}
export function projectDeploymentQuote({observation,pins,now,wasm,admin,gas,spendable_balance}){
 const {storagePrice}=assertFreshProtocol(observation,pins,now);account(admin);check(codeHash(wasm)===pins.registry_code_hash,'WASM hash differs from reviewed code pin');
 const suffix='.'+admin,child=pins.registry_id.endsWith(suffix)?pins.registry_id.slice(0,-suffix.length):'';check(child.length>=1&&!child.includes('.')&&!/^[a-f0-9]{64}$/.test(admin),'Supported keyless registry requires a named project parent and its direct child account');
 const config=observation.protocol.runtime_config?.transaction_costs?.storage_usage_config;check(config,'Observed account storage schedule required');const accountBytes=protocolNumber(config.num_bytes_account);check(accountBytes>0n,'Observed account base bytes required');
 const codeBytes=BigInt(wasm.length),all=codeBytes+accountBytes+ROOT_RESERVE_BYTES+ROOT_CUSHION_BYTES,backing=all*storagePrice;
 const gasQuote=gasAuthorization({observation,pins,now,actions:[{type:'CreateAccount'},{type:'Transfer'},{type:'DeployContract',bytes:wasm.length},{type:'FunctionCall',method:'init_registry',args:{admin},gas}]});
 return {profile:PROFILE,kind:'ONE_TIME_PROJECT_DEPLOYMENT',registry_id:pins.registry_id,admin,project_subsidy_funder:admin,named_parent_signing_authority_verified:false,wasm_sha256:sha(wasm),code_hash:pins.registry_code_hash,code_bytes:codeBytes.toString(),account_base_bytes:accountBytes.toString(),root_reserve_bytes:ROOT_RESERVE_BYTES.toString(),root_cushion_bytes:ROOT_CUSHION_BYTES.toString(),code_storage_collateral:(codeBytes*storagePrice).toString(),account_base_collateral:(accountBytes*storagePrice).toString(),root_reserve_collateral:(ROOT_RESERVE_BYTES*storagePrice).toString(),root_cushion_collateral:(ROOT_CUSHION_BYTES*storagePrice).toString(),required_project_backing:backing.toString(),gas:gasQuote,wallet:wallet(spendable_balance,backing+BigInt(gasQuote.total_authorization)),keyless_atomic_create_deploy_init_required:true,access_key_list_must_be_verified_empty:true,operator_fee:'0',collateral_is_not_gas_or_compute_invoice:true,per_mandate_code_charge:'0',provenance:provenance(observation),notice:'A prepared quote, not deployment, custody verification or funding approval. Named project parent funds/signs the one atomic batch; its signing capability is a separate gate. Project pays backing once; actual deployed storage/root bounds must be checked.'};
}
export function assertOwnerTransportPolicy(policy,owner,pins,observation){
 exact(policy,['company_id','goal_id','plan_sha256','operator','providers','steps','max_cycles','per_job','daily','lifetime','max_open','expires_at','bid_seconds','delivery_seconds','review_seconds','acceptance','operator_service_fee','network','recipient_policy','assignment_mode']);account(owner);account(policy.company_id);account(policy.operator);identifier(policy.goal_id);commitment(policy.plan_sha256);check(owner!==pins.registry_id&&![owner,pins.registry_id].includes(policy.operator),'Distinct original owner/operator required');check(Array.isArray(policy.providers)&&policy.providers.length>=1&&policy.providers.length<=4&&new Set(policy.providers).size===policy.providers.length,'Bounded unique providers required');for(const provider of policy.providers){account(provider);check(![owner,policy.operator,pins.registry_id].includes(provider),'Distinct original provider required');}check(Array.isArray(policy.steps)&&policy.steps.length>=1&&policy.steps.length<=4&&new Set(policy.steps.map(s=>s.id)).size===policy.steps.length,'Bounded unique approved steps required');for(const step of policy.steps){exact(step,['id','kind','scope_sha256','criteria_sha256']);identifier(step.id);identifier(step.kind);commitment(step.scope_sha256);commitment(step.criteria_sha256);}integer(policy.max_cycles,1,8,'Bounded prepaid cycles required');integer(policy.max_open,1,8,'Bounded open jobs required');for(const k of ['bid_seconds','delivery_seconds','review_seconds'])integer(policy[k],60,86400,'Bounded original windows required');const per=amount(policy.per_job,{positive:true}),daily=amount(policy.daily,{positive:true}),lifetime=amount(policy.lifetime,{positive:true}),expiry=amount(policy.expires_at,{positive:true}),time=amount(observation.observed_at,{positive:true});check(per<=10n**24n&&daily>=per&&lifetime>=daily&&lifetime<=8n*10n**24n&&policy.operator_service_fee==='0','Original business budget caps required');check(expiry>time+BigInt(policy.bid_seconds+policy.delivery_seconds+policy.review_seconds)&&expiry<=time+604800n,'Original bounded expiry required');exact(policy.network,['chain_id','genesis_hash','registry_code_hash']);
 check(policy?.network&&policy.network.chain_id===observation.chain_id&&policy.network.genesis_hash===pins.genesis_hash&&policy.network.registry_code_hash===pins.registry_code_hash,'Owner transport network/genesis/code pins must match actual collected network');
 check(policy.assignment_mode==='owner_public_text_v1'&&policy.acceptance==='owner_award_assignment_delivery_shared_v4','Reviewed owner assignment/acceptance profile required');const p=policy.recipient_policy;exact(p,['profile','owner','worker']);check(p.profile==='near-procurement-delivery-recipients-v4','Original addressed recipient policy required');
 for(const role of ['owner','worker']){const d=p[role];exact(d,['account_id','key_id','key_version','public_key_pem']);check(d.account_id===(role==='owner'?owner:policy.operator),'Original owner/worker recipient must match financial role');commitment(d.key_id);check(typeof d.key_version==='string'&&/^[1-9][0-9]{0,9}$/.test(d.key_version)&&BigInt(d.key_version)<=4294967295n,'Canonical original u32 key version required');check(typeof d.public_key_pem==='string'&&d.public_key_pem.length>=700&&d.public_key_pem.length<=2048&&/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/.test(d.public_key_pem)&&sha(d.public_key_pem)===d.key_id,'Original public PEM/fingerprint required');let k;try{k=createPublicKey({key:Buffer.from(d.public_key_pem.replace(/-----[^-]+-----|\s/g,''),'base64'),format:'der',type:'spki'});}catch{throw Error('Approved public RSA4096 recipient key required');}check(k.asymmetricKeyType==='rsa'&&k.asymmetricKeyDetails?.modulusLength===4096&&k.asymmetricKeyDetails?.publicExponent===65537n,'Approved public RSA4096/exponent65537 recipient key required');}
 check(p.owner.key_id!==p.worker.key_id&&p.owner.account_id!==p.worker.account_id,'Distinct original recipient keys/accounts required');return true;
}
export function ownerMandateQuote({observation,pins,now,owner,client_id,policy,expected_mandate_id,expected_policy_sha256,gas,spendable_balance}){
 const {storagePrice,registry}=assertRegistry(observation,pins,now);assertExistingBacking(registry);account(owner);identifier(client_id);commitment(expected_mandate_id);commitment(expected_policy_sha256);assertOwnerTransportPolicy(policy,owner,pins,observation);const computedMid=mandateId(owner,client_id),computedPolicy=policyHash(pins.registry_id,computedMid,owner,policy);check(expected_mandate_id===computedMid&&expected_policy_sha256===computedPolicy,'Actual owner/client/policy differs from derived original commitment');const q=observation.create_quote;
 check(q&&q.block_hash===observation.block_hash&&q.height===observation.height&&q.profile===PROFILE&&q.contract_id===pins.registry_id&&q.owner===owner&&q.mandate_id===expected_mandate_id&&q.policy_sha256===expected_policy_sha256,'Exact same-FINAL create quote required');
 check(q.ready===true&&!registry.frozen&&registry.mandate_count<registry.max_mandates,'New mandate unavailable');const budget=amount(policy.lifetime,{positive:true});check(Array.isArray(policy.steps)&&policy.steps.length>=1&&policy.steps.length<=4&&Number.isSafeInteger(policy.max_cycles)&&policy.max_cycles>=1&&policy.max_cycles<=8,'Bounded prepaid slots required');const slots=Math.min(8,policy.steps.length*policy.max_cycles),assignmentBytes=BigInt(slots)*ASSIGNMENT_SLOT_BYTES,deliveryBytes=BigInt(slots)*DELIVERY_SLOT_BYTES,recordBytes=MANDATE_STORAGE_BYTES+assignmentBytes+deliveryBytes,storage=recordBytes*storagePrice;
 check(policy.operator_service_fee==='0'&&q.operator_service_fee==='0'&&q.project_code_charged_again===false&&q.storage_refundable===false&&q.assumed_storage_byte_cost===SUPPORTED_STORAGE_BYTE_COST&&q.fresh_external_protocol_price_guard_required===true,'Quote fee/storage regime changed');
 check(q.slot_count===slots&&q.base_storage_bytes===MANDATE_STORAGE_BYTES.toString()&&q.assignment_storage_bytes===assignmentBytes.toString()&&q.delivery_storage_bytes===deliveryBytes.toString()&&q.base_storage===(MANDATE_STORAGE_BYTES*storagePrice).toString()&&q.assignment_storage===(assignmentBytes*storagePrice).toString()&&q.delivery_storage===(deliveryBytes*storagePrice).toString()&&q.provider_delivery_deposit==='0'&&q.storage_bytes===recordBytes.toString()&&q.storage===storage.toString()&&q.business_budget===budget.toString()&&q.total===(storage+budget).toString(),'Exact owner budget/storage quote changed');
 const args={client_id,policy,approved_storage:q.storage,approved_budget:q.business_budget,public_metadata_ack:true},gasQuote=gasAuthorization({observation,pins,now,actions:[{type:'FunctionCall',method:'create_mandate',args,gas}]});
 return {profile:PROFILE,kind:'OWNER_CREATE_MANDATE',owner,mandate_id:q.mandate_id,policy_sha256:q.policy_sha256,slot_count:slots,base_storage_bytes:MANDATE_STORAGE_BYTES.toString(),assignment_storage_bytes:assignmentBytes.toString(),delivery_storage_bytes:deliveryBytes.toString(),base_storage_collateral:(MANDATE_STORAGE_BYTES*storagePrice).toString(),assignment_storage_collateral:(assignmentBytes*storagePrice).toString(),delivery_storage_collateral:(deliveryBytes*storagePrice).toString(),provider_delivery_deposit:'0',record_storage_bytes:recordBytes.toString(),record_storage_collateral:storage.toString(),storage_refundable:false,business_budget:budget.toString(),business_budget_is_not_fee:true,operator_service_fee:'0',per_mandate_wasm_charge:'0',attached_deposit:(storage+budget).toString(),gas:gasQuote,wallet:wallet(spendable_balance,storage+budget+BigInt(gasQuote.total_authorization)),project_deployment:'PREPAID_SHARED_PROJECT_BACKING_CHECKED_SEPARATELY',provenance:provenance(observation),notice:'Exact original wallet creates a record; no owner child account or new owner key. This is not a signature or live funding approval.'};
}
export function operatorAllowanceQuote({observation,pins,now,account_id,receiver_id,methods,allowance,spendable_balance}){
 assertRegistry(observation,pins,now);account(account_id);check(receiver_id===pins.registry_id&&Array.isArray(methods)&&methods.length===1&&methods[0]==='post_job','Only registry post_job scoped allowance supported');const n=amount(allowance,{positive:true});
 return {account_id,receiver_id,methods:['post_job'],finite_allowance:n.toString(),allowance_is_authorization_not_charge:true,operator_service_fee:'0',business_budget_debit:'0',wallet:wallet(spendable_balance,n),key_grant_or_existence_verified:false,provenance:provenance(observation)};
}
export function withdrawalCostQuote({observation,pins,now,mandate,job=null,kind,transfer_id,gas,spendable_balance}){
 const {storagePrice,registry}=assertRegistry(observation,pins,now);assertExistingBacking(registry);check(kind==='owner'||kind==='provider','Original credit kind required');identifier(transfer_id);check(mandate?.id===pins.mandate_id&&mandate.policy_sha256===pins.policy_sha256,'Pinned original mandate required');
 check(mandate.pending_transfer==='','Unknown original transfer must be inspected; no new intent');
 const intent=observation.original_intent;check(intent&&intent.mandate_id===mandate.id&&['none','known_failed_final'].includes(intent.status),'Trusted original signed-intent journal required; unresolved originals must be inspected');if(intent.status==='known_failed_final'){block(intent.hash);check(observation.transfer&&observation.transfer.id===intent.transfer_id&&observation.transfer.mandate_id===mandate.id&&observation.transfer.status==='failed','Known original failure must match the exact scoped transfer');}
 const existing=observation.transfer;
 if(existing){check(existing.mandate_id===mandate.id&&existing.kind===kind&&existing.status==='failed','Only a known failed original scoped transfer permits preparing a different intent');check(existing.id!==transfer_id,'Existing transfer ID must be inspected, not re-prepared');}
 const provider=kind==='provider';if(provider)check(job&&job.mandate_id===mandate.id&&job.provider&&job.credit,'Original job credit required');const credit=amount(provider?job.credit:mandate.owner_credit,{positive:true}),recipient=provider?job.provider:mandate.owner;account(recipient);
 const slots=provider?job.intents:mandate.owner_intents;integer(slots,0,provider?2:8,'Prepaid slot counter changed');const bytes=slots<(provider?2:8)?0n:EXTRA_RECORD_BYTES,storage=bytes*storagePrice,q=observation.withdrawal_quote;
 if(existing)check(existing.recipient===recipient&&existing.amount===credit.toString()&&existing.job_id===(provider?job.id:null),'Original failed transfer recipient/credit changed');
 check(q&&q.block_hash===observation.block_hash&&q.height===observation.height&&q.profile===PROFILE&&q.mandate_id===mandate.id&&q.kind===kind&&q.job_id===(provider?job.id:null)&&q.recipient===recipient&&q.credit===credit.toString()&&q.storage_bytes===bytes.toString()&&q.storage===storage.toString()&&q.ready===true&&q.assumed_storage_byte_cost===SUPPORTED_STORAGE_BYTE_COST&&q.fresh_external_protocol_price_guard_required===true&&q.storage_refundable===false,'Exact same-FINAL original credit/storage quote required');
 const args={mandate_id:mandate.id,...(provider?{job_id:job.id}:{}),transfer_id,approved_amount:credit.toString(),approved_storage:storage.toString()},method=provider?'withdraw_provider':'withdraw_owner',gasQuote=gasAuthorization({observation,pins,now,actions:[{type:'FunctionCall',method,args,gas}]});
 return {profile:PROFILE,kind:'ORIGINAL_RECIPIENT_WITHDRAWAL',mandate_id:mandate.id,recipient,credit:credit.toString(),attached_deposit:storage.toString(),new_record_storage_bytes:bytes.toString(),new_record_storage_collateral:storage.toString(),storage_refundable:false,gas:gasQuote,wallet:wallet(spendable_balance,storage+BigInt(gasQuote.total_authorization)),original_credit_not_recharged:true,old_intents_immutable:true,provenance:provenance(observation),method,args};
}
