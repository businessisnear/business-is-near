// Read-only public chain accounting. Never decrypts, signs, writes or infers.
import {digest} from './crypto.js';

const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const STATUSES=['reserved','confirmed','refunding','refund_failed','refunded','settled'];
function fail(){throw Error('Public analytics snapshot is incomplete or inconsistent.');}
function amount(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,38})$/.test(value)||BigInt(value)>=2n**128n)fail();return BigInt(value);}
function count(value,max=1000000){if(!Number.isSafeInteger(value)||value<0||value>max)fail();return value;}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))fail();return value;}
function account(value){if(typeof value!=='string'||!ACCOUNT.test(value))fail();return value;}
function hash(value){if(typeof value!=='string'||!HASH.test(value))fail();return value;}
function id(value){if(typeof value!=='string'||!ID.test(value))fail();return value;}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function equalAmount(actual,expected){if(amount(actual)!==expected)fail();}

export async function summarizeBusinessSnapshot(input){
 object(input);const boundary=object(input.boundary),company=object(input.company),app=object(input.appointments),policy=object(input.ai_policy);
 account(boundary.company_id);account(boundary.appointments_id);hash(boundary.company_code_hash);hash(boundary.appointments_code_hash);hash(boundary.block_hash);count(boundary.block_height,Number.MAX_SAFE_INTEGER);
 if(typeof boundary.chain_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(boundary.chain_id)||account(company.owner)!==account(app.owner))fail();
 const totalTasks=count(company.lifetime_tasks),bookingCount=count(app.booking_count,256);
 if(!Array.isArray(input.tasks)||input.tasks.length>1000||!Array.isArray(input.bookings)||input.bookings.length!==bookingCount)fail();
 if(typeof input.history_complete!=='boolean'||input.history_complete&&input.tasks.length!==totalTasks||!input.history_complete&&input.tasks.length>=totalTasks)fail();
 const taskIds=new Set(),taskStates={};const tasks=input.tasks.map(value=>{object(value);id(value.id);if(taskIds.has(value.id)||!['pending_review','queued','blocked','hired','declined','awaiting_evidence','attested','archived','cancelled'].includes(value.status)||!['general','qa'].includes(value.kind)||value.operation!==null&&(typeof value.operation!=='string'||!/^[a-z_]{1,32}$/.test(value.operation)))fail();taskIds.add(value.id);taskStates[value.status]=(taskStates[value.status]||0)+1;return {id:value.id,status:value.status,kind:value.kind,operation:value.operation};});
 let escrow=0n,earned=0n,refunded=0n,storage=0n,totalDeposits=0n;const states=Object.fromEntries(STATUSES.map(s=>[s,0])),bookingIds=new Set(),customers=new Set();
 const bookings=input.bookings.map(value=>{
  object(value);id(value.id);account(value.customer);if(bookingIds.has(value.id)||!STATUSES.includes(value.status))fail();bookingIds.add(value.id);customers.add(value.customer);states[value.status]++;
  const deposit=amount(value.deposit_yocto),contribution=amount(value.storage_contribution);if(deposit===0n)fail();storage+=contribution;totalDeposits+=deposit;
  if(['reserved','confirmed','refunding','refund_failed'].includes(value.status))escrow+=deposit;else if(value.status==='settled')earned+=deposit;else refunded+=deposit;
  return {id:value.id,customer:value.customer,status:value.status,deposit_yocto:value.deposit_yocto,storage_contribution:value.storage_contribution};
 });
 equalAmount(app.escrow,escrow);equalAmount(app.earned_total,earned);equalAmount(app.refunded_total,refunded);equalAmount(app.storage_collected,storage);
 const balance=amount(app.earned_balance),withdrawn=amount(app.withdrawn_total),withdrawing=amount(app.withdrawing);if(balance+withdrawn!==earned||withdrawing>balance)fail();
 count(policy.count,100);amount(policy.lifetime_reserved);
 const report={profile:'near-business-public-analytics-v1',boundary:{chain_id:boundary.chain_id,block_hash:boundary.block_hash,block_height:boundary.block_height,company_id:boundary.company_id,company_code_hash:boundary.company_code_hash,appointments_id:boundary.appointments_id,appointments_code_hash:boundary.appointments_code_hash},
  history:{complete:input.history_complete,observed:tasks.length,total:totalTasks,statuses:taskStates},
  reservations:{total:bookingCount,distinct_customer_accounts:customers.size,statuses:states},
  money:{unit:'yoctoNEAR',service_deposits_total:String(totalDeposits),escrow:String(escrow),earned_total:String(earned),earned_balance:String(balance),refunded_total:String(refunded),withdrawn_total:String(withdrawn),withdrawing:String(withdrawing),retained_storage:String(storage)},
  inference:{reservation_count:policy.count,authorization_reserved_nanos:policy.lifetime_reserved,reservation_is_invoice:false},
  unknown:{all_network_fees:null,provider_invoices:null,local_compute_cost:null,net_profit:null},
  limits:{reservation_is_sale:false,customer_account_is_person:false,statuses_are_historical_funnel:false,causal_effect_proven:false,public_rpc_is_independent_proof:false,private_records_read:false},
  records_sha256:await digest(canonical({tasks,bookings}))};
 return {...report,report_sha256:await digest(canonical(report))};
}

async function pages(read,{max,ids=false}){
 let from=0;const items=[],seen=new Set();
 while(true){
  const page=object(await read(from));if(!Array.isArray(page.items)||page.items.length>20)fail();
  for(const item of page.items){const ident=id(ids?item:item?.id);if(seen.has(ident))fail();seen.add(ident);items.push(item);if(items.length>max)fail();}
  if(page.next_index===null)return {items,complete:true};
  if(page.items.length===0||page.next_index!==from+page.items.length||!Number.isSafeInteger(page.next_index))fail();
  if(items.length===max)return {items,complete:false};from=page.next_index;
 }
}

export async function captureBusinessAnalytics(rpc,{companyId,companyCodeHash,appointmentsId,appointmentsCodeHash}){
 account(companyId);account(appointmentsId);hash(companyCodeHash);hash(appointmentsCodeHash);
 const status=await rpc.request('status',[]),block=await rpc.finalBlock();hash(block.hash);count(block.height,Number.MAX_SAFE_INTEGER);
 const [companyCode,appCode,company,app,policy]=await Promise.all([
  rpc.request('query',{request_type:'view_account',account_id:companyId,block_id:block.hash}),rpc.request('query',{request_type:'view_account',account_id:appointmentsId,block_id:block.hash}),
  rpc.view(companyId,'company_state',{},block.hash),rpc.view(appointmentsId,'state',{},block.hash),rpc.view(companyId,'ai_policy',{},block.hash)]);
 if(companyCode?.code_hash!==companyCodeHash||appCode?.code_hash!==appointmentsCodeHash)throw Error('Analytics contract code differs from the reviewed identity.');
 const [history,bookings]=await Promise.all([
  pages(from_index=>rpc.view(companyId,'company_history',{from_index,limit:20},block.hash),{max:1000,ids:true}),
  pages(from_index=>rpc.view(appointmentsId,'bookings',{from_index,limit:20},block.hash),{max:256})]);
 if(!bookings.complete)fail();
 // Bound concurrent RPC and discard ciphertext before retaining the report.
 const tasks=[];for(let index=0;index<history.items.length;index+=4){const batch=await Promise.all(history.items.slice(index,index+4).map(id=>rpc.view(companyId,'company_task',{id},block.hash)));for(let n=0;n<batch.length;n++){const value=object(batch[n]),taskId=history.items[index+n];if(Object.hasOwn(value,'id')&&value.id!==taskId)fail();tasks.push({id:taskId,status:value.status,kind:value.kind,operation:value.operation??null});}}
 return summarizeBusinessSnapshot({boundary:{chain_id:status?.chain_id,block_hash:block.hash,block_height:block.height,company_id:companyId,company_code_hash:companyCodeHash,appointments_id:appointmentsId,appointments_code_hash:appointmentsCodeHash},company,appointments:app,ai_policy:policy,tasks,bookings:bookings.items,history_complete:history.complete});
}

export async function analyticsSource(report){
 object(report);const {report_sha256,...content}=report;if(report.profile!=='near-business-public-analytics-v1'||!/^[0-9a-f]{64}$/.test(report_sha256)||await digest(canonical(content))!==report_sha256)fail();
 const value={snapshot:report_sha256,block:report.boundary.block_height,reservations:report.reservations.total,settled:report.reservations.statuses.settled,refunded:report.reservations.statuses.refunded,earned_yocto:report.money.earned_total,retained_storage_yocto:report.money.retained_storage,net_profit:'unknown',causation:'unproven'};
 const text=canonical(value);if(text.length>600)fail();return {id:'chain_snapshot',text};
}
