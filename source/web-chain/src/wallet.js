import { internalActionToNaj } from './wallet-sdk.js';
import { validateFinalOutcome } from '../../executor/outcome.mjs';
// Wallet Selector 10.1.4 accepts @near-js/transactions Action objects. The
// library's converter turns its documented internal FunctionCall into that form.
export function freezeAction(frozen){
 if(typeof frozen!=='boolean')throw Error('Invalid freeze state.');
 return internalActionToNaj({type:'FunctionCall',params:{methodName:'set_freeze',args:{frozen},gas:'30000000000000',deposit:'0'}});
}
export async function requestFreeze({wallet,accountId,owner,contract,expectedCodeHash,actualCodeHash,frozen}){
 if(!wallet||!accountId||accountId!==owner)throw Error('Connect the contract owner account.');
 if(!expectedCodeHash||expectedCodeHash!==actualCodeHash)throw Error('Enter an independently verified matching contract code hash.');
 return wallet.signAndSendTransaction({signerId:accountId,receiverId:contract,actions:[freezeAction(frozen)]});
}
const JOB_ID=/^[A-Za-z0-9_-]{1,64}$/;
const TX_HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function refundableJob(jobId,job,accountId){
 if(typeof jobId!=='string'||!JOB_ID.test(jobId)||!job||typeof job!=='object'||Array.isArray(job)||typeof accountId!=='string'||!accountId||job.customer!==accountId)throw Error('Connect the original customer wallet for this job.');
 if(typeof job.deposit!=='string'||!/^[1-9][0-9]{0,38}$/.test(job.deposit)||BigInt(job.deposit)>=2n**128n||typeof job.storage_contribution!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(job.storage_contribution)||BigInt(job.storage_contribution)>=2n**128n)throw Error('Invalid finalized job amounts.');
 if(job.status!=='escrowed')throw Error('Only unaccepted service escrow can be refunded.');
}
export function refundAction(jobId){
 if(typeof jobId!=='string'||!JOB_ID.test(jobId))throw Error('Invalid refund job ID.');
 return internalActionToNaj({type:'FunctionCall',params:{methodName:'refund',args:{id:jobId},gas:'100000000000000',deposit:'0'}});
}
export async function requestRefund({wallet,accountId,contract,jobId,job,expectedCodeHash,actualCodeHash,beforeSubmit}){
 if(!wallet||typeof wallet.signAndSendTransaction!=='function'||typeof contract!=='string'||!contract)throw Error('Inspect the company and connect its customer wallet.');
 refundableJob(jobId,job,accountId);
 if(!expectedCodeHash||expectedCodeHash!==actualCodeHash)throw Error('Enter an independently verified matching contract code hash.');
 // Deliberately independent of owner/freeze. Contract refunds only the original
 // customer's escrow; no amount or recipient can enter the action arguments.
 const actions=[refundAction(jobId)];if(beforeSubmit!==undefined&&typeof beforeSubmit!=='function')throw Error('Invalid refund persistence hook.');
 if(beforeSubmit)beforeSubmit();
 return wallet.signAndSendTransaction({signerId:accountId,receiverId:contract,actions});
}
export function refundResolution({contract,accountId,jobId,job,hash=null,outcome=null,startedBlockHeight=null,transactionBlock=null}){
 if(typeof jobId!=='string'||!JOB_ID.test(jobId)||!job||job.customer!==accountId)throw Error('Finalized refund customer/job mismatch.');
 refundableJob(jobId,{...job,status:'escrowed'},accountId);
 let result=null;
 if(hash!==null||outcome!==null){
  if(typeof hash!=='string'||!TX_HASH.test(hash)||!outcome)throw Error('A matching FINAL wallet transaction is required.');
  result=validateFinalOutcome(outcome,{hash,method:'refund',id:jobId},accountId,contract);
  if(!Number.isSafeInteger(startedBlockHeight)||startedBlockHeight<0||!transactionBlock||!Number.isSafeInteger(transactionBlock.height)||transactionBlock.height<=startedBlockHeight||transactionBlock.hash!==outcome.transaction_outcome.block_hash)throw Error('Transaction predates or does not match this refund intent.');
  const actions=outcome.transaction.actions;
  if(!Array.isArray(actions)||actions.length!==1||!actions[0]?.FunctionCall||Object.keys(actions[0]).length!==1)throw Error('Wallet transaction is not the exact refund action.');
  const call=actions[0].FunctionCall;
  if(call.method_name!=='refund'||call.deposit!=='0'||typeof call.args!=='string'||call.args.length>512||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(call.args))throw Error('Wallet transaction is not the exact refund action.');
  if(btoa(atob(call.args))!==call.args)throw Error('Invalid refund transaction argument encoding.');
  let args;try{args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(call.args),c=>c.charCodeAt(0))));}catch{throw Error('Invalid refund transaction arguments.');}
  if(!args||Object.keys(args).join(',')!=='id'||args.id!==jobId)throw Error('Refund transaction targets a different job.');
 }
 if(job.status==='refunded')return 'refunded';
 if(result?.status==='failed'){
  if(job.status==='escrowed'){refundableJob(jobId,job,accountId);return 'failed_retry_allowed';}
  if(['accepted','settled','paying','paid'].includes(job.status))return 'failed_not_refundable';
 }
 // A successful submission is not evidence that the transfer callback finished.
 // Unknown/mismatched/pending state never authorizes another wallet signature.
 return 'unresolved';
}
export function functionCall(method,args,deposit='0',gas='40000000000000'){
 if(!/^(set_policy|company_set|company_fund_storage|fund|fund_backing|set_execution_profile|company_order|ai_set_policy)$/.test(method))throw Error('Unsupported wallet action.');
 if(typeof deposit!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(deposit)||BigInt(deposit)>=2n**128n)throw Error('Invalid yoctoNEAR deposit.');
 return internalActionToNaj({type:'FunctionCall',params:{methodName:method,args,gas,deposit}});
}
export function launchActions({policy,mission,profile,storage,extraBlocks,funding,backing='0',fundingId}){
 if(!Number.isSafeInteger(extraBlocks)||extraBlocks<0||extraBlocks>9)throw Error('Invalid storage capacity.');
 const actions=[];
 if(BigInt(backing)>0n)actions.push(functionCall('fund_backing',{id:'backing-'+fundingId},backing));
 if(BigInt(funding)>0n)actions.push(functionCall('fund',{id:fundingId},funding));
 actions.push(functionCall('set_policy',policy));
 actions.push(functionCall('company_set',mission,storage));
 if(extraBlocks)actions.push(functionCall('company_fund_storage',{id:'storage-'+fundingId,blocks:extraBlocks},String(BigInt(storage)*BigInt(extraBlocks))));
 actions.push(functionCall('set_execution_profile',profile));return actions;
}
export function orderAction(args,price){
 const names=['id','task_id','scope_hash','encrypted_scope','worker_sealed_key','worker_key_id','execution_profile_version','approved_service_price','approved_job_storage','approved_task_storage','approved_backing'];
 if(!args||typeof args!=='object'||Object.keys(args).sort().join(',')!==names.sort().join(',')||names.filter(k=>k!=='execution_profile_version').some(k=>typeof args[k]!=='string')||
    !/^[A-Za-z0-9_-]{1,64}$/.test(args.id)||!/^[A-Za-z0-9_-]{1,64}$/.test(args.task_id)||
    !/^[0-9a-f]{64}$/.test(args.scope_hash)||!/^[0-9a-f]{64}$/.test(args.worker_key_id)||
    typeof args.encrypted_scope!=='string'||args.encrypted_scope.length>8192||
    typeof args.worker_sealed_key!=='string'||!/^[A-Za-z0-9+/]{683}=$/.test(args.worker_sealed_key)||
    !Number.isSafeInteger(args.execution_profile_version)||args.execution_profile_version<1||args.execution_profile_version>64)throw Error('Invalid encrypted order intent.');
 const components=['approved_service_price','approved_job_storage','approved_task_storage','approved_backing'];
 if(components.some(k=>typeof args[k]!=='string'||!/^(0|[1-9]\d{0,38})$/.test(args[k])||BigInt(args[k])>=2n**128n)||
    typeof price!=='string'||!/^(0|[1-9]\d{0,38})$/.test(price)||components.reduce((sum,k)=>sum+BigInt(args[k]),0n)!==BigInt(price))throw Error('Order components do not match the approved total.');
 return functionCall('company_order',args,price,'60000000000000');
}
export async function submitActions({wallet,accountId,contract,expectedCodeHash,actualCodeHash,owner,actions,ownerOnly=true}){
 if(!wallet||!accountId||(ownerOnly&&accountId!==owner))throw Error('Connect the required wallet account.');
 if(!expectedCodeHash||expectedCodeHash!==actualCodeHash)throw Error('Enter an independently verified matching contract code hash.');
 if(!Array.isArray(actions)||!actions.length||actions.length>6)throw Error('Invalid action batch.');
 return wallet.signAndSendTransaction({signerId:accountId,receiverId:contract,actions});
}
export function aiPolicy({enabled,consent,expensive,model,perCall,daily,lifetime,jobCount,dayCount}){
 if([enabled,consent,expensive].some(x=>typeof x!=='boolean')||!['economy','expensive'].includes(model))throw Error('Invalid AI policy.');
 if(enabled&&(!consent||(model==='expensive'&&!expensive)))throw Error('Explicit consent and model approval are required.');
 for(const [v,max] of [[perCall,10000000n],[daily,20000000n],[lifetime,50000000n]])if(typeof v!=='string'||!/^[1-9]\d{0,38}$/.test(v)||BigInt(v)>max)throw Error('AI reservation exceeds contract ceiling.');
 for(const [v,max] of [[jobCount,2],[dayCount,4]])if(!Number.isSafeInteger(v)||v<1||v>max)throw Error('AI call count exceeds contract ceiling.');
 return {enabled,scope_consent:consent,selected_model:model,allow_economy:true,allow_expensive:expensive,per_call_nanos:perCall,daily_nanos:daily,lifetime_nanos:lifetime,max_input_tokens:4608,max_output_tokens:512,max_calls_per_job:jobCount,max_calls_per_day:dayCount};
}
