import {NearBindgen,near,call,view,initialize,assert,NearPromise,validateAccountId,PublicKey,encode} from 'near-sdk-js';

// Bounded testnet onboarding candidate; public deployment requires separate review.
declare function includeBytes(path:string):Uint8Array;
// Lazy: SDK export discovery imports this module in Node without the NEAR env.
let cachedCompany:Uint8Array|undefined;
const companyBytes=()=>cachedCompany||(cachedCompany=includeBytes('../build/company.wasm'));
const MAX=128,MAX_ATTEMPTS=3,STORAGE_BYTES=8192n,CUSHION_BYTES=262144n;
const INIT_GAS=70000000000000n,CALLBACK_GAS=50000000000000n,CREATE_GAS=300000000000000n,REFUND_GAS=120000000000000n;
const ACK='I_REVIEWED_ORIGINAL_SIGNER_FULL_ACCESS_CUSTODY';
const SERVICE='near-founder-worker-service-v1',MODEL='gemma4:e2b-it-q4_K_M',MODEL_DIGEST='b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2';
type SiteContent={title:string;summary:string;items:{text:string}[]};
type Config={operator:string;supplier:string;price:string;fee:string;reserve:string;perJob:string;daily:string};
type RecordEntry={id:string;creator:string;child:string;owner_key_hex:string;config:Config;request_hash:string;template_sha256:string;storage:string;backing:string;phase:string;create_attempt:number;refund_attempt:number;created_at:string;updated_at:string;last_result:string};
const amount=(x:string)=>{assert(typeof x==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(x),'invalid exact amount');const v=BigInt(x);assert(v<=(1n<<128n)-1n,'amount exceeds u128');return v;};
const hex=(x:Uint8Array)=>Array.from(x).map(b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(x:string)=>{const v=new Uint8Array(x.length);for(let i=0;i<x.length;i++){assert(x.charCodeAt(i)<128,'ASCII required');v[i]=x.charCodeAt(i);}return v;};
const hash=(x:string)=>hex(near.sha256(bytes(x)));
const key=(x:string)=>{assert(typeof x==='string'&&/^00[0-9a-f]{64}$/.test(x),'original Ed25519 public key required');const v=new Uint8Array(33);for(let i=0;i<33;i++)v[i]=parseInt(x.slice(2*i,2*i+2),16);return new PublicKey(v);};
const base58=(v:Uint8Array)=>{const a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let z=0;while(z<v.length&&v[z]===0)z++;let n=0n;for(const b of v)n=n*256n+BigInt(b);let out='';while(n>0n){out=a[Number(n%58n)]+out;n/=58n;}return '1'.repeat(z)+out;};
const exact=(v:any,names:string[])=>assert(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.slice().sort().join(','),'unexpected config fields');

@NearBindgen({requireInit:true})
class CompanyFactory {
 owner='';frozen=false;count=0;storage_collected='0';accepted_backing='0';deployed_backing='0';creation_pending='0';refundable_backing='0';refund_pending='0';refunded_backing='0';publication_storage_collected='0';
 @initialize({}) init(){this.owner=near.predecessorAccountId();this.solvent();}
 private id(id:string){assert(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id),'invalid request id');}
 private get(id:string):RecordEntry{this.id(id);const r=near.storageRead('factory:record:'+id);assert(r!==null,'request missing');return JSON.parse(r);}
 private save(r:RecordEntry){r.updated_at=(near.blockTimestamp()/1000000000n).toString();near.storageWrite('factory:record:'+r.id,JSON.stringify(r));}
 private noDeposit(){assert(near.attachedDeposit()===0n,'no additional deposit allowed');}
 private direct(){const actor=near.predecessorAccountId();assert(actor===near.signerAccountId()&&actor!==near.currentAccountId(),'originating wallet call required');return actor;}
 private config(v:Config,creator:string,child:string):Config{exact(v,['operator','supplier','price','fee','reserve','perJob','daily']);assert(typeof v.operator==='string'&&validateAccountId(v.operator)&&v.operator!==creator&&v.operator!==child,'operator must differ from business owner and child');assert(typeof v.supplier==='string'&&validateAccountId(v.supplier),'invalid supplier');for(const x of [v.price,v.fee,v.reserve,v.perJob,v.daily])amount(x);assert(amount(v.price)>0n&&amount(v.fee)>0n&&amount(v.fee)<=amount(v.perJob),'invalid economics');return {operator:v.operator,supplier:v.supplier,price:v.price,fee:v.fee,reserve:v.reserve,perJob:v.perJob,daily:v.daily};}
 private custody(approved_key_hex:string,custody_ack:string){assert(custody_ack===ACK,'explicit full access custody review required');key(approved_key_hex);const actual=near.signerAccountPk();assert(actual.length===33&&actual[0]===0&&hex(actual)===approved_key_hex,'original signer public key changed');}
 private backing(){const COMPANY=companyBytes();const cost=near.storageByteCost();assert(cost>0n&&COMPANY.length>0&&COMPANY.length<2000000,'template or storage cost out of bounds');const storage=STORAGE_BYTES*cost,backing=(BigInt(COMPANY.length)+CUSHION_BYTES)*cost;assert(backing>0n&&storage+backing<=50n*10n**24n,'quote exceeds finite ceiling');return {storage,backing};}
 private obligations(){return amount(this.creation_pending)+amount(this.refundable_backing)+amount(this.refund_pending);}
 private retained(){return (near.storageUsage()+65536n)*near.storageByteCost()+amount(this.storage_collected);}
 private solvent(){assert(near.accountBalance()>=this.retained()+this.obligations(),'separate backing not yet solvent');this.conservation();}
 private conservation(){assert(amount(this.accepted_backing)===amount(this.deployed_backing)+this.obligations()+amount(this.refunded_backing),'backing conservation failed');}
 private service(){const raw=near.storageRead('factory:worker-service');return raw===null?null:JSON.parse(raw);}
 @view({}) worker_service(){
  const p=this.service(),now=near.blockTimestamp()/1000000000n;
  if(p===null)return null;
  const heartbeat=JSON.parse(near.storageRead('factory:worker-heartbeat')||'{"at":"0","expires_at":"0"}');
  return {schema:SERVICE,...p,heartbeat_at:heartbeat.at,heartbeat_expires_at:heartbeat.expires_at,observed_at:now.toString(),online:!this.frozen&&now<amount(p.service_expires_at)&&now<amount(heartbeat.expires_at)};
 }
 @call({}) set_worker_service({operator_id,worker_public_key,worker_key_id,service_expires_at}:{operator_id:string,worker_public_key:string,worker_key_id:string,service_expires_at:string}){
  this.noDeposit();assert(near.predecessorAccountId()===this.owner,'factory owner only');
  assert(this.count===0&&this.service()===null,'worker service identity is immutable');
  assert(typeof operator_id==='string'&&validateAccountId(operator_id)&&operator_id!==this.owner&&operator_id!==near.currentAccountId(),'distinct service operator required');
  assert(typeof worker_public_key==='string'&&worker_public_key.length>=400&&worker_public_key.length<=2048&&/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/.test(worker_public_key),'bounded worker public key required');
  assert(typeof worker_key_id==='string'&&/^[0-9a-f]{64}$/.test(worker_key_id)&&hash(worker_public_key)===worker_key_id,'worker encryption identity mismatch');
  const now=near.blockTimestamp()/1000000000n,expiry=amount(service_expires_at);assert(expiry>now&&expiry<=now+172800n,'service expiry exceeds48hours');
  near.storageWrite('factory:worker-service',JSON.stringify({operator_id,worker_public_key,worker_key_id,service_expires_at,execution_backend:'local_gemma_mock',model:MODEL,model_digest:MODEL_DIGEST,cloud_billing_verified:false,tee_verified:false,max_companies:8,max_reservations_per_company:2,max_reservations_global:16}));this.solvent();
 }
 @call({}) heartbeat({worker_key_id,expires_at}:{worker_key_id:string,expires_at:string}){
  this.noDeposit();const p=this.service();assert(p!==null,'worker service not configured');
  assert(near.predecessorAccountId()===p.operator_id&&near.signerAccountId()===p.operator_id,'service operator only');
  assert(!this.frozen&&worker_key_id===p.worker_key_id,'worker service frozen or identity changed');
  const now=near.blockTimestamp()/1000000000n,expiry=amount(expires_at);
  assert(now<amount(p.service_expires_at)&&expiry>now&&expiry<=now+600n&&expiry<=amount(p.service_expires_at),'heartbeat expiry exceeds600seconds');
  near.storageWrite('factory:worker-heartbeat',JSON.stringify({at:now.toString(),expires_at}));this.solvent();return this.worker_service();
 }
 private serviceAllows(config?:Config,existing=false){const p=this.service();if(p===null)return true;const live=this.worker_service();return live.online&&(existing||this.count<p.max_companies)&&(!config||config.operator===p.operator_id&&config.supplier===p.operator_id);}
 private siteRecord(id:string){this.id(id);const raw=near.storageRead('factory:site:'+id);return raw===null?null:JSON.parse(raw);}
 private siteContent(v:SiteContent){
  exact(v,['title','summary','items']);const text=(value:string,limit:number)=>{
   assert(typeof value==='string'&&value.trim().length>0&&value.length<=limit,'bounded nonempty publication text required');
   assert(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/.test(value)&&!/(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|javascript:|data:|file:|-----BEGIN [^-]*PRIVATE KEY-----|(?:record[_ ]?key|secret[_ ]?key|private[_ ]?key|seed phrase|mnemonic)["']?\s*[:=]|ed25519:)/i.test(value),'plain publication text only; no markup, URLs or credential markers');
  };
  text(v.title,200);text(v.summary,1500);assert(Array.isArray(v.items)&&v.items.length>=1&&v.items.length<=8,'bounded publication items required');
  for(const item of v.items){exact(item,['text']);text(item.text,2000);}
  const content={title:v.title,summary:v.summary,items:v.items.map(item=>({text:item.text}))};
  assert(encode(JSON.stringify(content)).length<=12288,'publication content exceeds12KiB');return content;
 }
 @view({}) site({id}:{id:string}){const record=this.siteRecord(id);return record===null?null:{...record,content:record.status==='published'?record.content:null};}
 @call({payableFunction:true}) publish_site({id,expected_version,content}:{id:string,expected_version:number,content:SiteContent}){
  const r=this.get(id);assert(r.phase==='active'&&near.predecessorAccountId()===r.creator,'original active-company creator only');
  const previous=this.siteRecord(id);assert(Number.isSafeInteger(expected_version)&&expected_version>=0&&expected_version<1000000&&expected_version===(previous===null?0:previous.revision),'publication revision changed');
  const approved=this.siteContent(content),deposit=near.attachedDeposit(),required=16384n*near.storageByteCost();
  assert(deposit===(previous===null?required:0n),'exact first publication storage funding required; updates take no deposit');
  const now=(near.blockTimestamp()/1000000000n).toString(),raw=JSON.stringify(approved),record={schema:'near-founder-site-v1',id,company_id:r.child,owner_id:r.creator,revision:expected_version+1,status:'published',content:approved,content_sha256:hex(near.sha256(encode(raw))),created_at:previous===null?now:previous.created_at,updated_at:now,storage_deposit:previous===null?required.toString():previous.storage_deposit};
  assert(encode(JSON.stringify(record)).length+encode('factory:site:'+id).length+1024<=16384,'site record exceeds its16KiB reserve');
  near.storageWrite('factory:site:'+id,JSON.stringify(record));if(previous===null)this.publication_storage_collected=(amount(this.publication_storage_collected)+deposit).toString();this.solvent();
  near.log(JSON.stringify({standard:'businessisnear',version:'1.0.0',event:'site_published',data:{id,company_id:r.child,owner_id:r.creator,revision:record.revision,content_sha256:record.content_sha256}}));return this.site({id});
 }
 @call({}) unpublish_site({id,expected_version}:{id:string,expected_version:number}){
  this.noDeposit();const r=this.get(id),record=this.siteRecord(id);assert(r.phase==='active'&&near.predecessorAccountId()===r.creator,'original active-company creator only');
  assert(record!==null&&record.status==='published'&&Number.isSafeInteger(expected_version)&&expected_version===record.revision&&expected_version<1000000,'published revision changed');
  record.status='unpublished';record.revision++;record.updated_at=(near.blockTimestamp()/1000000000n).toString();near.storageWrite('factory:site:'+id,JSON.stringify(record));this.solvent();
  near.log(JSON.stringify({standard:'businessisnear',version:'1.0.0',event:'site_unpublished',data:{id,company_id:r.child,owner_id:r.creator,revision:record.revision,content_sha256:record.content_sha256}}));return this.site({id});
 }
 private add(field:string,delta:bigint){const value=amount((this as any)[field])+delta;assert(value>=0n&&value<=(1n<<128n)-1n,'ledger overflow');(this as any)[field]=value.toString();}
 private identity(id:string,creator:string,label:string,owner_key_hex:string,config:Config){this.id(id);assert(typeof creator==='string'&&validateAccountId(creator)&&creator!==near.currentAccountId(),'invalid creator');assert(typeof label==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(label),'invalid child label');const child=label+'.'+near.currentAccountId();assert(validateAccountId(child),'invalid immediate child');key(owner_key_hex);const cfg=this.config(config,creator,child),q=this.backing(),template=this.template();const request_hash=hash(JSON.stringify(['near-company-factory-v1',near.currentAccountId(),id,creator,child,owner_key_hex,template.sha256,template.bytes,[cfg.operator,cfg.supplier,cfg.price,cfg.fee,cfg.reserve,cfg.perJob,cfg.daily],q.storage.toString(),q.backing.toString()]));return {id,creator,child,owner_key_hex,config:cfg,request_hash,template_sha256:template.sha256,storage:q.storage.toString(),backing:q.backing.toString()};}
 private dispatch(r:RecordEntry){const COMPANY=companyBytes();assert(r.template_sha256===this.template().sha256,'original embedded template changed');return NearPromise.new(r.child).createAccount().transfer(amount(r.backing)).deployContract(COMPANY).addFullAccessKey(key(r.owner_key_hex)).functionCall('init',JSON.stringify({...r.config,factory_owner:r.creator}),0n,INIT_GAS).then(NearPromise.new(near.currentAccountId()).functionCall('on_created',JSON.stringify({id:r.id,attempt:r.create_attempt}),0n,CALLBACK_GAS));}
 @view({}) template(){const COMPANY=companyBytes();const digest=near.sha256(COMPANY);return {schema:'near-company-factory-v1',sha256:hex(digest),code_hash:base58(digest),bytes:COMPANY.length,init_method:'init',init_schema:'operator,supplier,price,fee,reserve,perJob,daily,factory_owner',full_access_custody_ack:ACK,max_records:MAX,max_create_attempts:MAX_ATTEMPTS,max_refund_attempts:MAX_ATTEMPTS,create_gas:CREATE_GAS.toString(),refund_gas:REFUND_GAS.toString()};}
 @view({}) quote({id,creator,label,owner_key_hex,config}:{id:string;creator:string;label:string;owner_key_hex:string;config:Config}){const intent=this.identity(id,creator,label,owner_key_hex,config);return {...intent,total:(amount(intent.storage)+amount(intent.backing)).toString(),storage_byte_cost:near.storageByteCost().toString(),available:!this.frozen&&this.count<MAX&&this.serviceAllows(config)&&near.storageRead('factory:record:'+id)===null&&near.storageRead('factory:child:'+intent.child)===null,storage_refundable:false,backing_purpose:'initial_child_account_and_contract_storage_not_business_cash'};}
 @view({}) record({id}:{id:string}){this.id(id);const raw=near.storageRead('factory:record:'+id);if(raw===null)return null;const r=JSON.parse(raw);return {...r,refund_ready:['create_failed','refund_failed'].includes(r.phase)&&near.accountBalance()>=this.retained()+this.obligations(),recovery:r.phase==='creating'||r.phase==='refunding'?'inspect_final_receipts_never_resend_unknown':'known_callback_result'};}
 @view({}) list({from=0,limit=20}:{from?:number;limit?:number}){assert(Number.isInteger(from)&&from>=0&&from<=MAX&&Number.isInteger(limit)&&limit>=1&&limit<=32,'invalid bounded page');const records=[];for(let i=from;i<Math.min(this.count,from+limit);i++){const id=near.storageRead('factory:index:'+i);if(id!==null)records.push(this.record({id}));}return {records,total:this.count};}
 @view({}) state(){this.conservation();return {owner:this.owner,frozen:this.frozen,count:this.count,max_records:MAX,storage_collected:this.storage_collected,accepted_backing:this.accepted_backing,deployed_backing:this.deployed_backing,creation_pending:this.creation_pending,refundable_backing:this.refundable_backing,refund_pending:this.refund_pending,refunded_backing:this.refunded_backing,required_retained:this.retained().toString(),required_obligations:this.obligations().toString(),account_balance:near.accountBalance().toString(),business_cash:'0',business_revenue:'0',observed_at:(near.blockTimestamp()/1000000000n).toString()};}
 @call({payableFunction:true}) create({id,label,config,approved_key_hex,approved_request_hash,approved_storage,approved_backing,approved_template_sha256,custody_ack}:{id:string;label:string;config:Config;approved_key_hex:string;approved_request_hash:string;approved_storage:string;approved_backing:string;approved_template_sha256:string;custody_ack:string}){
  const creator=this.direct();assert(!this.frozen&&this.count<MAX,'factory frozen or capacity exhausted');assert(this.serviceAllows(config),'worker service offline, mismatched or capacity exhausted');assert(near.prepaidGas()>=CREATE_GAS,'insufficient creation gas');this.custody(approved_key_hex,custody_ack);const intent=this.identity(id,creator,label,approved_key_hex,config);assert(intent.request_hash===approved_request_hash&&intent.template_sha256===approved_template_sha256,'intent or template pin changed');assert(intent.storage===approved_storage&&intent.backing===approved_backing&&near.attachedDeposit()===amount(intent.storage)+amount(intent.backing),'exact approved quote required');assert(near.storageRead('factory:record:'+id)===null&&near.storageRead('factory:child:'+intent.child)===null,'request or child already reserved');const r:RecordEntry={...intent,phase:'creating',create_attempt:1,refund_attempt:0,created_at:(near.blockTimestamp()/1000000000n).toString(),updated_at:'',last_result:'pending_or_unknown'};this.save(r);near.storageWrite('factory:child:'+r.child,id);near.storageWrite('factory:index:'+this.count,id);this.count++;this.add('storage_collected',amount(r.storage));this.add('accepted_backing',amount(r.backing));this.add('creation_pending',amount(r.backing));this.solvent();return this.dispatch(r);
 }
 @call({privateFunction:true}) on_created({id,attempt}:{id:string;attempt:number}){this.noDeposit();assert(near.promiseResultsCount()===1n,'one callback result required');const r=this.get(id);assert(r.phase==='creating'&&r.create_attempt===attempt,'stale creation callback');let ok=true;try{near.promiseResult(0n);}catch(_){ok=false;}this.add('creation_pending',-amount(r.backing));this.add(ok?'deployed_backing':'refundable_backing',amount(r.backing));r.phase=ok?'active':'create_failed';r.last_result=ok?'atomic_batch_succeeded':'atomic_batch_failed_return_may_be_pending';this.save(r);this.conservation();return this.record({id});}
 @call({}) retry_create({id,approved_request_hash,approved_key_hex,custody_ack}:{id:string;approved_request_hash:string;approved_key_hex:string;custody_ack:string}){this.noDeposit();const actor=this.direct();assert(!this.frozen,'factory frozen');const r=this.get(id);assert(actor===r.creator&&r.phase==='create_failed'&&r.create_attempt<MAX_ATTEMPTS,'known creation failure and original creator required');assert(this.serviceAllows(r.config,true),'worker service offline or mismatched');assert(near.prepaidGas()>=CREATE_GAS,'insufficient creation gas');assert(approved_request_hash===r.request_hash&&approved_key_hex===r.owner_key_hex,'original immutable intent and key required');this.custody(r.owner_key_hex,custody_ack);this.solvent();this.add('refundable_backing',-amount(r.backing));this.add('creation_pending',amount(r.backing));r.phase='creating';r.create_attempt++;r.last_result='pending_or_unknown';this.save(r);this.conservation();return this.dispatch(r);}
 private refund(r:RecordEntry){assert(near.prepaidGas()>=REFUND_GAS,'insufficient refund gas');assert(r.refund_attempt<MAX_ATTEMPTS,'refund attempts exhausted');this.solvent();this.add('refundable_backing',-amount(r.backing));this.add('refund_pending',amount(r.backing));r.phase='refunding';r.refund_attempt++;r.last_result='pending_or_unknown';this.save(r);return NearPromise.new(r.creator).transfer(amount(r.backing)).then(NearPromise.new(near.currentAccountId()).functionCall('on_refunded',JSON.stringify({id:r.id,attempt:r.refund_attempt}),0n,CALLBACK_GAS));}
 @call({}) claim_refund({id}:{id:string}){this.noDeposit();const actor=this.direct(),r=this.get(id);assert(actor===r.creator&&r.phase==='create_failed','known creation failure and original creator required');return this.refund(r);}
 @call({}) retry_refund({id}:{id:string}){this.noDeposit();const actor=this.direct(),r=this.get(id);assert(actor===r.creator&&r.phase==='refund_failed','known refund failure and original creator required');return this.refund(r);}
 @call({privateFunction:true}) on_refunded({id,attempt}:{id:string;attempt:number}){this.noDeposit();assert(near.promiseResultsCount()===1n,'one callback result required');const r=this.get(id);assert(r.phase==='refunding'&&r.refund_attempt===attempt,'stale refund callback');let ok=true;try{near.promiseResult(0n);}catch(_){ok=false;}this.add('refund_pending',-amount(r.backing));this.add(ok?'refunded_backing':'refundable_backing',amount(r.backing));r.phase=ok?'refunded':'refund_failed';r.last_result=ok?'original_creator_transfer_succeeded':'original_creator_transfer_failed_return_may_be_pending';this.save(r);this.conservation();return this.record({id});}
 @call({}) set_freeze({frozen}:{frozen:boolean}){this.noDeposit();assert(near.predecessorAccountId()===this.owner&&typeof frozen==='boolean','factory owner only');this.frozen=frozen;}
}
