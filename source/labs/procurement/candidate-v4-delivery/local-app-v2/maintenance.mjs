// Read-only status is available when financial admission is paused. Identity,
// same-FINAL provenance and canonical conservation remain mandatory.
import {assertRegistry,amount} from '../financial-fork/v4-quote.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const unavailable=new WeakSet();
export function isMaintenanceUnavailable(error){return unavailable.has(error);}
export function inspectRegistryForRead(observation,pins,now){
 const prices=assertRegistry(observation,pins,now,{requireSupportedStorage:false}),s=prices.registry;
 const held=['available','escrow','owner_credit','provider_credit'].reduce((n,k)=>n+amount(s[k]),0n);
 check(s.held===held.toString(),'Contradictory held liabilities');
 const all=['available','escrow','owner_credit','provider_credit','transfer_pending','owner_paid','provider_paid'].reduce((n,k)=>n+amount(s[k]),0n);
 check(amount(s.funded)===all,'Registry money conservation mismatch');
 const backed=amount(s.account_balance)>=amount(s.required_retained)+held;
 check(typeof s.backed==='boolean'&&s.backed===backed,'Contradictory registry backing observation');
 const reasons=[];if(!prices.supportedStorage)reasons.push('unsupported_storage_price');if(!backed)reasons.push('registry_backing_deficit');
 return {schema:'bin-local-maintenance-v2',mutations_available:reasons.length===0,reasons,storage_price_supported:prices.supportedStorage,backed,original_records_readable:true};
}
export function requireFinancialAdmission(status){
 check(status?.schema==='bin-local-maintenance-v2'&&typeof status.mutations_available==='boolean'&&Array.isArray(status.reasons),'Exact current maintenance status required');
 if(status.mutations_available!==true||status.reasons.length){const error=Error('Financial actions are paused; original records remain readable');unavailable.add(error);throw error;}
}
