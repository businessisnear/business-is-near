// Private loopback rehearsal media/export. No wallet signing or cloud calls.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {constants as FS} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {validateFinalOutcome} from '../executor/outcome.mjs';

const HASH=/^[0-9a-f]{64}$/,ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');

export function localOwner(request,req,uiOrigin){
 if(req.headers.origin!==uiOrigin)throw Error('This local owner action requires the exact workspace Origin.');
 if(request?.actor!=='owner')throw Error('Seeded local owner approval required.');
}

export function createLocalWorkspace({repository,privateRoot,python,environment,rpc,contract,codeHash,chainId,uiOrigin,appointments=null}){
 const root=path.join(privateRoot,'workspace');
 async function adapter(action,input){
  const bytes=Buffer.from(JSON.stringify(input));if(bytes.length>3*1024*1024)throw Error('Local workspace request exceeds bound.');
  return await new Promise((resolve,reject)=>{
   const child=spawn(python,['-m','executor.studio_workspace','--root',root,'--repository',repository,action],{cwd:repository,env:environment,stdio:['pipe','pipe','pipe']});
   let output=[],size=0,ended=false;const timer=setTimeout(()=>{child.kill('SIGTERM');},30000);
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>6*1024*1024){child.kill('SIGTERM');return;}output.push(chunk);});
   child.stderr.on('data',()=>{}); // Never echo request payloads or private paths.
   child.once('error',()=>{clearTimeout(timer);ended=true;reject(Error('Local media/export adapter did not start.'));});
   child.once('exit',code=>{clearTimeout(timer);if(ended)return;try{if(size>6*1024*1024)throw Error('Local workspace response exceeds bound.');const value=JSON.parse(Buffer.concat(output).toString());if(code!==0||value.error)throw Error(value.error||'Local media/export validation refused the request.');resolve(value);}catch(error){reject(error instanceof SyntaxError?Error('Local media/export adapter did not return a complete result.'):error);}});
   child.stdin.on('error',()=>{});child.stdin.end(bytes);
  });
 }
 async function finalReference(){
  const result=await rpc('block',{finality:'final'}),header=result?.header;
  if(!header?.hash||!Number.isSafeInteger(header.height))throw Error('FINAL snapshot identity unavailable.');
  const account=await rpc('query',{request_type:'view_account',account_id:contract,block_id:header.hash});
  assert.equal(account.code_hash,codeHash,'Pinned company code changed. Reconnect before exporting or associating media.');
  return {hash:header.hash,height:header.height,code_hash:codeHash,contract};
 }
 async function read(method,args,reference,receiver=contract){
  const response=await rpc('query',{request_type:'call_function',account_id:receiver,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),block_id:reference.hash});
  if(!Array.isArray(response?.result)||response.result.length>2*1024*1024)throw Error('Snapshot contract response exceeds bound.');
  return JSON.parse(Buffer.from(response.result).toString());
 }
 async function taskTransactions(tasks,reference){
  const selected=new Map(tasks.map(task=>[task.id,task])),handle=await fs.open(path.join(privateRoot,'controller-transactions.jsonl'),FS.O_RDONLY|FS.O_NOFOLLOW);let raw;
  try{const before=await handle.stat();if(!before.isFile()||before.uid!==process.getuid()||before.nlink!==1||(before.mode&0o077)||before.size>2*1024*1024)throw Error('Unsafe or oversized controller history.');raw=await handle.readFile();const after=await handle.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Controller history changed during the selected export.');}finally{await handle.close();}
  const records=[];
  for(const line of raw.toString().trim().split('\n').filter(Boolean)){
   const row=JSON.parse(line);if(!selected.has(row.job_id)||!['company_submit_operation','company_customer_message'].includes(row.method))continue;
   if(!exact(row,['at','method','job_id','hash','signer','receiver','gas_burnt','tokens_burnt','receipts','status'])||row.receiver!==contract)throw Error('Unexpected selected controller transaction metadata.');
   const outcome=await rpc('tx',{tx_hash:row.hash,sender_account_id:row.signer,wait_until:'FINAL'}),checked=validateFinalOutcome(outcome,{hash:row.hash,method:row.method,id:row.job_id},row.signer,contract);
   if(checked.status!=='final'||row.status!=='final'||checked.tx.tokens_burnt!==row.tokens_burnt||checked.tx.gas_burnt!==row.gas_burnt||JSON.stringify(checked.tx.receipts)!==JSON.stringify(row.receipts))throw Error('Selected transaction fees/outcomes do not match FINAL history.');
   const actions=outcome.transaction.actions,call=actions?.length===1?actions[0].FunctionCall:null,args=call?JSON.parse(Buffer.from(call.args,'base64').toString()):null;
   if(call?.method_name!==row.method||args?.id!==row.job_id||args.scope_hash!==selected.get(row.job_id).scope_hash)throw Error('Selected transaction does not approve the selected task scope.');
   const block=await rpc('block',{block_id:outcome.transaction_outcome.block_hash});if(!Number.isSafeInteger(block?.header?.height)||block.header.height>reference.height)throw Error('Selected transaction is newer than the pinned export block.');
   records.push({...row,block_hash:block.header.hash,block_height:block.header.height});
  }
  return records;
 }
 async function handle(route,request,req){
  localOwner(request,req,uiOrigin);
  if(route==='inventory'){
   if(!exact(request,['actor']))throw Error('Inventory takes only the local actor.');return await adapter('inventory',{});
  }
  if(route==='import'){
   if(!exact(request,['actor','image_base64','source','cost']))throw Error('Exact private PNG import fields required.');
   return await adapter('import',{image_base64:request.image_base64,source:request.source,cost:request.cost});
  }
  if(route==='import_audio'){
   if(!exact(request,['actor','audio_base64','source','cost']))throw Error('Exact private short WAV import fields required.');
   return await adapter('import_audio',{audio_base64:request.audio_base64,source:request.source,cost:request.cost});
  }
  if(route==='asset'){
   if(!exact(request,['actor','asset_id'])||!HASH.test(request.asset_id))throw Error('Exact existing asset hash required.');
   return await adapter('asset',{asset_id:request.asset_id});
  }
  if(route==='reuse'){
   if(!exact(request,['actor','asset_id','import_id','operation_id','scope_hash','role'])||!HASH.test(request.asset_id)||!HASH.test(request.scope_hash)||!ID.test(request.operation_id)||!ID.test(request.import_id)||request.role!=='reference')throw Error('Exact existing asset and approved task scope required.');
   const reference=await finalReference(),task=await read('company_task',{id:request.operation_id},reference);
   if(!task||task.scope_hash!==request.scope_hash||!HASH.test(task.scope_hash)||task.status==='cancelled')throw Error('Task scope does not match the actual approved FINAL company record.');
   const {actor,...fields}=request;return await adapter('reuse',{...fields,chain_reference:reference});
  }
  if(route==='export'){
   if(!exact(request,['actor','task_ids','asset_ids','include_conversations',...('document_refs'in request?['document_refs']:[])])||!Array.isArray(request.task_ids)||!request.task_ids.length||request.task_ids.length>16||new Set(request.task_ids).size!==request.task_ids.length||request.task_ids.some(id=>!ID.test(id))||!Array.isArray(request.asset_ids)||request.asset_ids.length>32||request.asset_ids.some(id=>!HASH.test(id))||typeof request.include_conversations!=='boolean')throw Error('Select 1–16 approved tasks and at most 32 exact assets.');
   const documentRefs=request.document_refs??[];if(!Array.isArray(documentRefs)||documentRefs.length>8||documentRefs.some(ref=>!exact(ref,['asset_sha256','format','parser_sha256'])||!HASH.test(ref.asset_sha256)||!HASH.test(ref.parser_sha256)||!['utf8-text-v1','csv-v1','pdf-native-v1'].includes(ref.format))||new Set(documentRefs.map(ref=>ref.asset_sha256+'|'+ref.format+'|'+ref.parser_sha256)).size!==documentRefs.length)throw Error('Select at most eight distinct exact inspected documents.');
   const reference=await finalReference();
   const [state,company,profile,policy,history,mandates,inboxes]=await Promise.all([
    read('state',{},reference),read('company_state',{},reference),read('execution_profile',{},reference),read('ai_policy',{},reference),read('company_history',{from_index:0,limit:20},reference),read('company_mandates',{},reference),read('company_inboxes',{},reference),
   ]);
   const tasks=await Promise.all(request.task_ids.map(async id=>({id,...await read('company_task',{id},reference)})));
   if(tasks.some(task=>!HASH.test(task.scope_hash)||!task.operation))throw Error('Only actual approved business tasks can enter this export.');
   const selectedIds=new Set(tasks.map(task=>task.id));
   const conversations=request.include_conversations?await Promise.all(inboxes.items.map(async box=>({inbox:box,messages:await read('company_inbox_messages',{id:box.id,limit:20},reference)}))):[];
   const evidence=tasks.filter(task=>task.evidence_hash).map(task=>({id:task.id,evidence_hash:task.evidence_hash,encrypted_evidence:task.encrypted_evidence}));
   const transactions=await taskTransactions(tasks,reference);let app=null;
   if(appointments){const account=await rpc('query',{request_type:'view_account',account_id:appointments.contract,block_id:reference.hash});assert.equal(account.code_hash,appointments.codeHash,'Appointments code changed before the selected snapshot.');const [state,slots,bookings]=await Promise.all([read('state',{},reference,appointments.contract),read('slots',{limit:20},reference,appointments.contract),read('bookings',{limit:20},reference,appointments.contract)]);app={contract:appointments.contract,code_hash:appointments.codeHash,state,slots,bookings};}
   const snapshot={schema:1,network:'local-near-sandbox',contract,code_hash:codeHash,block:reference,
    data:{chain_id:chainId,treasury:state,company,execution_profile:profile,ai_policy:policy,mandates,appointments:app},history:{...history,selected_ids:[...selectedIds],finalized_direct_task_transactions:transactions},conversations,tasks,evidence,
    coverage:{selected_tasks:tasks.map(task=>task.id),history_from_index:0,history_count:history.items.length,history_next_index:history.next_index??null,conversations_included:request.include_conversations,conversation_count:conversations.length,evidence_count:evidence.length,encrypted_records_without_keys:true,appointments:app?'first 20 slots and bookings with continuation recorded at the same FINAL block':'not configured',known_transaction_fees:'verified controller-recorded selected direct task signatures only; worker and other history omitted',transaction_count:transactions.length,source:'explicit actual workspace source and current compiled frontend',media_associations:'local records only; no new NEAR authority',local_actor_authority:'roles selected by local operator; no real-user authentication or tenant isolation',selected_documents:documentRefs,document_restore:'explicit same-company nested transfer into a fresh provisioned worker only; no automatic parser or account authority',excluded_data:'unchecked original document files/parser caches; separate knowledge/native-app/factory/outbox/public-page contract state; all credentials and recovery keys'}};
   const result=await adapter('export',{snapshot,selected_assets:request.asset_ids,selected_documents:documentRefs});
   if(!/^company-[0-9a-f]{32}\.zip$/.test(result.archive_id))throw Error('Unexpected private archive identity.');
   const handle=await fs.open(path.join(root,'exports',result.archive_id),FS.O_RDONLY|FS.O_NOFOLLOW);
   try{const before=await handle.stat();if(!before.isFile()||before.uid!==process.getuid()||before.nlink!==1||(before.mode&0o077)||before.size>64*1024*1024)throw Error('Unsafe private archive.');const archive=await handle.readFile(),after=await handle.stat();if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||archive.length!==result.bytes||sha(archive)!==result.sha256)throw Error('Private archive changed before download.');return {download:archive,filename:'company-'+contract+'-'+reference.height+'.zip',receipt:result};}finally{await handle.close();}
  }
  throw Error('Unknown local workspace operation.');
 }
 return {handle};
}
