// Explicit local development rehearsal. Never connects to a public NEAR network.
// Fixture owner/customer keys live only in its private sandbox, not in the worker.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {constants as FS} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {openPersistentSandbox} from '../contract/persistent/sandbox.mjs';
import {validateFinalOutcome} from '../executor/outcome.mjs';
import {businessAction,intentFingerprint} from '../web-chain/src/business-actions.js';
import {nativeAppAction} from '../web-chain/src/appointment-actions.js';
import {createLocalWorkspace} from './studio-local-workspace.mjs';
import {createLocalDocuments} from './studio-documents.mjs';
import {privateRehearsalPath} from './private-rehearsal-path.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../contract/package.json',import.meta.url));
const {KeyPair,transactions}=require('near-api-js');
const argv=process.argv.slice(2),option=name=>{const index=argv.indexOf(name);return index<0?null:argv[index+1];};
if(argv.includes('--help')){console.log('node scripts/studio.mjs --data-dir /absolute/private/rehearsal [--python /absolute/python] [--port 8890] [--max-ai-calls 1..4] [--no-worker]\nStarts a persistent local NEAR sandbox and a loopback-only Vite rehearsal. Seeded keys/test tokens only. No Cloud account, public deployment or external messages.');process.exit(0);}
const data=privateRehearsalPath(option('--data-dir'),ROOT);
const python=option('--python')||process.env.PROOF_WORK_PYTHON||'python3';
const uiPort=option('--port')?Number(option('--port')):8890;
const maxAICalls=option('--max-ai-calls')===null?4:Number(option('--max-ai-calls'));
if(!Number.isSafeInteger(maxAICalls)||maxAICalls<1||maxAICalls>4)throw Error('Choose a finite daily inference limit from 1 to 4.');
if(!Number.isSafeInteger(uiPort)||uiPort<1024||uiPort>65535)throw Error('Use an unprivileged local UI port.');
const uiOrigin='http://127.0.0.1:'+uiPort;
await fs.mkdir(data,{recursive:true,mode:0o700});
const info=await fs.lstat(data);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)||info.uid!==process.getuid()||await fs.realpath(data)!==data)throw Error('Rehearsal data must be a direct owner-controlled directory with mode 0700.');
const privateJSON=async(file,value)=>{const temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp',handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}await fs.rename(temporary,file);const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}};
const readPrivate=async file=>{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid()||stat.size>2_000_000)throw Error('Unsafe private rehearsal file.');return JSON.parse(await fs.readFile(file,'utf8'));};
async function privateDirectory(directory){await fs.mkdir(directory,{recursive:true,mode:0o700});const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)||info.uid!==process.getuid()||await fs.realpath(directory)!==directory)throw Error('Unsafe private rehearsal directory.');}
async function privateLog(file){const handle=await fs.open(file,FS.O_WRONLY|FS.O_CREAT|FS.O_APPEND|FS.O_NOFOLLOW,0o600);const info=await handle.stat();if(!info.isFile()||(info.mode&0o077)||info.uid!==process.getuid()){await handle.close();throw Error('Unsafe private rehearsal log.');}return handle;}
const N=10n**24n,STORAGE=65536n*10n**19n,GAS='200000000000000';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const workerDir=path.join(data,'worker');await privateDirectory(workerDir);
const environment={PATH:process.env.PATH,LANG:'C.UTF-8',TMPDIR:process.env.TMPDIR||'/tmp'};
const initialized=spawnSync(python,['-m','executor.main','init','--data-dir',workerDir,'--profile','business-operations-v1'],{cwd:ROOT,env:environment,encoding:'utf8',timeout:30000});if(initialized.status!==0)throw Error('Worker public-manifest initialization failed. Check the Python environment.');
const manifest=JSON.parse(initialized.stdout);
let sandbox,server,vite,worker,stopping=false,lastStatus={status:'not_started'},workerUpdatedAt=null;
const token=crypto.randomBytes(32).toString('hex'),model={available:false,mode:'local_ollama',name:'gemma4:e2b-it-q4_K_M',digest:'b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2'};
let metadata,company,appointments,owner,customer,operator,signing=false,activeRequest=null;
const workerLog=await privateLog(path.join(data,'worker.log'));
const controllerLog=await privateLog(path.join(data,'controller-transactions.jsonl'));
const requestsDir=path.join(data,'requests');await privateDirectory(requestsDir);
async function finalRaw(result,actor,receiver,method,id){const transaction=result?.result?.transaction;if(!transaction?.hash)throw Error('Transaction hash unavailable; do not resubmit.');const raw=await sandbox.worker.provider.txStatus(transaction.hash,actor.accountId,'FINAL');const checked=validateFinalOutcome(raw,{hash:transaction.hash,method,id},actor.accountId,receiver.accountId);await controllerLog.write(JSON.stringify({at:new Date().toISOString(),...checked.tx,status:checked.status})+'\n');await controllerLog.sync();return raw;}
async function call(actor,receiver,method,args,deposit='0'){const raw=await actor.callRaw(receiver,method,args,{gas:GAS,attachedDeposit:BigInt(deposit)});const outcome=await finalRaw(raw,actor,receiver,method,args.id||null);if(outcome.status?.Failure||outcome.receipts_outcome.some(value=>value.outcome.status?.Failure))throw Error('Fixture setup transaction failed: '+method);return outcome;}
async function view(receiver,method,args={}){const response=await sandbox.worker.provider.viewCall(receiver.accountId,method,args,{finality:'final'});return JSON.parse(Buffer.from(response.result).toString());}
function encrypted(value,key){const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',crypto.pbkdf2Sync(key,salt,600000,32,'sha256'),iv),bytes=Buffer.concat([cipher.update(value),cipher.final(),cipher.getAuthTag()]);const envelope=JSON.stringify({v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:bytes.toString('base64')});return {envelope,hash:sha(envelope)};}
async function modelStatus(){try{const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});const result=await response.json();model.available=response.ok&&result.models?.some(value=>value.name===model.name&&value.digest===model.digest)===true;}catch{model.available=false;}return model;}
function startWorker(){if(worker&&worker.exitCode===null&&worker.signalCode===null)throw Error('Worker is already running.');worker=spawn(python,['-m','executor.main','run','--config',path.join(data,'worker-config.json'),'--profile','business-operations-v1','--autonomous','--local-model','--interval','2'],{cwd:ROOT,env:environment,stdio:['ignore','pipe','pipe']});lastStatus={status:'starting'};let buffer='';worker.stdout.on('data',async chunk=>{await workerLog.write(chunk);buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{const status=JSON.parse(line);if(status&&typeof status.status==='string'){lastStatus=status;workerUpdatedAt=new Date().toISOString();}}catch{}}});worker.stderr.on('data',chunk=>workerLog.write(chunk));worker.once('exit',code=>{if(!stopping&&code!==0)lastStatus={status:'halted',action:'Review the existing journal, quota and task before restarting.',exit_code:code};});}
async function stopProcess(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));let timer;child.kill('SIGTERM');try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Local child did not stop; its private state was retained.')),20000);})]);}finally{clearTimeout(timer);}}
async function availablePort(){const listener=net.createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));return port;}
const companyReads=new Set(['state','company_state','execution_profile','company_list','company_task','company_history','company_mandates','company_mandate','company_mandate_readiness','company_inboxes','company_inbox','company_inbox_messages','ai_policy','ai_media_policy','company_solvency']);
const appReads=new Set(['state','slots','slot','quote','bookings','booking','solvency']);
const companyOwnerMethods=new Set(['company_submit_operation','company_create_mandate','company_create_inbox','company_set_mandate_enabled','company_set_inbox_enabled','company_cancel_operation','company_set_locale','set_freeze']);
const appOwnerMethods=new Set(['publish_slot','confirm','set_slot_enabled','withdraw','retry_withdraw','set_freeze']);
const appCustomerMethods=new Set(['book','settle','cancel','retry_refund']);
async function body(req){let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>1500000)throw Error('Request exceeds the rehearsal limit.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(JSON.stringify(value));};
try{
 sandbox=await openPersistentSandbox({homeDir:path.join(data,'chain')});owner=sandbox.root;
 const metadataPath=path.join(data,'rehearsal.json');let existing;
 try{existing=await readPrivate(metadataPath);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(existing){
  metadata=existing;assert.equal(metadata.chain_id,sandbox.chainId,'Existing chain identity changed');assert.equal(metadata.worker_key_id,manifest.worker_key_id,'Existing worker key changed');
  for(const [name,id] of Object.entries(metadata.accounts))assert.equal(id,name==='owner'?'test.near':name+'.test.near','Unexpected fixture account');
  operator=owner.getAccount(metadata.accounts.operator);customer=owner.getAccount(metadata.accounts.customer);company=owner.getAccount(metadata.contract);appointments=owner.getAccount(metadata.appointments_contract);
  assert.equal(sha(await fs.readFile(path.join(ROOT,'contract/build/company.wasm'))),metadata.company_wasm_sha256,'Current company candidate differs from this persisted rehearsal; use a new private rehearsal directory after reviewing changes.');
  assert.equal(sha(await fs.readFile(path.join(ROOT,'contract/build/appointments.wasm'))),metadata.appointments_wasm_sha256,'Current appointment candidate differs from this persisted rehearsal.');
  const [c,a]=await Promise.all([sandbox.worker.provider.viewAccount(company.accountId),sandbox.worker.provider.viewAccount(appointments.accountId)]);assert.equal(c.code_hash,metadata.code_hash,'Stored company code changed');assert.equal(a.code_hash,metadata.appointments_code_hash,'Stored appointments code changed');
  if(option('--max-ai-calls')!==null)assert.equal((await view(company,'ai_policy')).max_calls_per_day,maxAICalls,'Existing on-chain inference limit differs; a CLI restart cannot silently change owner policy.');
 }else{
  const supplier=await owner.createSubAccount('supplier');operator=await owner.createSubAccount('operator');customer=await owner.createSubAccount('customer');company=await owner.createSubAccount('company');appointments=await owner.createSubAccount('appointments');
  await company.deploy(path.join(ROOT,'contract/build/company.wasm'));await appointments.deploy(path.join(ROOT,'contract/build/appointments.wasm'));
  await call(owner,company,'init',{operator:operator.accountId,supplier:supplier.accountId,price:String(N),fee:String(N/10n),reserve:'0',perJob:String(N),daily:String(N)});
  const missionKey=crypto.randomBytes(32).toString('base64url'),idea=encrypted('A website inspection business with a NEAR-native customer inbox.',missionKey),goal=encrypted('Complete approved work and serve the named customer with verifiable records.',missionKey),sealed=crypto.publicEncrypt({key:manifest.worker_public_key,oaepHash:'sha256'},Buffer.from(JSON.stringify({record_key:missionKey}))).toString('base64');
  await call(owner,company,'company_set',{idea_hash:idea.hash,goal_hash:goal.hash,encrypted_idea:idea.envelope,encrypted_goal:goal.envelope},String(STORAGE));
  await call(owner,company,'company_fund_storage',{id:'workspace_capacity',blocks:31},String(31n*STORAGE));
  await call(owner,company,'set_execution_profile',{...manifest,mission_sealed_key:sealed,target_origin:''});
  await call(owner,company,'ai_set_policy',{enabled:true,scope_consent:true,selected_model:'economy',allow_economy:true,allow_expensive:false,per_call_nanos:'10000000',daily_nanos:'20000000',lifetime_nanos:'50000000',max_input_tokens:4608,max_output_tokens:512,max_calls_per_job:2,max_calls_per_day:maxAICalls});
  await privateJSON(path.join(data,'mission-recovery.json'),{record_key:missionKey,notice:'Private seeded-owner recovery. Never include this in review/video exports.'});
  await call(owner,appointments,'init',{service_name:'Website inspection appointments',cancellation_notice_seconds:60});
  await call(owner,appointments,'fund_backing',{id:'initial_backing'},String(N));
  const restricted=KeyPair.fromRandom('ed25519'),methods=['company_tick','company_attest','company_archive','ai_reserve_call','ai_complete_call','company_run_mandate','company_commit_plan'];
  const granted=await operator.batch(operator).addKey(restricted.getPublicKey(),transactions.functionCallAccessKey(company.accountId,methods,3n*N)).transact();await finalRaw(granted,operator,operator,'restricted_key_grant',null);
  await privateJSON(path.join(data,'operator.json'),{account_id:operator.accountId,secret_key:restricted.toString()});
  const [c,a]=await Promise.all([sandbox.worker.provider.viewAccount(company.accountId),sandbox.worker.provider.viewAccount(appointments.accountId)]);
  metadata={schema:1,mode:'local-near-rehearsal',chain_id:sandbox.chainId,contract:company.accountId,code_hash:c.code_hash,appointments_contract:appointments.accountId,appointments_code_hash:a.code_hash,company_wasm_sha256:sha(await fs.readFile(path.join(ROOT,'contract/build/company.wasm'))),appointments_wasm_sha256:sha(await fs.readFile(path.join(ROOT,'contract/build/appointments.wasm'))),worker_key_id:manifest.worker_key_id,accounts:{owner:owner.accountId,operator:operator.accountId,customer:customer.accountId}};await privateJSON(metadataPath,metadata);
 }
 metadata.genesis_sha256=sha(await fs.readFile(path.join(data,'chain/genesis.json')));await privateJSON(metadataPath,metadata);
 const gateway={network:'sandbox',rpc_url:sandbox.rpcAddr,chain_id:sandbox.chainId,contract_id:company.accountId,operator_id:operator.accountId,operator_key_file:path.join(data,'operator.json'),journal:path.join(workerDir,'rpc.json'),expected_code_hash:metadata.code_hash,worker_key_id:manifest.worker_key_id};
 await privateJSON(path.join(data,'worker-config.json'),{data_dir:workerDir,gateway});await modelStatus();
 const localWorkspace=createLocalWorkspace({repository:ROOT,privateRoot:data,python,environment,contract:company.accountId,codeHash:metadata.code_hash,chainId:sandbox.chainId,uiOrigin,appointments:{contract:appointments.accountId,codeHash:metadata.appointments_code_hash},
  rpc:async(method,params)=>{const response=await fetch(sandbox.rpcAddr,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:AbortSignal.timeout(30000)});const raw=await response.text();if(!response.ok||raw.length>2*1024*1024)throw Error('Local snapshot RPC unavailable or oversized.');const value=JSON.parse(raw);if(value.error||!value.result)throw Error('Pinned FINAL snapshot read was refused.');return value.result;}});
 const localDocuments=createLocalDocuments({repository:ROOT,workerDir,contract:company.accountId,python,environment,uiOrigin});
 const bridgePort=await availablePort();
 server=http.createServer(async(req,res)=>{let signatureDispatch=null;try{
  if(req.headers.host!=='127.0.0.1:'+bridgePort)throw Error('Local rehearsal host mismatch.');if(req.headers.origin&&req.headers.origin!==uiOrigin)throw Error('Local rehearsal origin mismatch.');
  const url=new URL(req.url,'http://127.0.0.1:'+bridgePort);if(url.search)throw Error('Rehearsal API does not accept URL query parameters.');
  if(req.method==='GET'&&url.pathname==='/__proof/config')return json(res,200,{...metadata,manifest,token,model,notice:'Seeded local sandbox accounts and test tokens. This is not a real wallet or public/hosted business.'});
  if(req.method==='GET'&&url.pathname==='/__proof/health')return json(res,200,{worker:{running:!!worker&&worker.exitCode===null&&worker.signalCode===null,status:lastStatus,updated_at:workerUpdatedAt},model:await modelStatus()});
  if(req.headers['x-proof-rehearsal']!==token)throw Error('Rehearsal session token required.');
  if(req.method==='POST'&&url.pathname.startsWith('/__proof/documents/'))return json(res,200,await localDocuments.handle(url.pathname.slice('/__proof/documents/'.length),await body(req),req));
  if(req.method==='POST'&&url.pathname.startsWith('/__proof/workspace/')){
   const route=url.pathname.slice('/__proof/workspace/'.length),result=await localWorkspace.handle(route,await body(req),req);
   if(result.download){res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+result.filename+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','X-Proof-Archive-Sha256':result.receipt.sha256,'X-Proof-Final-Block':result.receipt.snapshot_block.hash});return res.end(result.download);}
   return json(res,200,result);
  }
  if(req.method==='POST'&&url.pathname==='/__proof/rpc'){
   const request=await body(req);if(request.jsonrpc!=='2.0'||!['status','block','query','tx'].includes(request.method))throw Error('Only bounded read-only RPC is available.');
   const params=request.params;if(request.method==='query'){const receiver=params.account_id,reads=receiver===company.accountId?companyReads:receiver===appointments.accountId?appReads:null;if(!reads||!['view_account','call_function'].includes(params.request_type)||params.request_type==='call_function'&&!reads.has(params.method_name))throw Error('Unapproved rehearsal read.');}
   const response=await fetch(sandbox.rpcAddr,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});const raw=await response.text();if(raw.length>2_000_000)throw Error('RPC read exceeds bound.');res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(raw);
  }
  if(req.method==='POST'&&url.pathname==='/__proof/sign'){
   const request=await body(req),intent=request.intent;if(!/^[0-9a-f]{32}$/.test(request.request_id)||!['owner','customer'].includes(request.actor)||!intent||typeof intent.method!=='string'||!intent.args||Array.isArray(intent.args)||typeof intent.args!=='object'||typeof intent.deposit!=='string'||!/^(0|[1-9]\d{0,38})$/.test(intent.deposit)||BigInt(intent.deposit)>=2n**128n||!/^\d{14,15}$/.test(intent.gas)||BigInt(intent.gas)>300000000000000n)throw Error('Invalid seeded fixture signature.');
   const receiver=request.contract===company.accountId?company:request.contract===appointments.accountId?appointments:null;if(!receiver)throw Error('Fixture receiver is not approved.');
   if(receiver===company){if(intent.deposit!=='0'||!(request.actor==='owner'?companyOwnerMethods.has(intent.method):intent.method==='company_customer_message'))throw Error('Fixture account does not authorize this company action.');}
   else if(!(request.actor==='owner'?(appOwnerMethods.has(intent.method)||appCustomerMethods.has(intent.method)):appCustomerMethods.has(intent.method)))throw Error('Fixture account does not authorize this app action.');
   if(receiver===company)businessAction(intent);else nativeAppAction(intent);
   const actor=request.actor==='owner'?owner:customer,identity=await intentFingerprint(intent,receiver.accountId,actor.accountId),recordPath=path.join(requestsDir,request.request_id+'.json');
   signatureDispatch={request_id:request.request_id,fingerprint:identity,dispatched:false};
   if(signing){if(activeRequest?.id===request.request_id)signatureDispatch.dispatched=true;else{try{const prior=await readPrivate(recordPath);if(prior.identity===identity){if(prior.outcome)return json(res,200,{outcome:prior.outcome,reconciled:true});signatureDispatch.dispatched=true;}}catch(error){if(error.code!=='ENOENT')throw error;}}throw Error('Another fixture signature is in progress. Review the retained request before another action.');}signing=true;activeRequest={id:request.request_id,identity};
   try{
   let old;try{old=await readPrivate(recordPath);}catch(error){if(error.code!=='ENOENT')throw error;}if(old){if(old.identity!==identity)throw Error('Fixture request ID conflicts with another reviewed action.');if(old.outcome)return json(res,200,{outcome:old.outcome,reconciled:true});signatureDispatch.dispatched=true;throw Error('The existing fixture signature is unresolved. Inspect its exact transaction; no retry was sent.');}
   if((await fs.readdir(requestsDir)).length>=256)throw Error('Finite fixture request capacity reached.');
   await privateJSON(recordPath,{identity,status:'pending',method:intent.method,id:intent.args.id||null,created_at:new Date().toISOString()});
   let result;try{signatureDispatch.dispatched=true;result=await actor.callRaw(receiver,intent.method,intent.args,{gas:intent.gas,attachedDeposit:BigInt(intent.deposit)});const outcome=await finalRaw(result,actor,receiver,intent.method,intent.args.id||null);await privateJSON(recordPath,{identity,status:'final',outcome});return json(res,200,{outcome});}catch(error){await privateJSON(recordPath,{identity,status:'unknown',tx_hash:result?.result?.transaction?.hash||null,method:intent.method,id:intent.args.id||null});throw Error('Fixture action did not produce a complete known outcome. Its intent is retained.');}
   }finally{signing=false;activeRequest=null;}
  }
  if(req.method==='POST'&&url.pathname==='/__proof/worker/restart'){const request=await body(req);if(request.actor!=='owner')throw Error('Seeded owner approval required to restart the worker.');startWorker();return json(res,200,{restarted:true});}
  if(req.method==='GET'&&url.pathname.startsWith('/__proof/request/')){const requestId=url.pathname.slice('/__proof/request/'.length);if(!/^[0-9a-f]{32}$/.test(requestId))throw Error('Invalid fixture request identity.');const value=await readPrivate(path.join(requestsDir,requestId+'.json'));return json(res,200,{status:value.status,identity:value.identity,tx_hash:value.outcome?.transaction?.hash||value.tx_hash||null});}
  return json(res,404,{error:'Unknown local rehearsal route.'});
 }catch(error){return json(res,400,{error:error.message,...(signatureDispatch?{dispatch:signatureDispatch}:{})});}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(bridgePort,'127.0.0.1',resolve);});
 if(!argv.includes('--no-worker'))startWorker();
 vite=spawn('node',[path.join(ROOT,'web-chain/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(uiPort),'--strictPort'],{cwd:path.join(ROOT,'web-chain'),env:{...environment,PROOF_STUDIO_BRIDGE_PORT:String(bridgePort)},stdio:['ignore','pipe','pipe']});
 vite.stdout.on('data',chunk=>process.stdout.write(chunk));vite.stderr.on('data',chunk=>process.stderr.write(chunk));
 await privateJSON(path.join(data,'session.json'),{schema:1,mode:'local-near-rehearsal',ui_url:uiOrigin+'/business.html?rehearsal=1',pid:process.pid,bridge_port:bridgePort,chain_id:sandbox.chainId,started_at:new Date().toISOString(),public_deployment:false});
 console.log('Local NEAR workspace: '+uiOrigin+'/business.html?rehearsal=1');
 console.log('Seeded fixture accounts only. Persistent private state: '+data);
 console.log('Local Gemma: '+(model.available?'pinned model available':'unavailable; requests with AI need the local server'));
 await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);vite.once('exit',resolve);});
}finally{
 stopping=true;
 await stopProcess(worker);await stopProcess(vite);if(server)await new Promise(resolve=>server.close(resolve));if(sandbox)await sandbox.close();await workerLog.close();await controllerLog.close();
}
