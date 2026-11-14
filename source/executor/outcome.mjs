// Validate a FINAL RPC response before recording fees or clearing signed intent.
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,key)=>Object.hasOwn(x,key);
function amount(value,bits,{number=false}={}){
 if(number&&typeof value==='number'){
  if(!Number.isSafeInteger(value)||value<0)throw Error('Unknown or imprecise execution fee');
  value=String(value);
 }
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(value)||BigInt(value)>=2n**BigInt(bits))throw Error('Unknown or imprecise execution fee');
 return BigInt(value);
}
function status(value,final=false){
 if(!object(value)||Object.keys(value).length!==1)throw Error('Incomplete execution status');
 if(own(value,'Failure')){if(!object(value.Failure)||!Object.keys(value.Failure).length)throw Error('Malformed failure status');return 'failed';}
 if(own(value,'SuccessValue')){const text=value.SuccessValue;if(typeof text!=='string'||text.length>131072||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)||btoa(atob(text))!==text)throw Error('Malformed success status');return 'success';}
 if(!final&&own(value,'SuccessReceiptId')&&typeof value.SuccessReceiptId==='string'&&HASH.test(value.SuccessReceiptId))return 'receipt';
 throw Error('Execution is not finalized');
}
export function validateFinalOutcome(out,pending,operator,contract){
 if(!object(pending)||!object(out)||out.final_execution_status!=='FINAL')throw Error('Transaction outcome is not FINAL');
 const transaction=out.transaction;
 if(!object(transaction)||transaction.hash!==pending.hash||transaction.signer_id!==operator||transaction.receiver_id!==contract)throw Error('Final transaction identity mismatch');
 const top=status(out.status,true);
 if(!object(out.transaction_outcome)||out.transaction_outcome.id!==pending.hash)throw Error('Transaction outcome identity mismatch');
 if(!Array.isArray(out.receipts_outcome)||out.receipts_outcome.length>256)throw Error('Incomplete execution outcomes');
 const outcomes=[out.transaction_outcome,...out.receipts_outcome],byId=new Map();let gas=0n,tokens=0n,hasFailure=top==='failed';
 for(const item of outcomes){
  if(!object(item)||typeof item.id!=='string'||!HASH.test(item.id)||byId.has(item.id)||!object(item.outcome))throw Error('Invalid execution outcome identity');
  const value=item.outcome;
  if(typeof value.executor_id!=='string'||!ACCOUNT.test(value.executor_id)||!Array.isArray(value.receipt_ids)||value.receipt_ids.length>256||new Set(value.receipt_ids).size!==value.receipt_ids.length||value.receipt_ids.some(id=>typeof id!=='string'||!HASH.test(id)))throw Error('Incomplete execution receipt index');
  if(item===out.transaction_outcome&&value.executor_id!==operator)throw Error('Transaction executor mismatch');
  const result=status(value.status);hasFailure ||= result==='failed';
  gas+=amount(value.gas_burnt,64,{number:true});tokens+=amount(value.tokens_burnt,128);
  byId.set(item.id,item);
 }
 // FINAL includes refund outcomes. Missing, duplicated or unrelated receipt
 // outcomes cannot be treated as known zero cost or complete settlement.
 const seen=new Set(),queue=[pending.hash];
 while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);const item=byId.get(id);if(!item)throw Error('Receipt outcome is missing');for(const child of item.outcome.receipt_ids){if(child===pending.hash)throw Error('Invalid receipt cycle');queue.push(child);}if(own(item.outcome.status,'SuccessReceiptId')&&!item.outcome.receipt_ids.includes(item.outcome.status.SuccessReceiptId))throw Error('Unbound success receipt');}
 if(seen.size!==outcomes.length)throw Error('Unrelated execution receipt outcome');
 if(gas>=2n**64n||tokens>=2n**128n)throw Error('Execution fee aggregate overflow');
 return {status:hasFailure?'failed':'final',tx:{method:pending.method,job_id:pending.id||null,hash:transaction.hash,signer:operator,receiver:contract,gas_burnt:String(gas),tokens_burnt:String(tokens),receipts:out.receipts_outcome.map(item=>item.id).sort()}};
}
export async function commitFinalOutcome(journal,out,operator,contract,archive,save){
 const pending=journal.pending,result=validateFinalOutcome(out,pending,operator,contract);
 const record={id:pending.id,method:pending.method,hash:pending.hash,status:result.status,tx:result.tx};
 if(pending.request_id!==undefined){record.request_id=pending.request_id;record.args_hash=pending.args_hash;}
 // Do not mutate the active pending record until the complete replacement is
 // durable. A malformed response or failed archive/save stays reconcilable.
 await archive.request(record);const next={...journal,history:[...journal.history,record],pending:null};
 await archive.compact(next);await save(next);Object.assign(journal,next);return result;
}
