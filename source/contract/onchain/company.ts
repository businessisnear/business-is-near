import { NearBindgen, near, call, view, initialize, assert, NearPromise, validateAccountId } from 'near-sdk-js';

// Experimental NEAR treasury used by the local sandbox demo; not audited for deployment.
// All token quantities are decimal yoctoNEAR strings; customer data stays off chain.
type Work = { kind:string; job_id:string; scope_hash:string; encrypted_scope:string; status:string; reason:string; evidence_hash:string; encrypted_evidence:string; attested_by:string; worker_sealed_key?:string; worker_key_id?:string; execution_profile_version?:number; operation?:string; approved_by?:string; dependencies?:string[]; not_before?:string; mandate_id?:string; mandate_run?:number; mandate_role?:string; selected_template?:number; inbox_id?:string; customer_id?:string };
type OperationTemplate = {operation:string;scope_hash:string;encrypted_scope:string;worker_sealed_key:string};
const OPERATIONS=['strategy_plan','research_summary','website_build','content_draft','support_draft','outreach_draft','social_draft','ads_draft','analytics_report','engineering_patch'];
type Job = { customer: string; deposit: string; storage_contribution:string; supplier: string; fee: string; status: string; day: string; storage_breakdown?:{job:string;task:string;backing:string} };
const n = (v: string) => { assert(typeof v === 'string' && v.length<=39 && /^(0|[1-9][0-9]*)$/.test(v), 'invalid amount'); const x=BigInt(v); assert(x<=(1n<<128n)-1n,'amount exceeds u128'); return x; };
const s = (v: bigint) => v.toString();
// Public SPKI delimiters are protocol labels, not key material.
const publicPemBoundary = (edge:string) => '-'.repeat(5)+edge+' PUBLIC KEY'+'-'.repeat(5);
const publicPemPattern = new RegExp('^'+publicPemBoundary('BEGIN')+'\\n[A-Za-z0-9+/=\\n]+'+publicPemBoundary('END')+'\\n?$');

@NearBindgen({ requireInit: true })
class Treasury {
  owner = ''; operator = ''; supplier = ''; price = '0'; fee = '0'; reserve = '0'; perJob = '0'; daily = '0';
  frozen = false; cash = '0'; escrow = '0'; committed = '0'; revenue = '0'; paid = '0';
  withdrawing = '0'; withdrawn = '0';
  day_current=''; day_spent='0'; job_count=0; funding_count=0; funded='0'; backing_count=0; backing_funded='0'; customer_storage_collected='0';
  // Bounded company-control state. Work records use separate prefixed storage.
  company_idea_hash=''; company_goal_hash=''; company_encrypted_idea=''; company_encrypted_goal='';
  company_storage='0'; company_blocks=0; company_storage_ops=0; company_sequence=0; company_total=0; company_ids:string[]=[];
  company_events:Array<{seq:number;task_id:string;type:string}>=[];
  private event(task_id:string,type:string) {
    assert(Number.isSafeInteger(this.company_sequence) && this.company_sequence<Number.MAX_SAFE_INTEGER,'event sequence exhausted');
    this.company_sequence += 1; this.company_events.push({seq:this.company_sequence,task_id,type});
    if(this.company_events.length>64) this.company_events.shift();
    near.log(JSON.stringify({standard:'proofwork',version:'1.0.0',event:type,data:{seq:this.company_sequence,task_id}}));
  }
  private enabled() { assert(this.company_blocks>0 && n(this.company_storage)>=near.storageByteCost()*65536n*BigInt(this.company_blocks),'company storage reserve required'); }
  private ownerOrOperator() { const p=near.predecessorAccountId(); assert(p===this.owner || p===this.operator,'owner or operator only'); }
  private task(id:string):Work|null { const raw=near.storageRead('company:task:'+id); return raw===null ? null : JSON.parse(raw) as Work; }
  private saveTask(id:string,t:Work) { near.storageWrite('company:task:'+id,JSON.stringify(t)); }
  private getJob(id:string):Job|null { const raw=near.storageRead('treasury:job:'+id); return raw===null ? null : JSON.parse(raw) as Job; }
  private saveJob(id:string,j:Job) { near.storageWrite('treasury:job:'+id,JSON.stringify(j)); }
  private getFunding(id:string):string|null { return near.storageRead('treasury:funding:'+id); }
  private appendIndex(prefix:string,index:number,id:string) { assert(Number.isSafeInteger(index) && index<Number.MAX_SAFE_INTEGER,'index exhausted'); near.storageWrite(prefix+String(index),id); }
  // Syntax and hash validation only: chain cannot prove ciphertext is authentic encryption.
  private envelope(value:string,expected_hash:string) {
    this.hash(expected_hash);
    assert(typeof value==='string' && value.length>=100 && value.length<=8192,'invalid encrypted envelope size');
    for(let i=0;i<value.length;i++) { const c=value.charCodeAt(i); assert(c>=32 && c<=126,'encrypted envelope must be ASCII JSON'); }
    let obj:any; try { obj=JSON.parse(value); } catch (_) { assert(false,'invalid encrypted envelope JSON'); }
    assert(obj && typeof obj==='object' && !Array.isArray(obj),'invalid encrypted envelope');
    const keys=Object.keys(obj).sort().join(','); assert(keys==='alg,ciphertext,iterations,iv,kdf,salt,v','invalid encrypted envelope fields');
    assert(obj.v===1 && obj.alg==='AES-256-GCM' && obj.kdf==='PBKDF2-SHA256' && obj.iterations===600000,'unsupported encryption parameters');
    assert(typeof obj.salt==='string' && /^[A-Za-z0-9+/]{22}==$/.test(obj.salt),'invalid encryption salt');
    assert(typeof obj.iv==='string' && /^[A-Za-z0-9+/]{16}$/.test(obj.iv),'invalid encryption IV');
    assert(typeof obj.ciphertext==='string' && obj.ciphertext.length>=24 && obj.ciphertext.length%4===0 && /^[A-Za-z0-9+/]*={0,2}$/.test(obj.ciphertext),'invalid ciphertext');
    const bytes=new Uint8Array(value.length); for(let i=0;i<value.length;i++) bytes[i]=value.charCodeAt(i);
    const actual=Array.from(near.sha256(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
    assert(actual===expected_hash,'ciphertext hash mismatch');
  }
  private hash(h:string) { assert(typeof h==='string' && /^[0-9a-f]{64}$/.test(h),'expected lowercase SHA-256'); }
  // Conservatively reserve the entire controller allocation PLUS all current
  // chain storage and a 64KiB mutation cushion outside cash and customer escrow.
  // This double-counts some storage deliberately; insufficient separate deployment
  // backing fails closed rather than consuming operating liabilities or reserve.
  private solvent() {
    const backing=(near.storageUsage()+65536n)*near.storageByteCost();
    assert(near.accountBalance()>=n(this.cash)+n(this.escrow)+n(this.company_storage)+backing,'insufficient separate storage backing');
  }
  private ownerOnly() { assert(near.predecessorAccountId() === this.owner, 'owner only'); }
  private operatorOnly() { assert(near.predecessorAccountId() === this.operator, 'operator only'); }
  private live() { assert(!this.frozen, 'business frozen'); }
  private id(id: string) { assert(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !['__proto__','prototype','constructor'].includes(id), 'invalid job id'); }
  // AI credits are provider-denominated estimates, not NEAR treasury cash.
  // Prefix storage avoids changing the serialized root of existing deployments.
  private aiState():any { const v=near.storageRead('ai:policy'); return v===null?{version:0,enabled:false,scope_consent:false,selected_model:'economy',allow_economy:false,allow_expensive:false,per_call_nanos:'0',daily_nanos:'0',lifetime_nanos:'0',max_input_tokens:0,max_output_tokens:0,max_calls_per_job:0,max_calls_per_day:0,count:0,lifetime_reserved:'0'}:JSON.parse(v); }
  @view({}) ai_policy() { return this.aiState(); }
  @view({}) ai_call({id}:{id:string}) { this.id(id); const v=near.storageRead('ai:call:'+id); return v===null?null:JSON.parse(v); }
  @call({}) ai_set_policy({enabled,scope_consent,selected_model,allow_economy,allow_expensive,per_call_nanos,daily_nanos,lifetime_nanos,max_input_tokens,max_output_tokens,max_calls_per_job,max_calls_per_day}:{enabled:boolean,scope_consent:boolean,selected_model:string,allow_economy:boolean,allow_expensive:boolean,per_call_nanos:string,daily_nanos:string,lifetime_nanos:string,max_input_tokens:number,max_output_tokens:number,max_calls_per_job:number,max_calls_per_day:number}) {
    this.ownerOnly();
    for(const flag of [enabled,scope_consent,allow_economy,allow_expensive]) assert(typeof flag==='boolean','boolean required');
    assert(selected_model==='economy' || selected_model==='expensive','invalid AI selection');
    assert(!enabled || scope_consent && (selected_model==='economy' && allow_economy || selected_model==='expensive' && allow_expensive),'explicit scope consent and selected model required');
    assert(n(per_call_nanos)>0n && n(per_call_nanos)<=10000000n && n(daily_nanos)>0n && n(daily_nanos)<=20000000n && n(lifetime_nanos)>0n && n(lifetime_nanos)<=50000000n,'AI cap exceeds ceiling');
    for(const [v,max] of [[max_input_tokens,4608],[max_output_tokens,512],[max_calls_per_job,2],[max_calls_per_day,4]]) assert(Number.isSafeInteger(v) && v>=1 && v<=max,'invalid AI limit');
    const old=this.aiState(); assert(old.version<1000000,'AI policy version exhausted');
    near.storageWrite('ai:policy',JSON.stringify({version:old.version+1,enabled,scope_consent,selected_model,allow_economy,allow_expensive,per_call_nanos,daily_nanos,lifetime_nanos,max_input_tokens,max_output_tokens,max_calls_per_job,max_calls_per_day,count:old.count,lifetime_reserved:old.lifetime_reserved}));this.solvent();
  }
  @call({}) ai_reserve_call({id,job_id,model,policy_version,prompt_hash,input_tokens,output_tokens}:{id:string,job_id:string,model:string,policy_version:number,prompt_hash:string,input_tokens:number,output_tokens:number}) {
    this.operatorOnly();this.live();this.id(id);this.id(job_id);this.hash(prompt_hash);
    const p=this.aiState();assert(p.enabled && p.scope_consent && policy_version===p.version,'AI policy disabled or changed');
    assert(model===p.selected_model && (model==='economy' && p.allow_economy || model==='expensive' && p.allow_expensive),'AI model not allowed');
    assert(Number.isSafeInteger(input_tokens) && input_tokens>=1 && input_tokens<=p.max_input_tokens && Number.isSafeInteger(output_tokens) && output_tokens>=1 && output_tokens<=p.max_output_tokens,'AI token limit');
    const old=this.ai_call({id}); if(old) { assert(old.job_id===job_id && old.model===model && old.policy_version===policy_version && old.prompt_hash===prompt_hash && old.input_tokens===input_tokens && old.output_tokens===output_tokens,'AI call ID conflict'); return old; }
    assert(this.ai_media_call({id})===null,'AI call family conflict');
    // New provider authorization belongs to a linked customer-funded QA job
    // or a specifically owner-approved operation, never an operator alias.
    // Old matching reservations remain readable
    // above so a terminal transition never authorizes a second provider call.
    const operation=this.task(job_id);
    if(operation && operation.operation) {
      assert(operation.kind==='general' && operation.approved_by===this.owner && OPERATIONS.includes(operation.operation),'owner-approved operation required');
      this.operationLive(operation);
      assert(operation.status==='awaiting_evidence','AI operation not active');
    } else {
      const job=this.getJob(job_id),task_id=near.storageRead('company:job:'+job_id);
      assert(job && task_id!==null,'linked QA job required');
      const task=this.task(task_id);assert(task && task.kind==='qa' && task.job_id===job_id,'linked QA job required');
      assert(job.status==='escrowed' && task.status==='pending_review' || job.status==='accepted' && task.status==='hired','AI job not active');
    }
    assert(p.count<100,'AI lifetime record capacity exhausted');
    const cost=BigInt(input_tokens)*BigInt(model==='economy'?150:440)+BigInt(output_tokens)*BigInt(model==='economy'?550:3300);
    // Retain the historical hashed counter key across upgrades; actual job IDs
    // are already public, while earlier clients submitted SHA-256(job_id).
    const jobBytes=new Uint8Array(job_id.length);for(let i=0;i<job_id.length;i++)jobBytes[i]=job_id.charCodeAt(i);
    const counterJobId=Array.from(near.sha256(jobBytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
    const day=s(near.blockTimestamp()/86400000000000n);const dayKey='ai:day:'+day,jobKey='ai:job:'+counterJobId;
    const dayRecord=JSON.parse(near.storageRead(dayKey)||'{"count":0,"reserved":"0"}');const jobCount=Number(near.storageRead(jobKey)||'0');
    assert(cost<=n(p.per_call_nanos) && n(p.lifetime_reserved)+cost<=n(p.lifetime_nanos) && n(dayRecord.reserved)+cost<=n(p.daily_nanos),'AI reservation exceeds cap');
    assert(dayRecord.count<p.max_calls_per_day && jobCount<p.max_calls_per_job,'AI call count exceeded');
    const record={id,job_id,model,policy_version,prompt_hash,input_tokens,output_tokens,reserved_nanos:s(cost),day,status:'reserved',output_hash:''};
    near.storageWrite('ai:call:'+id,JSON.stringify(record));near.storageWrite(dayKey,JSON.stringify({count:dayRecord.count+1,reserved:s(n(dayRecord.reserved)+cost)}));near.storageWrite(jobKey,String(jobCount+1));p.count+=1;p.lifetime_reserved=s(n(p.lifetime_reserved)+cost);near.storageWrite('ai:policy',JSON.stringify(p));this.solvent();return record;
  }
  @call({}) ai_complete_call({id,output_hash}:{id:string,output_hash:string}) {
    this.operatorOnly();this.id(id);this.hash(output_hash);const record=this.ai_call({id});assert(record!==null,'AI call missing');
    if(record.status==='completed') { assert(record.output_hash===output_hash,'AI output conflict');return record; }
    record.status='completed';record.output_hash=output_hash;near.storageWrite('ai:call:'+id,JSON.stringify(record));this.solvent();return record;
  }
  // Media is a separate explicit owner grant. Text's 4608-token ceiling and
  // all shared count/USD reservation caps remain unchanged.
  private mediaPolicy():any { const v=near.storageRead('ai:media:policy');return v===null?{version:0,vision_enabled:false,audio_enabled:false,audio_reserve_nanos:'0'}:JSON.parse(v); }
  @view({}) ai_media_policy() { return {...this.mediaPolicy(),vision_model:'Qwen/Qwen3-VL-30B-A3B-Instruct',vision_input_limit:16384,audio_model:'openai/whisper-large-v3',audio_seconds_limit:6,shared_company_counters:true,provider_billing_verified:false}; }
  @view({}) ai_media_call({id}:{id:string}) {this.id(id);const v=near.storageRead('ai:media:call:'+id);return v===null?null:JSON.parse(v);}
  @call({}) ai_set_media_policy({vision_enabled,audio_enabled,audio_reserve_nanos}:{vision_enabled:boolean,audio_enabled:boolean,audio_reserve_nanos:string}) {
    this.ownerOnly();assert(typeof vision_enabled==='boolean' && typeof audio_enabled==='boolean','explicit media consent required');
    const p=this.aiState(),old=this.mediaPolicy(),amount=n(audio_reserve_nanos);
    assert(p.version>0 && old.version<1000000,'configure base AI policy first');
    assert(amount<=n(p.per_call_nanos) && (!audio_enabled || amount>0n),'audio reservation exceeds owner cap');
    const visionCost=16384n*150n+BigInt(p.max_output_tokens)*550n;
    assert(!vision_enabled || p.allow_economy && visionCost<=n(p.per_call_nanos),'vision reservation exceeds owner cap');
    near.storageWrite('ai:media:policy',JSON.stringify({version:old.version+1,vision_enabled,audio_enabled,audio_reserve_nanos}));this.solvent();
  }
  @call({}) ai_reserve_media_call({id,job_id,kind,policy_version,media_policy_version,prompt_hash,asset_commitment}:{id:string,job_id:string,kind:string,policy_version:number,media_policy_version:number,prompt_hash:string,asset_commitment:string}) {
    this.operatorOnly();this.live();this.id(id);this.id(job_id);this.hash(prompt_hash);this.hash(asset_commitment);
    const p=this.aiState(),m=this.mediaPolicy();
    assert(p.enabled && p.scope_consent && policy_version===p.version && media_policy_version===m.version,'media policy disabled or changed');
    assert(kind==='vision' && m.vision_enabled && p.allow_economy || kind==='audio' && m.audio_enabled,'media kind not approved');
    const prior=this.ai_media_call({id});
    if(prior){assert(prior.job_id===job_id && prior.kind===kind && prior.policy_version===policy_version && prior.media_policy_version===media_policy_version && prior.prompt_hash===prompt_hash && prior.asset_commitment===asset_commitment,'media call ID conflict');return prior;}
    assert(this.ai_call({id})===null,'call ID already belongs to text');
    const task=this.task(job_id);assert(task && task.kind==='general' && task.operation==='research_summary' && task.approved_by===this.owner,'owner-approved media operation required');
    this.operationLive(task);assert(task.status==='awaiting_evidence','media operation not active');
    assert(p.count<100,'AI lifetime record capacity exhausted');
    const cost=kind==='vision'?16384n*150n+BigInt(p.max_output_tokens)*550n:n(m.audio_reserve_nanos);
    assert(cost>0n,'positive media reservation required');
    const jobBytes=new Uint8Array(job_id.length);for(let i=0;i<job_id.length;i++)jobBytes[i]=job_id.charCodeAt(i);
    const counterJobId=Array.from(near.sha256(jobBytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
    const day=s(near.blockTimestamp()/86400000000000n),dayKey='ai:day:'+day,jobKey='ai:job:'+counterJobId;
    const daily=JSON.parse(near.storageRead(dayKey)||'{"count":0,"reserved":"0"}'),jobCount=Number(near.storageRead(jobKey)||'0');
    assert(cost<=n(p.per_call_nanos) && n(p.lifetime_reserved)+cost<=n(p.lifetime_nanos) && n(daily.reserved)+cost<=n(p.daily_nanos),'media reservation exceeds shared AI cap');
    assert(daily.count<p.max_calls_per_day && jobCount<p.max_calls_per_job,'shared AI call count exceeded');
    const record={id,job_id,kind,policy_version,media_policy_version,prompt_hash,asset_commitment,model:kind==='vision'?'Qwen/Qwen3-VL-30B-A3B-Instruct':'openai/whisper-large-v3',input_unit:kind==='vision'?'tokens':'seconds',input_limit:kind==='vision'?16384:6,output_limit:kind==='vision'?p.max_output_tokens:0,reserved_nanos:s(cost),day,status:'reserved',output_hash:''};
    near.storageWrite('ai:media:call:'+id,JSON.stringify(record));near.storageWrite(dayKey,JSON.stringify({count:daily.count+1,reserved:s(n(daily.reserved)+cost)}));near.storageWrite(jobKey,String(jobCount+1));p.count++;p.lifetime_reserved=s(n(p.lifetime_reserved)+cost);near.storageWrite('ai:policy',JSON.stringify(p));this.solvent();return record;
  }
  @call({}) ai_complete_media_call({id,output_hash}:{id:string,output_hash:string}) {
    this.operatorOnly();this.id(id);this.hash(output_hash);const record=this.ai_media_call({id});assert(record!==null,'media call missing');
    if(record.status==='completed'){assert(record.output_hash===output_hash,'media output conflict');return record;}
    record.status='completed';record.output_hash=output_hash;near.storageWrite('ai:media:call:'+id,JSON.stringify(record));this.solvent();return record;
  }
  @initialize({})
  init({operator, supplier, price, fee, reserve, perJob, daily, factory_owner}: {operator:string,supplier:string,price:string,fee:string,reserve:string,perJob:string,daily:string,factory_owner?:string}) {
    const predecessor=near.predecessorAccountId(); let actualOwner=predecessor;
    if(factory_owner!==undefined) {
      assert(typeof factory_owner==='string' && validateAccountId(factory_owner), 'invalid factory owner');
      assert(factory_owner===near.signerAccountId() && factory_owner!==predecessor, 'originating factory owner required');
      actualOwner=factory_owner;
    }
    assert(typeof operator === 'string' && validateAccountId(operator) && operator !== actualOwner, 'operator must differ from owner');
    this.owner = predecessor; this.operator=operator; this.set_policy({supplier,price,fee,reserve,perJob,daily});
    this.owner=actualOwner;
  }
  @call({})
  set_policy({supplier,price,fee,reserve,perJob,daily}: {supplier:string,price:string,fee:string,reserve:string,perJob:string,daily:string}) {
    this.ownerOnly(); assert(typeof supplier === 'string' && validateAccountId(supplier), 'valid supplier required');
    for (const x of [price,fee,reserve,perJob,daily]) n(x);
    assert(n(price)>0n && n(fee)>0n && n(fee)<=n(perJob), 'invalid economics');
    assert(n(reserve)+n(this.committed)+n(this.withdrawing)<=n(this.cash) || n(this.cash)===0n && n(this.committed)===0n, 'reserve exceeds funds');
    this.supplier=supplier; this.price=price; this.fee=fee; this.reserve=reserve; this.perJob=perJob; this.daily=daily; this.solvent();
  }
  @call({}) set_freeze({frozen}: {frozen:boolean}) { this.ownerOnly(); assert(typeof frozen === 'boolean', 'boolean required'); this.frozen=frozen; }
  @call({}) company_set_operator({operator,expected_operator}:{operator:string,expected_operator:string}) {
    this.ownerOnly();assert(near.attachedDeposit()===0n,'operator rotation takes no deposit');
    assert(this.frozen && this.company_ids.length===0,'freeze and archive active tasks before operator rotation');
    assert(n(this.escrow)===0n && n(this.committed)===0n && n(this.withdrawing)===0n,'resolve escrow and pending treasury transfers before operator rotation');
    assert(expected_operator===this.operator,'operator approval is stale');
    assert(typeof operator==='string' && validateAccountId(operator) && operator!==this.owner && operator!==this.operator,'distinct valid operator required');
    const previous=this.operator;this.operator=operator;this.solvent();
    near.log(JSON.stringify({standard:'proofwork',version:'1.0.0',event:'operator_changed',data:{previous,operator,owner:this.owner}}));
    return {previous,operator,owner:this.owner,frozen:this.frozen};
  }
  @call({payableFunction:true}) fund({id}: {id?:string}) {
    this.ownerOnly(); const v=near.attachedDeposit(); assert(v>0n, 'deposit required');
    if(id!==undefined) { this.id(id); assert(this.getFunding(id)===null,'duplicate funding');
      this.appendIndex('treasury:fund-index:',this.funding_count,id); this.funding_count+=1; near.storageWrite('treasury:funding:'+id,s(v)); }
    this.cash=s(n(this.cash)+v); this.funded=s(n(this.funded)+v); this.solvent();
  }
  // Separate, owner-funded account/storage backing; never classified as cash or revenue.
  @call({payableFunction:true}) fund_backing({id}:{id:string}) {
    this.ownerOnly(); this.id(id); const value=near.attachedDeposit(); assert(value>0n,'deposit required');
    assert(near.storageRead('treasury:backing:'+id)===null,'duplicate backing funding');
    this.appendIndex('treasury:backing-index:',this.backing_count,id); this.backing_count+=1;
    near.storageWrite('treasury:backing:'+id,s(value)); this.backing_funded=s(n(this.backing_funded)+value); this.solvent();
  }
  private recordOrder(id:string,storage:bigint,breakdown?:{job:string;task:string;backing:string}) {
    this.live();this.id(id);assert(this.getJob(id)===null,'duplicate job');
    assert(!this.task(id)?.operation,'ID belongs to an operation');
    assert(near.attachedDeposit()===n(this.price)+storage,'exact service price plus storage contribution required');
    this.appendIndex('treasury:job-index:',this.job_count,id);this.job_count+=1;
    const job:Job={customer:near.predecessorAccountId(),deposit:this.price,storage_contribution:s(storage),supplier:'',fee:'0',status:'escrowed',day:''};if(breakdown)job.storage_breakdown=breakdown;
    this.saveJob(id,job);this.escrow=s(n(this.escrow)+n(this.price));this.customer_storage_collected=s(n(this.customer_storage_collected)+storage);this.solvent();
  }
  @call({payableFunction:true}) order({id}:{id:string}) {this.recordOrder(id,near.storageByteCost()*2048n);}
  // V2 requires explicitly queued company work; the legacy direct acceptance path is disabled.
  @call({}) accept({id}: {id:string}) {
    this.operatorOnly(); this.id(id); assert(false,'use company_submit and company_tick');
  }
  // Refunds and cancellations stay pending until callbacks; never retry an uncertain transfer.
  @call({}) refund({id}: {id:string}) {
    this.id(id); const j=this.getJob(id); assert(j && j.status==='escrowed','not refundable');
    assert(near.predecessorAccountId()===j.customer,'customer only'); j.status='refunding'; this.saveJob(id,j); this.solvent();
    return NearPromise.new(j.customer).transfer(n(j.deposit)).then(NearPromise.new(near.currentAccountId()).functionCall('on_refund',JSON.stringify({id}),0n,50000000000000n));
  }
  @call({}) cancel({id}: {id:string}) {
    this.id(id); const j=this.getJob(id); assert(j && j.status==='accepted','not cancellable');
    const actor=near.predecessorAccountId(); assert(actor===this.owner || actor===this.operator,'owner or operator only');
    j.status='cancelling'; this.saveJob(id,j); this.solvent();
    return NearPromise.new(j.customer).transfer(n(j.deposit)).then(NearPromise.new(near.currentAccountId()).functionCall('on_refund',JSON.stringify({id}),0n,50000000000000n));
  }
  @call({privateFunction:true}) on_refund({id}: {id:string}) {
    this.id(id); const j=this.getJob(id); assert(j && (j.status==='refunding' || j.status==='cancelling'),'not pending');
    const cancelling=j.status==='cancelling'; let succeeded=true;
    try { near.promiseResult(0n); } catch (_) { succeeded=false; }
    if(succeeded) {
      j.status='refunded'; this.escrow=s(n(this.escrow)-n(j.deposit));
      if(cancelling) { this.committed=s(n(this.committed)-n(j.fee)); if(j.day===this.day_current) this.day_spent=s(n(this.day_spent)-n(j.fee)); }
    } else j.status=cancelling ? 'accepted' : 'escrowed';
    this.saveJob(id,j); this.solvent();
  }
  // Evidence is an authorized off-chain attestation, not on-chain verification of reality.
  @call({}) settle({id}: {id:string}) {
    this.operatorOnly(); this.live(); this.id(id); const j=this.getJob(id); assert(j && j.status==='accepted','job not accepted');
    const task_id=near.storageRead('company:job:'+id); assert(task_id!==null,'job not linked to company work');
    const work=this.task(task_id); assert(work && work.kind==='qa' && work.job_id===id && work.status==='attested','work evidence not attested');
    j.status='settled'; this.saveJob(id,j); this.escrow=s(n(this.escrow)-n(j.deposit)); this.cash=s(n(this.cash)+n(j.deposit)); this.revenue=s(n(this.revenue)+n(j.deposit)); this.solvent();
  }
  @call({}) pay({id}: {id:string}) {
    this.operatorOnly(); this.live(); this.id(id); const j=this.getJob(id); assert(j && j.status==='settled','not payable');
    assert(n(this.cash)>=n(this.reserve)+n(this.committed)+n(this.withdrawing),'reserve breach'); j.status='paying'; this.saveJob(id,j); this.solvent();
    return NearPromise.new(j.supplier).transfer(n(j.fee)).then(NearPromise.new(near.currentAccountId()).functionCall('on_paid',JSON.stringify({id}),0n,50000000000000n));
  }
  @call({privateFunction:true}) on_paid({id}: {id:string}) {
    this.id(id); const j=this.getJob(id); assert(j && j.status==='paying','not pending'); let succeeded=true;
    try { near.promiseResult(0n); } catch (_) { succeeded=false; }
    if(succeeded) { j.status='paid'; this.cash=s(n(this.cash)-n(j.fee)); this.committed=s(n(this.committed)-n(j.fee)); this.paid=s(n(this.paid)+n(j.fee)); }
    else j.status='settled';
    this.saveJob(id,j); this.solvent();
  }
  // Owner-only withdrawal to owner account; no recipient comes from the operator or untrusted output.
  @call({}) withdraw({amount}: {amount:string}) {
    this.ownerOnly(); const value=n(amount); assert(value>0n, 'amount required'); assert(n(this.withdrawing)===0n, 'withdrawal pending');
    assert(n(this.cash)>=n(this.reserve)+n(this.committed)+value, 'insufficient free cash');
    this.withdrawing=s(value); this.solvent();
    return NearPromise.new(this.owner).transfer(value).then(NearPromise.new(near.currentAccountId()).functionCall('on_withdraw', JSON.stringify({amount}), 0n, 50000000000000n));
  }
  @call({privateFunction:true}) on_withdraw({amount}: {amount:string}) {
    const value=n(amount); assert(n(this.withdrawing)===value && value>0n, 'not pending');
    let succeeded=true; try { near.promiseResult(0n); } catch (_) { succeeded=false; }
    if(succeeded) { this.cash=s(n(this.cash)-value); this.withdrawn=s(n(this.withdrawn)+value); }
    this.withdrawing='0'; this.solvent();
  }
  // Private records are AES-GCM envelope strings supplied by the owner. The
  // contract checks only envelope format and ciphertext hash, not key secrecy.
  // 64 KiB per block covers bounded metadata and one permanent task record;
  // company storage is non-withdrawable and separate from treasury cash.
  @call({payableFunction:true})
  company_set({idea_hash,goal_hash,encrypted_idea,encrypted_goal,public_idea='',public_goal=''}:{idea_hash:string,goal_hash:string,encrypted_idea:string,encrypted_goal:string,public_idea?:string,public_goal?:string}) {
    this.ownerOnly(); assert(public_idea==='' && public_goal==='','public plaintext is disabled');
    this.envelope(encrypted_idea,idea_hash); this.envelope(encrypted_goal,goal_hash);
    const need=near.storageByteCost()*65536n, deposit=near.attachedDeposit();
    if(n(this.company_storage)===0n) { assert(deposit===need,'exact company storage reserve required'); this.company_storage=s(deposit); this.company_blocks=1; }
    else { assert(deposit===0n,'unexpected storage deposit'); this.enabled(); }
    this.company_idea_hash=idea_hash; this.company_goal_hash=goal_hash;
    this.company_encrypted_idea=encrypted_idea; this.company_encrypted_goal=encrypted_goal; this.event('','configured'); this.solvent();
  }
  // Expand capacity by one permanent encrypted task record per pre-funded 64 KiB reserve block.
  // blocks=0 permits the owner to cover a future storage-byte-cost increase.
  @call({payableFunction:true})
  company_fund_storage({blocks,id}:{blocks:number,id:string}) {
    this.ownerOnly(); this.id(id); assert(near.storageRead('company:storage:'+id)===null,'duplicate storage funding');
    assert(this.company_blocks>0,'configure company first');
    assert(Number.isSafeInteger(blocks) && blocks>=0 && blocks<=32,'invalid block count');
    const next=this.company_blocks+blocks; assert(Number.isSafeInteger(next) && next<=1000000,'storage block maximum');
    const required=near.storageByteCost()*65536n*BigInt(next), current=n(this.company_storage);
    const delta=required>current ? required-current : 0n;
    assert(blocks>0 || delta>0n,'no storage increase');
    assert(near.attachedDeposit()===delta,'exact storage reserve required');
    assert(this.company_storage_ops<32*next,'storage operation capacity exhausted');
    near.storageWrite('company:storage:'+id,JSON.stringify({blocks,amount:s(delta)})); this.company_storage_ops+=1;
    this.company_storage=s(current+delta); this.company_blocks=next; this.event('','storage_funded'); this.solvent();
  }
  private sealedKey(value:string) { assert(typeof value==='string' && /^[A-Za-z0-9+/]{683}=$/.test(value),'expected RSA-4096 base64 sealed key'); }
  @view({}) execution_profile({version}:{version?:number}={}) {if(version!==undefined)assert(Number.isSafeInteger(version) && version>=1 && version<=64,'invalid profile version');const value=near.storageRead(version===undefined?'company:execution-profile':'company:execution-profile:'+String(version));return value===null?null:JSON.parse(value);}
  @call({}) set_execution_profile({worker_public_key,worker_key_id,mission_sealed_key,profile,target_origin}:{worker_public_key:string,worker_key_id:string,mission_sealed_key:string,profile:string,target_origin:string}) {
    this.ownerOnly();this.hash(worker_key_id);this.sealedKey(mission_sealed_key);
    assert(profile==='website-qa-v1' || profile==='business-operations-v1','unsupported execution profile');
    assert(typeof worker_public_key==='string' && worker_public_key.length>=400 && worker_public_key.length<=2048 && publicPemPattern.test(worker_public_key),'invalid public key');
    const bytes=new Uint8Array(worker_public_key.length);for(let i=0;i<worker_public_key.length;i++)bytes[i]=worker_public_key.charCodeAt(i);
    assert(Array.from(near.sha256(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('')===worker_key_id,'worker key hash mismatch');
    assert(profile==='business-operations-v1' ? target_origin==='' : typeof target_origin==='string' && target_origin.length<=200 && (/^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]{1,5})?\/(?:[a-zA-Z0-9_-]+\/)*$/.test(target_origin) || target_origin==='http://127.0.0.1:8788/'),'invalid target origin');
    assert(this.company_idea_hash!=='' && this.company_goal_hash!=='' && this.company_encrypted_idea!=='' && this.company_encrypted_goal!=='','configure encrypted mission first');
    const prev=this.execution_profile({});if(prev && prev.worker_key_id!==worker_key_id)assert(this.company_ids.length===0,'archive active tasks before worker key rotation');if(prev && prev.worker_public_key===worker_public_key && prev.worker_key_id===worker_key_id && prev.mission_sealed_key===mission_sealed_key && prev.profile===profile && prev.target_origin===target_origin && prev.idea_hash===this.company_idea_hash && prev.goal_hash===this.company_goal_hash && prev.encrypted_idea===this.company_encrypted_idea && prev.encrypted_goal===this.company_encrypted_goal)return prev;
    const version=prev?prev.version+1:1;assert(Number.isSafeInteger(version) && version<=64,'profile versions exhausted');
    const record={worker_public_key,worker_key_id,mission_sealed_key,profile,target_origin,version,idea_hash:this.company_idea_hash,goal_hash:this.company_goal_hash,encrypted_idea:this.company_encrypted_idea,encrypted_goal:this.company_encrypted_goal};near.storageWrite('company:execution-profile:'+String(version),JSON.stringify(record));near.storageWrite('company:execution-profile',JSON.stringify(record));this.solvent();return record;
  }
  private enqueueWork(id:string,kind:string,scope_hash:string,encrypted_scope:string,job_id:string,delegation?:{worker_sealed_key:string,worker_key_id:string,execution_profile_version:number}) {
    this.live(); this.enabled(); this.id(id); this.envelope(encrypted_scope,scope_hash);
    assert(kind==='general' || kind==='qa','unsupported task kind');
    assert(this.task(id)===null && near.storageRead('company:used:'+id)===null,'duplicate task');
    assert(this.company_total<this.company_blocks,'company storage capacity exhausted'); assert(this.company_ids.length<32,'company queue full');
    if(kind==='qa') {
      this.id(job_id); const j=this.getJob(job_id); assert(j && j.status==='escrowed','job must have customer escrow');
      assert(near.storageRead('company:job:'+job_id)===null,'job already queued');
      near.storageWrite('company:job:'+job_id,id);
    } else assert(job_id==='','general task cannot have a job');
    const work:Work={kind,job_id,scope_hash,encrypted_scope,status:delegation?'pending_review':'queued',reason:'',evidence_hash:'',encrypted_evidence:'',attested_by:''};
    if(delegation){work.worker_sealed_key=delegation.worker_sealed_key;work.worker_key_id=delegation.worker_key_id;work.execution_profile_version=delegation.execution_profile_version;}
    this.saveTask(id,work);
    near.storageWrite('company:used:'+id,'1'); this.appendIndex('company:history:',this.company_total,id); this.company_total+=1;
    this.company_ids.push(id); this.event(id,delegation?'pending_review':'queued'); this.solvent();
  }
  // Legacy owner/operator queue is retained for the local demo.
  @call({}) company_submit({id,kind,scope_hash,encrypted_scope,job_id=''}:{id:string,kind:string,scope_hash:string,encrypted_scope:string,job_id?:string}) {
    this.ownerOrOperator();this.enqueueWork(id,kind,scope_hash,encrypted_scope,job_id);
  }
  // Owner authorization is bound to one encrypted operation and pinned worker.
  // These operations produce private artifacts; they grant no external send,
  // deployment, arbitrary command, supplier payment or general transfer power.
  @call({}) company_submit_operation({id,operation,scope_hash,encrypted_scope,worker_sealed_key,worker_key_id,execution_profile_version,dependencies=[],not_before='0'}:{id:string,operation:string,scope_hash:string,encrypted_scope:string,worker_sealed_key:string,worker_key_id:string,execution_profile_version:number,dependencies?:string[],not_before?:string}) {
    this.ownerOnly();assert(OPERATIONS.includes(operation),'unsupported operation');
    assert(this.getJob(id)===null,'ID belongs to a customer job');
    const p=this.execution_profile({});assert(p && p.profile==='business-operations-v1' && p.version===execution_profile_version && p.worker_key_id===worker_key_id,'operation profile changed');
    this.sealedKey(worker_sealed_key);assert(n(not_before)<=18446744073n,'invalid schedule');
    assert(Array.isArray(dependencies) && dependencies.length<=4 && new Set(dependencies).size===dependencies.length,'invalid dependencies');
    for(const dependency of dependencies){this.id(dependency);const parent=this.task(dependency);assert(dependency!==id && parent && parent.operation,'existing operation dependency required');}
    this.enqueueWork(id,'general',scope_hash,encrypted_scope,'',{worker_sealed_key,worker_key_id,execution_profile_version});
    const task=this.task(id);task.operation=operation;task.approved_by=this.owner;task.dependencies=dependencies;task.not_before=not_before;task.status='queued';
    this.saveTask(id,task);this.event(id,'operation_authorized');this.solvent();
  }
  private operationWait(task:Work):string {
    if(!task.operation)return '';
    if(near.blockTimestamp()/1000000000n<n(task.not_before || '0'))return 'not_due';
    for(const id of task.dependencies || []){const parent=this.task(id);if(!parent || !['attested','archived'].includes(parent.status))return 'dependency';}
    return '';
  }
  private mandate(id:string):any {this.id(id);const raw=near.storageRead('company:mandate:'+id);return raw===null?null:JSON.parse(raw);}
  private saveMandate(m:any){near.storageWrite('company:mandate:'+m.id,JSON.stringify(m));}
  private operationLive(task:Work) {
    if(task.mandate_id){const m=this.mandate(task.mandate_id);assert(m && m.enabled && near.blockTimestamp()/1000000000n<n(m.expires_at),'mandate paused or expired');}
    if(task.inbox_id){const box=this.inbox(task.inbox_id);assert(box && box.enabled && near.blockTimestamp()/1000000000n<n(box.expires_at),'inbox paused or expired');}
  }
  private inbox(id:string):any {this.id(id);const raw=near.storageRead('company:inbox:'+id);return raw===null?null:JSON.parse(raw);}
  private saveInbox(box:any){near.storageWrite('company:inbox:'+box.id,JSON.stringify(box));}
  @view({}) company_inbox({id}:{id:string}) {const box=this.inbox(id);return box?{...box,observed_at:s(near.blockTimestamp()/1000000000n)}:null;}
  @view({}) company_inboxes() {const ids=JSON.parse(near.storageRead('company:inbox-ids') || '[]');return {items:ids.map((id:string)=>this.inbox(id))};}
  @view({}) company_inbox_messages({id,from_index=0,limit=10}:{id:string,from_index?:number,limit?:number}) {
    const box=this.inbox(id);assert(box,'unknown inbox');assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');
    const end=Math.min(box.messages,from_index+limit),items=[];for(let i=from_index;i<end;i++){const key=near.storageRead('company:inbox-message:'+id+':'+i);assert(key,'inbox index missing');items.push({id:key,...this.task(key)});}return {items,next_index:end<box.messages?end:null};
  }
  // Each grant authorizes one named customer and an immutable support policy.
  // It has no external channel, payment, transfer or arbitrary operation power.
  @call({}) company_create_inbox({id,customer_id,policy,worker_key_id,execution_profile_version,expires_at,max_messages,max_messages_per_day}:{id:string,customer_id:string,policy:OperationTemplate,worker_key_id:string,execution_profile_version:number,expires_at:string,max_messages:number,max_messages_per_day:number}) {
    this.ownerOnly();this.live();this.enabled();this.id(id);assert(id.length<=24 && this.inbox(id)===null,'new short inbox ID required');
    assert(typeof customer_id==='string' && validateAccountId(customer_id) && customer_id!==this.operator,'named customer required');this.validateTemplate(policy);assert(policy.operation==='support_draft','support policy required');
    const p=this.execution_profile({});assert(p && p.profile==='business-operations-v1' && p.worker_key_id===worker_key_id && p.version===execution_profile_version,'inbox profile changed');
    assert(n(expires_at)>near.blockTimestamp()/1000000000n && n(expires_at)<=18446744073n,'invalid inbox expiry');
    assert(Number.isSafeInteger(max_messages) && max_messages>=1 && max_messages<=1000 && Number.isSafeInteger(max_messages_per_day) && max_messages_per_day>=1 && max_messages_per_day<=24,'invalid inbox limits');
    const count=Number(near.storageRead('company:inbox-count') || '0');assert(count<16,'inbox capacity exhausted');near.storageWrite('company:inbox-count',String(count+1));
    const ids=JSON.parse(near.storageRead('company:inbox-ids') || '[]');ids.push(id);near.storageWrite('company:inbox-ids',JSON.stringify(ids));
    this.saveInbox({id,customer_id,policy,worker_key_id,execution_profile_version,expires_at,max_messages,max_messages_per_day,messages:0,day:'',day_messages:0,enabled:true});this.event(id,'inbox_created');this.solvent();
  }
  @call({}) company_set_inbox_enabled({id,enabled}:{id:string,enabled:boolean}) {this.ownerOnly();assert(typeof enabled==='boolean','boolean required');const box=this.inbox(id);assert(box,'unknown inbox');box.enabled=enabled;this.saveInbox(box);this.event(id,enabled?'inbox_enabled':'inbox_paused');this.solvent();}
  @call({}) company_customer_message({inbox_id,id,scope_hash,encrypted_scope,worker_sealed_key}:{inbox_id:string,id:string,scope_hash:string,encrypted_scope:string,worker_sealed_key:string}) {
    this.live();this.enabled();this.id(id);const box=this.inbox(inbox_id);assert(box && near.predecessorAccountId()===box.customer_id,'inbox customer only');
    this.envelope(encrypted_scope,scope_hash);this.sealedKey(worker_sealed_key);
    const old=this.task(id);if(old){assert(old.inbox_id===inbox_id && old.customer_id===box.customer_id && old.scope_hash===scope_hash && old.encrypted_scope===encrypted_scope && old.worker_sealed_key===worker_sealed_key,'message ID conflict');return {duplicate:true,task_id:id};}
    const now=near.blockTimestamp()/1000000000n,day=s(now/86400n);assert(box.enabled && now<n(box.expires_at),'inbox paused or expired');
    const p=this.execution_profile({});assert(p && p.profile==='business-operations-v1' && p.worker_key_id===box.worker_key_id && p.version===box.execution_profile_version,'inbox profile changed');
    assert(box.messages<box.max_messages && (box.day!==day || box.day_messages<box.max_messages_per_day),'inbox message limit');assert(this.getJob(id)===null,'ID belongs to a customer job');
    this.enqueueWork(id,'general',scope_hash,encrypted_scope,'',{worker_sealed_key,worker_key_id:box.worker_key_id,execution_profile_version:box.execution_profile_version});
    const task=this.task(id);task.operation='support_draft';task.approved_by=this.owner;task.inbox_id=inbox_id;task.customer_id=box.customer_id;task.status='queued';task.dependencies=[];task.not_before='0';this.saveTask(id,task);
    near.storageWrite('company:inbox-message:'+inbox_id+':'+box.messages,id);box.messages++;box.day_messages=box.day===day?box.day_messages+1:1;box.day=day;this.saveInbox(box);this.event(id,'customer_message');this.solvent();return {duplicate:false,task_id:id};
  }
  private validateTemplate(t:OperationTemplate) {
    assert(t && Object.keys(t).sort().join(',')==='encrypted_scope,operation,scope_hash,worker_sealed_key','invalid operation template');
    assert(OPERATIONS.includes(t.operation),'unsupported operation');this.envelope(t.encrypted_scope,t.scope_hash);this.sealedKey(t.worker_sealed_key);
  }
  @view({}) company_mandate({id}:{id:string}) {const m=this.mandate(id);return m?{...m,observed_at:s(near.blockTimestamp()/1000000000n)}:null;}
  @view({}) company_mandates() {const ids=JSON.parse(near.storageRead('company:mandate-ids') || '[]');return {items:ids.map((id:string)=>this.mandate(id))};}
  @call({}) company_create_mandate({id,plan,templates,worker_key_id,execution_profile_version,interval_seconds,start_at,expires_at,max_runs,max_runs_per_day}:{id:string,plan:OperationTemplate,templates:OperationTemplate[],worker_key_id:string,execution_profile_version:number,interval_seconds:number,start_at:string,expires_at:string,max_runs:number,max_runs_per_day:number}) {
    this.ownerOnly();this.live();this.enabled();this.id(id);assert(id.length<=24 && this.mandate(id)===null,'new short mandate ID required');
    this.validateTemplate(plan);assert(plan.operation==='strategy_plan','mandate plan must be strategy_plan');
    assert(Array.isArray(templates) && templates.length>=1 && templates.length<=4,'one to four approved templates required');for(const t of templates)this.validateTemplate(t);
    const profile=this.execution_profile({});assert(profile && profile.profile==='business-operations-v1' && profile.worker_key_id===worker_key_id && profile.version===execution_profile_version,'mandate profile changed');
    assert(Number.isSafeInteger(interval_seconds) && interval_seconds>=60 && interval_seconds<=2592000,'invalid recurring interval');
    assert(n(start_at)<n(expires_at) && n(expires_at)<=18446744073n && n(expires_at)>near.blockTimestamp()/1000000000n,'invalid mandate expiry');
    assert(Number.isSafeInteger(max_runs) && max_runs>=1 && max_runs<=1000 && Number.isSafeInteger(max_runs_per_day) && max_runs_per_day>=1 && max_runs_per_day<=24,'invalid mandate run limits');
    const ids=JSON.parse(near.storageRead('company:mandate-ids') || '[]');assert(ids.length<16,'mandate capacity exhausted');ids.push(id);near.storageWrite('company:mandate-ids',JSON.stringify(ids));
    this.saveMandate({id,plan,templates,worker_key_id,execution_profile_version,interval_seconds,start_at,expires_at,max_runs,max_runs_per_day,enabled:true,runs:0,next_at:start_at,last_plan:'',last_work:'',day:'',day_runs:0});this.event(id,'mandate_created');this.solvent();
  }
  @call({}) company_set_mandate_enabled({id,enabled}:{id:string,enabled:boolean}) {
    this.ownerOnly();assert(typeof enabled==='boolean','boolean required');const m=this.mandate(id);assert(m,'unknown mandate');m.enabled=enabled;this.saveMandate(m);this.event(id,enabled?'mandate_enabled':'mandate_paused');this.solvent();
  }
  @call({}) company_cancel_operation({id}:{id:string}) {
    this.ownerOnly();this.id(id);const task=this.task(id);assert(task && task.operation,'operation required');
    if(task.status==='cancelled' || task.status==='archived' && task.reason==='owner_cancelled')return {duplicate:true};
    assert(task.status==='queued' || task.status==='awaiting_evidence','operation cannot be cancelled in this stage');
    if(task.mandate_id){const m=this.mandate(task.mandate_id);m.enabled=false;this.saveMandate(m);}
    if(task.inbox_id){const box=this.inbox(task.inbox_id);box.enabled=false;this.saveInbox(box);}
    task.status='cancelled';task.reason='owner_cancelled';this.saveTask(id,task);this.event(id,'operation_cancelled');this.solvent();return {duplicate:false};
  }
  @view({}) company_mandate_readiness({id}:{id:string}) {
    const m=this.mandate(id),now=near.blockTimestamp()/1000000000n;
    if(!m)return {ready:false,reason:'unknown_mandate'};
    if(this.frozen)return {ready:false,reason:'frozen'};
    if(!m.enabled)return {ready:false,reason:'paused'};
    if(now>=n(m.expires_at))return {ready:false,reason:'expired'};
    if(m.runs>=m.max_runs)return {ready:false,reason:'run_limit'};
    const p=this.execution_profile({});if(!p || p.profile!=='business-operations-v1' || p.worker_key_id!==m.worker_key_id || p.version!==m.execution_profile_version)return {ready:false,reason:'profile_changed'};
    if(m.last_plan){const plan=this.task(m.last_plan),work=m.last_work?this.task(m.last_work):null;if(!plan || plan.status!=='archived' || !work || work.status!=='archived')return {ready:false,reason:'cycle_active'};}
    if(now<n(m.next_at))return {ready:false,reason:'not_due'};
    const day=s(now/86400n);if(m.day===day && m.day_runs>=m.max_runs_per_day)return {ready:false,reason:'daily_run_limit'};
    if(this.company_ids.length>30 || this.company_total+2>this.company_blocks)return {ready:false,reason:'task_capacity'};
    if(n(this.company_storage)<near.storageByteCost()*65536n*BigInt(this.company_blocks))return {ready:false,reason:'storage_reserve'};
    const required=n(this.cash)+n(this.escrow)+n(this.company_storage)+(near.storageUsage()+65536n)*near.storageByteCost();
    if(near.accountBalance()<required)return {ready:false,reason:'storage_backing'};
    return {ready:true,reason:'ready',expected_run:m.runs};
  }
  private queueMandateWork(id:string,t:OperationTemplate,m:any,role:string,run:number) {
    assert(this.getJob(id)===null,'ID belongs to a customer job');
    this.enqueueWork(id,'general',t.scope_hash,t.encrypted_scope,'',{worker_sealed_key:t.worker_sealed_key,worker_key_id:m.worker_key_id,execution_profile_version:m.execution_profile_version});
    const work=this.task(id);work.operation=t.operation;work.approved_by=this.owner;work.status='queued';work.dependencies=[];work.not_before='0';work.mandate_id=m.id;work.mandate_run=run;work.mandate_role=role;
    this.saveTask(id,work);this.event(id,'mandate_work_authorized');
  }
  @call({}) company_run_mandate({id,expected_run}:{id:string,expected_run:number}) {
    this.operatorOnly();this.live();this.enabled();const m=this.mandate(id);assert(m,'unknown mandate');
    assert(Number.isSafeInteger(expected_run) && expected_run>=0 && expected_run<m.max_runs,'invalid mandate sequence');
    const plan_id='cycle_'+id+'_'+expected_run+'_plan';
    if(expected_run<m.runs){const old=this.task(plan_id);assert(old && old.mandate_id===id,'mandate history missing');return {duplicate:true,task_id:plan_id};}
    assert(expected_run===m.runs && this.company_mandate_readiness({id}).ready,'mandate not ready');
    this.queueMandateWork(plan_id,m.plan,m,'plan',expected_run);
    const now=near.blockTimestamp()/1000000000n,day=s(now/86400n);m.day_runs=m.day===day?m.day_runs+1:1;m.day=day;m.runs+=1;m.next_at=s(now+BigInt(m.interval_seconds));m.last_plan=plan_id;
    this.saveMandate(m);this.solvent();return {duplicate:false,task_id:plan_id};
  }
  @call({}) company_commit_plan({id,choice,evidence_hash,encrypted_evidence}:{id:string,choice:number,evidence_hash:string,encrypted_evidence:string}) {
    this.operatorOnly();this.live();this.enabled();this.id(id);this.envelope(encrypted_evidence,evidence_hash);
    const task=this.task(id);assert(task && task.mandate_role==='plan','mandate planning task required');this.operationLive(task);
    const m=this.mandate(task.mandate_id);assert(Number.isSafeInteger(choice) && choice>=0 && choice<m.templates.length,'choice outside owner-approved menu');
    if(['attested','archived'].includes(task.status)){assert(task.selected_template===choice && task.evidence_hash===evidence_hash && task.encrypted_evidence===encrypted_evidence,'plan result conflict');return {duplicate:true,task_id:'cycle_'+m.id+'_'+task.mandate_run+'_work'};}
    assert(task.status==='awaiting_evidence' && m.last_plan===id,'plan not active');
    const child_id='cycle_'+m.id+'_'+task.mandate_run+'_work';this.queueMandateWork(child_id,m.templates[choice],m,'work',task.mandate_run);
    task.status='attested';task.selected_template=choice;task.evidence_hash=evidence_hash;task.encrypted_evidence=encrypted_evidence;task.attested_by=near.predecessorAccountId();this.saveTask(id,task);
    m.last_work=child_id;this.saveMandate(m);this.event(id,'plan_committed');this.solvent();return {duplicate:false,task_id:child_id};
  }
  // Customer attaches exact current order quote, including nonrefundable order storage.
  @call({payableFunction:true}) company_order({id,task_id,scope_hash,encrypted_scope,worker_sealed_key,worker_key_id,execution_profile_version,approved_service_price,approved_job_storage,approved_task_storage,approved_backing}:{id:string,task_id:string,scope_hash:string,encrypted_scope:string,worker_sealed_key:string,worker_key_id:string,execution_profile_version:number,approved_service_price:string,approved_job_storage:string,approved_task_storage:string,approved_backing:string}) {
    this.live();const p=this.execution_profile({});assert(p && p.profile==='website-qa-v1' && p.worker_key_id===worker_key_id && p.version===execution_profile_version,'worker profile changed');this.sealedKey(worker_sealed_key);
    this.enabled();assert(this.company_ids.length<32,'company queue full');assert(this.company_blocks<1000000,'storage block maximum');
    const unit=near.storageByteCost(),job=unit*2048n,task=unit*65536n,backing=unit*65536n;
    assert(approved_service_price===this.price && approved_job_storage===s(job) && approved_task_storage===s(task) && approved_backing===s(backing),'company order quote changed');
    assert(near.attachedDeposit()===n(this.price)+job+task+backing,'exact company order quote required');
    this.company_blocks+=1;this.company_storage=s(n(this.company_storage)+task);
    this.recordOrder(id,job+task+backing,{job:s(job),task:s(task),backing:s(backing)});
    this.enqueueWork(task_id,'qa',scope_hash,encrypted_scope,id,{worker_sealed_key,worker_key_id,execution_profile_version:p.version});
  }
  // An authorized operator asserts that it checked the encrypted customer scope.
  // The contract cannot inspect the plaintext or prove the assertion is true.
  @call({}) approve_order({id}:{id:string}) {
    this.operatorOnly();this.live();this.enabled();this.id(id);const task=this.task(id);assert(task && task.kind==='qa' && task.worker_key_id,'delegated QA task required');
    if(task.status==='queued')return {status:'queued',duplicate:true};
    assert(task.status==='pending_review','task not awaiting review');const job=this.getJob(task.job_id);assert(job && job.status==='escrowed','job not escrowed');
    task.status='queued';this.saveTask(id,task);this.event(id,'approved');this.solvent();return {status:'queued',duplicate:false};
  }
  // Decline only unaccepted escrow and refund its original customer, never a chosen payee.
  @call({}) decline_order({id,reason}:{id:string,reason:string}) {
    this.operatorOnly();this.id(id);assert(reason==='unsupported_scope' || reason==='verification_failed' || reason==='execution_unavailable' || reason==='policy_changed','invalid decline reason');
    const j=this.getJob(id);assert(j && j.status==='escrowed','not refundable');const task_id=near.storageRead('company:job:'+id);assert(task_id!==null,'job not linked');
    const task=this.task(task_id);assert(task && (task.status==='pending_review' || task.status==='queued' || task.status==='blocked' || task.status==='declined' && task.reason===reason),'job already accepted or decline differs');if(task.status!=='declined'){task.reason=reason;task.status='declined';this.saveTask(task_id,task);this.event(task_id,'declined');}
    j.status='refunding';this.saveJob(id,j);this.solvent();
    return NearPromise.new(j.customer).transfer(n(j.deposit)).then(NearPromise.new(near.currentAccountId()).functionCall('on_refund',JSON.stringify({id}),0n,50000000000000n));
  }
  // Anyone can tick a task enqueued by owner/operator, an explicit authorization to
  // reserve its fee immediately under current policy. No direct transfer occurs.
  // Only QA has an existing escrowed customer job;
  // its deterministic acceptance uses the same recipient, caps and reserve rules.
  // General tasks only advance to awaiting_evidence. No action can select a payee.
  @call({})
  company_tick({id}:{id:string}) {
    this.live(); this.enabled(); this.id(id);
    const task=this.task(id); assert(task,'unknown task');
    this.operationLive(task);
    if(task.status==='hired' || task.status==='awaiting_evidence' || task.status==='attested') return {status:task.status,duplicate:true};
    assert(task.status==='queued' || task.status==='blocked','task is not queued');
    if(task.kind==='general') {assert(this.operationWait(task)==='','operation not ready'); task.status='awaiting_evidence'; this.saveTask(id,task); this.event(id,'awaiting_evidence'); this.solvent(); return {status:task.status,duplicate:false}; }
    const j=this.getJob(task.job_id); assert(j && j.status==='escrowed','job no longer escrowed');
    const fee=n(this.fee), day=s(near.blockTimestamp()/86400000000000n);
    if(this.day_current!==day) { this.day_current=day; this.day_spent='0'; }
    const spent=n(this.day_spent);
    let reason='';
    if(fee>n(this.perJob) || spent+fee>n(this.daily)) reason='spend_limit';
    else if(n(this.cash)<n(this.reserve)+n(this.committed)+n(this.withdrawing)+fee) reason='reserve';
    if(reason) {
      if(task.status==='blocked' && task.reason===reason) return {status:'blocked',reason,duplicate:true};
      task.status='blocked'; task.reason=reason; this.saveTask(id,task); this.event(id,'blocked'); this.solvent(); return {status:'blocked',reason,duplicate:false};
    }
    j.supplier=this.supplier; j.fee=this.fee; j.day=day; j.status='accepted';
    this.committed=s(n(this.committed)+fee); this.day_spent=s(spent+fee); this.saveJob(task.job_id,j);
    task.status='hired'; task.reason=''; this.saveTask(id,task); this.event(id,'hired'); this.solvent();
    return {status:'hired',duplicate:false};
  }
  // Authorized assertion, not on-chain proof that external work was completed.
  @call({})
  company_attest({id,evidence_hash,encrypted_evidence}:{id:string,evidence_hash:string,encrypted_evidence:string}) {
    this.ownerOrOperator(); this.live(); this.enabled(); this.id(id); this.envelope(encrypted_evidence,evidence_hash);
    const task=this.task(id); assert(task && (task.status==='hired' || task.status==='awaiting_evidence'),'task not ready for attestation');
    this.operationLive(task);assert(task.mandate_role!=='plan','use company_commit_plan');
    task.status='attested'; task.evidence_hash=evidence_hash; task.encrypted_evidence=encrypted_evidence; task.attested_by=near.predecessorAccountId();
    this.saveTask(id,task); this.event(id,'attested'); this.solvent();
  }
  // Permissionless archive after attestation and terminal payment, or owner archive of refunded QA.
  @call({})
  company_archive({id}:{id:string}) {
    this.id(id); const task=this.task(id); assert(task && task.status!=='archived','unknown or archived task');
    if(task.kind==='qa') {
      const j=this.getJob(task.job_id); assert(j && (j.status==='paid' || j.status==='refunded'),'job not terminal');
      assert(task.status==='attested' || j.status==='refunded' || near.predecessorAccountId()===this.owner,'attestation required for public archive');
    } else assert(task.status==='attested' || task.status==='cancelled' && task.reason==='owner_cancelled','task not terminal');
    if(task.kind==='qa') near.storageRemove('company:job:'+task.job_id);
    task.status='archived'; this.saveTask(id,task); this.company_ids=this.company_ids.filter(x=>x!==id); this.event(id,'archived'); this.solvent();
  }
  // Read-only keeper preflight. The subsequent tick is still the sole authority.
  @view({}) company_tick_readiness({id}:{id:string}) {
    this.id(id); const task=this.task(id), status=task ? task.status : null;
    if(this.frozen) return {ready:false,reason:'frozen',status};
    if(this.company_blocks<=0 || n(this.company_storage)<near.storageByteCost()*65536n*BigInt(this.company_blocks)) return {ready:false,reason:'storage_reserve',status};
    const minimum=n(this.cash)+n(this.escrow)+n(this.company_storage)+(near.storageUsage()+65536n)*near.storageByteCost();
    if(near.accountBalance()<minimum) return {ready:false,reason:'storage_backing',status};
    if(!task) return {ready:false,reason:'unknown_task',status};
    if(task.mandate_id){const m=this.mandate(task.mandate_id);if(!m || !m.enabled || near.blockTimestamp()/1000000000n>=n(m.expires_at))return {ready:false,reason:'mandate_inactive',status};}
    if(task.inbox_id){const box=this.inbox(task.inbox_id);if(!box || !box.enabled || near.blockTimestamp()/1000000000n>=n(box.expires_at))return {ready:false,reason:'inbox_inactive',status};}
    if(task.status!=='queued' && task.status!=='blocked') return {ready:false,reason:'not_queued',status};
    if(task.kind==='general') {const wait=this.operationWait(task);return {ready:wait==='',reason:wait || 'ready',status};}
    const j=this.getJob(task.job_id); if(!j || j.status!=='escrowed') return {ready:false,reason:'job_not_escrowed',status};
    const day=s(near.blockTimestamp()/86400000000000n), spent=this.day_current===day ? n(this.day_spent) : 0n, fee=n(this.fee);
    if(fee>n(this.perJob) || spent+fee>n(this.daily)) return {ready:false,reason:'spend_limit',status};
    if(n(this.cash)<n(this.reserve)+n(this.committed)+n(this.withdrawing)+fee) return {ready:false,reason:'reserve',status};
    return {ready:true,reason:'ready',status};
  }
  @view({}) company_task({id}:{id:string}) { this.id(id); return this.task(id); }
  @view({}) company_list({from_index=0,limit=10}:{from_index?:number,limit?:number}) {
    assert(Number.isInteger(from_index) && from_index>=0 && Number.isInteger(limit) && limit>=1 && limit<=20,'invalid pagination');
    const ids=this.company_ids.slice(from_index,from_index+limit);
    return {items:ids.map(id=>({id,...this.task(id)})),next_index:from_index+ids.length<this.company_ids.length ? from_index+ids.length : null};
  }
  // IDs only, including archived records; fetch ciphertext with company_task(id).
  @view({}) company_history({from_index=0,limit=10}:{from_index?:number,limit?:number}) {
    assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');
    const end=Math.min(this.company_total,from_index+limit),items:string[]=[];
    for(let i=from_index;i<end;i++) { const id=near.storageRead('company:history:'+String(i)); assert(id!==null,'history index missing'); items.push(id); }
    return {items,next_index:end<this.company_total ? end : null};
  }
  @view({}) company_storage_operation({id}:{id:string}) { this.id(id); const raw=near.storageRead('company:storage:'+id); return raw===null ? null : JSON.parse(raw); }
  @view({}) company_solvency() {
    const balance=near.accountBalance(), cost=near.storageByteCost(), used=near.storageUsage();
    const locked=used*cost, cushion=65536n*cost, protected_amount=n(this.cash)+n(this.escrow)+n(this.company_storage);
    const required=protected_amount+locked+cushion;
    return {account_balance:s(balance),cash:this.cash,customer_escrow:this.escrow,company_storage_reserve:this.company_storage,
      storage_usage_bytes:s(used),storage_byte_cost:s(cost),current_storage_cost:s(locked),mutation_cushion:s(cushion),
      protected_liabilities:s(protected_amount),minimum_account_balance:s(required),
      surplus:s(balance>required ? balance-required : 0n),shortfall:s(required>balance ? required-balance : 0n)};
  }
  @view({}) company_storage_quote({blocks}:{blocks:number}) {
    assert(Number.isSafeInteger(blocks) && blocks>=0 && blocks<=32,'invalid block count');
    if(this.company_blocks===0) assert(blocks===1,'initial company configuration requires one block');
    const next=this.company_blocks+blocks; assert(Number.isSafeInteger(next) && next<=1000000,'storage block maximum');
    const required=near.storageByteCost()*65536n*BigInt(next), current=n(this.company_storage);
    const delta=required>current ? required-current : 0n;
    return {storage_byte_cost:s(near.storageByteCost()),blocks_before:this.company_blocks,blocks_after:next,
      required_deposit:s(delta),reserve_after:s(current+delta)};
  }
  @view({}) company_state() {
    return {idea_hash:this.company_idea_hash,goal_hash:this.company_goal_hash,encrypted_idea:this.company_encrypted_idea,encrypted_goal:this.company_encrypted_goal,
      owner:this.owner,operator:this.operator,frozen:this.frozen,locale:near.storageRead('company:locale') || 'en',company_storage_reserve:this.company_storage,
      company_storage_budget_bytes:65536*this.company_blocks,storage_blocks:this.company_blocks,storage_operations:this.company_storage_ops,queue_limit:32,lifetime_task_limit:this.company_blocks,lifetime_tasks:this.company_total,task_count:this.company_ids.length,sequence:this.company_sequence,events:this.company_events};
  }
  // Public presentation preference only; immutable approved scopes keep their
  // own language. Prefix storage preserves serialized legacy treasury state.
  @call({}) company_set_locale({locale}:{locale:string}) {
    this.ownerOnly();this.enabled();assert(locale==='en' || locale==='es','unsupported company locale');
    near.storageWrite('company:locale',locale);this.event('','locale_changed');this.solvent();
  }
  @view({}) order_quote() {
    const storage=near.storageByteCost()*2048n;
    return {service_price:this.price,storage_contribution:s(storage),total_attached:s(n(this.price)+storage),storage_budget_bytes:2048};
  }
  // Customer-funded job entry, permanent task slot, and separate conservative backing.
  @view({}) company_order_quote() {
    const byte=near.storageByteCost(),job=byte*2048n,task=byte*65536n,backing=byte*65536n,total=job+task+backing;
    return {service_price:this.price,job_storage_contribution:s(job),task_storage_contribution:s(task),backing_contribution:s(backing),storage_contribution:s(total),total_attached:s(n(this.price)+total),job_storage_bytes:2048,task_storage_bytes:65536,backing_bytes:65536};
  }
  @view({}) job({id}:{id:string}) { this.id(id); return this.getJob(id); }
  @view({}) backing_operation({id}:{id:string}) { this.id(id); return near.storageRead('treasury:backing:'+id); }
  @view({}) funding_operation({id}:{id:string}) { this.id(id); return this.getFunding(id); }
  @view({}) jobs_list({from_index=0,limit=10}:{from_index?:number,limit?:number}) {
    assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');
    const end=Math.min(this.job_count,from_index+limit),items:Array<{id:string;job:Job|null}>=[];
    for(let i=from_index;i<end;i++) { const id=near.storageRead('treasury:job-index:'+String(i)); assert(id!==null,'job index missing'); items.push({id,job:this.getJob(id)}); }
    return {items,next_index:end<this.job_count ? end : null};
  }
  @view({}) funding_list({from_index=0,limit=10}:{from_index?:number,limit?:number}) {
    assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');
    const end=Math.min(this.funding_count,from_index+limit),items:Array<{id:string;amount:string|null}>=[];
    for(let i=from_index;i<end;i++) { const id=near.storageRead('treasury:fund-index:'+String(i)); assert(id!==null,'funding index missing'); items.push({id,amount:this.getFunding(id)}); }
    return {items,next_index:end<this.funding_count ? end : null};
  }
  @view({}) backing_list({from_index=0,limit=10}:{from_index?:number,limit?:number}) {
    assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');
    const end=Math.min(this.backing_count,from_index+limit),items:Array<{id:string;amount:string|null}>=[];
    for(let i=from_index;i<end;i++) { const id=near.storageRead('treasury:backing-index:'+String(i)); assert(id!==null,'backing index missing'); items.push({id,amount:near.storageRead('treasury:backing:'+id)}); }
    return {items,next_index:end<this.backing_count ? end : null};
  }
  @view({}) state() { return {withdrawing:this.withdrawing,withdrawn:this.withdrawn,owner:this.owner,operator:this.operator,supplier:this.supplier,
    price:this.price,fee:this.fee,reserve:this.reserve,perJob:this.perJob,daily:this.daily,frozen:this.frozen,
    cash:this.cash,escrow:this.escrow,committed:this.committed,revenue:this.revenue,paid:this.paid,funded:this.funded,
    job_count:this.job_count,customer_storage_collected:this.customer_storage_collected,funding_count:this.funding_count,backing_count:this.backing_count,backing_funded:this.backing_funded,day_current:this.day_current,day_spent:this.day_spent}; }
}
