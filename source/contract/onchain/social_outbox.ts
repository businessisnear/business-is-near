import {NearBindgen, near, call, view, initialize, assert, encode, validateAccountId} from 'near-sdk-js';

// Isolated immutable provider/account social publication authority. Receipts are
// operator attestations, never TEE execution or proof of provider truthfulness.
const BYTES=32768n, CUSHION=65536n, MAX_INTENTS=128;
const digest=(s:string):string=>Array.from(near.sha256(encode(s))).map(x=>x.toString(16).padStart(2,'0')).join('');
const HASH=/^[0-9a-f]{64}$/;
const PROVIDERS=['x','instagram','facebook_pages','tiktok','youtube','pinterest'];
const STAGES={x:['account','publish','verify','reconcile'],facebook_pages:['account','publish','verify','reconcile'],pinterest:['account','destination','publish','verify','reconcile'],instagram:['account','stage','processing','publish','verify','reconcile'],tiktok:['account','capabilities','stage','upload','verify','reconcile'],youtube:['account','stage','upload','upload_status','verify','reconcile']};
const WRITES={x:['publish'],facebook_pages:['publish'],pinterest:['publish'],instagram:['stage','publish'],tiktok:['stage','upload'],youtube:['stage','upload']};
type Approval={id:string;schema:string;provider:string;intent_hash:string;encrypted_intent:string;sealed_record_key:string;worker_key_id:string;profile_hash:string;account_hash:string;destination_hash:string;content_hash:string;media_hash:string;source_hash:string;worker_hash:string;expires_at:string;max_requests:number;approved_storage:string};
type Receipt={status:string;provider_post_id:string;provider_stage_id:string;publication_state:string;account_hash:string;destination_hash:string;content_hash:string;media_hash:string;receipt_hash:string;reason:string};
type Record=Approval & {authorized_at:string;claimed:boolean;requests:string[];request_hashes:{[key:string]:string};write_reserved:boolean;receipt:Receipt|null;status:string};

@NearBindgen({requireInit:true})
class SocialOutbox {
  owner='';provider='';account_hash='';operator='';operator_key_hex='';contract_code_hash='';source_hash='';worker_hash='';worker_key_id='';profile_hash='';
  frozen=false;live_enabled=false;daily_limit=0;lifetime_limit=0;lifetime_requests=0;day='';day_requests=0;ids:string[]=[];storage_collected='0';sequence=0;
  private ownerOnly(){assert(near.predecessorAccountId()===this.owner,'owner only');}
  private operatorOnly(){assert(near.predecessorAccountId()===this.operator && near.signerAccountId()===this.operator,'operator only');const key=Array.from(near.signerAccountPk()).map(x=>x.toString(16).padStart(2,'0')).join('');assert(key===this.operator_key_hex,'exact restricted operator key required');}
  private noDeposit(){assert(near.attachedDeposit()===0n,'zero attached deposit required');}
  private live(){assert(!this.frozen,'outbox frozen');}
  private now(){return near.blockTimestamp()/1000000000n;}
  private hash(s:string){assert(typeof s==='string' && HASH.test(s),'lowercase SHA-256 required');}
  private id(s:string){assert(typeof s==='string' && /^[a-z][a-z0-9_-]{0,47}$/.test(s) && !['constructor','prototype','__proto__'].includes(s),'invalid intent ID');}
  private seconds(s:string){assert(typeof s==='string' && /^(0|[1-9][0-9]{0,10})$/.test(s),'invalid expiry');const n=BigInt(s);assert(n<=18446744073n,'invalid expiry');return n;}
  private integer(n:number,min:number,max:number){assert(Number.isSafeInteger(n) && n>=min && n<=max,'invalid bounded integer');}
  private exact(v:object,keys:string[]){assert(v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(',')===keys.sort().join(','),'exact typed fields required');}
  private read(id:string):Record|null{this.id(id);const s=near.storageRead('outbox:'+id);return s===null?null:JSON.parse(s);}
  private save(r:Record){near.storageWrite('outbox:'+r.id,JSON.stringify(r));}
  private solvent(){assert(near.accountBalance()>=(near.storageUsage()+CUSHION)*near.storageByteCost(),'separate deployment storage backing required');}
  private event(kind:string,id:string){this.sequence++;near.log(JSON.stringify({standard:'near_social_outbox',version:'1.0.0',event:kind,data:{id,sequence:this.sequence,provider:this.provider,operator_attestation:true}}));}
  private active(r:Record){assert(r && r.claimed,'claimed intent required');assert(this.now()<this.seconds(r.expires_at),'intent expired');assert(!['confirmed','failed','cancelled'].includes(r.status),'terminal intent');}
  private pins(v:{source_hash:string;worker_hash:string;worker_key_id:string;profile_hash:string}){assert(v.source_hash===this.source_hash && v.worker_hash===this.worker_hash && v.worker_key_id===this.worker_key_id && v.profile_hash===this.profile_hash,'execution pin mismatch');}
  @initialize({}) init(v:{provider:string;account_hash:string;operator:string;operator_key_hex:string;contract_code_hash:string;source_hash:string;worker_hash:string;worker_key_id:string;profile_hash:string;daily_limit:number;lifetime_limit:number}){
    this.exact(v,['provider','account_hash','operator','operator_key_hex','contract_code_hash','source_hash','worker_hash','worker_key_id','profile_hash','daily_limit','lifetime_limit']);
    assert(PROVIDERS.includes(v.provider),'supported immutable provider required');this.hash(v.account_hash);
    assert(validateAccountId(v.operator) && v.operator!==near.predecessorAccountId(),'distinct valid operator required');assert(/^00[0-9a-f]{64}$/.test(v.operator_key_hex),'ed25519 operator key bytes required');assert(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.contract_code_hash),'NEAR code hash required');for(const key of ['source_hash','worker_hash','worker_key_id','profile_hash'])this.hash(v[key]);
    this.integer(v.daily_limit,1,512);this.integer(v.lifetime_limit,1,4096);assert(v.daily_limit<=v.lifetime_limit,'daily exceeds lifetime');this.owner=near.predecessorAccountId();Object.assign(this,v);this.solvent();
  }
  @view({}) quote(){return {storage_bytes:BYTES.toString(),storage_byte_cost:near.storageByteCost().toString(),storage_contribution:(BYTES*near.storageByteCost()).toString(),nonrefundable:true,withdrawable:false,provider_cost_attested:false};}
  @view({}) state(){return {owner:this.owner,provider:this.provider,account_hash:this.account_hash,operator:this.operator,operator_key_hex:this.operator_key_hex,contract_code_hash:this.contract_code_hash,source_hash:this.source_hash,worker_hash:this.worker_hash,worker_key_id:this.worker_key_id,profile_hash:this.profile_hash,frozen:this.frozen,live_enabled:this.live_enabled,daily_limit:this.daily_limit,lifetime_limit:this.lifetime_limit,lifetime_requests:this.lifetime_requests,day:this.day,day_requests:this.day_requests,intent_count:this.ids.length,storage_collected:this.storage_collected,business_cash:'0',business_revenue:'0',business_paid:'0',operator_attestation:true,observed_at:this.now().toString()};}
  @view({}) intent({id}:{id:string}){return this.read(id);}
  @call({}) set_freeze({frozen}:{frozen:boolean}){this.ownerOnly();this.noDeposit();assert(typeof frozen==='boolean','boolean required');this.frozen=frozen;this.event(frozen?'frozen':'resumed','');}
  @call({}) set_live_enabled({enabled}:{enabled:boolean}){this.ownerOnly();this.noDeposit();assert(typeof enabled==='boolean','boolean required');this.live_enabled=enabled;this.event(enabled?'live_enabled':'live_disabled','');}
  @call({payableFunction:true}) approve(v:Approval){
    this.ownerOnly();this.live();this.exact(v,['id','schema','provider','intent_hash','encrypted_intent','sealed_record_key','worker_key_id','profile_hash','account_hash','destination_hash','content_hash','media_hash','source_hash','worker_hash','expires_at','max_requests','approved_storage']);this.id(v.id);assert(this.ids.length<MAX_INTENTS && this.read(v.id)===null,'new bounded intent required');assert(v.schema==='near-social-v1' && v.provider===this.provider && v.account_hash===this.account_hash,'supported typed provider required');this.pins(v);
    for(const key of ['intent_hash','account_hash','destination_hash','content_hash','media_hash'])this.hash(v[key]);assert(typeof v.encrypted_intent==='string' && encode(v.encrypted_intent).length>=100 && encode(v.encrypted_intent).length<=8192 && digest(v.encrypted_intent)===v.intent_hash,'encrypted intent commitment mismatch');
    const envelope=JSON.parse(v.encrypted_intent);this.exact(envelope,['v','alg','kdf','iterations','salt','iv','ciphertext']);assert(envelope.v===1 && envelope.alg==='AES-256-GCM' && envelope.kdf==='PBKDF2-SHA256' && envelope.iterations===600000,'supported encrypted envelope required');
    assert(typeof v.sealed_record_key==='string' && /^[A-Za-z0-9+/]{683}=$/.test(v.sealed_record_key),'RSA-4096 sealed record key required');const expiry=this.seconds(v.expires_at);assert(expiry>this.now() && expiry<=this.now()+604800n,'expiry within seven days required');this.integer(v.max_requests,2,8);
    const q=this.quote();assert(v.approved_storage===q.storage_contribution && near.attachedDeposit()===BigInt(q.storage_contribution),'exact nonrefundable storage quote required');const before=near.storageUsage();const r:Record={...v,authorized_at:this.now().toString(),claimed:false,requests:[],request_hashes:{},write_reserved:false,receipt:null,status:'approved'};this.ids.push(v.id);this.storage_collected=(BigInt(this.storage_collected)+near.attachedDeposit()).toString();this.save(r);assert(near.storageUsage()-before<=BYTES,'intent storage reservation exceeded');this.event('approved',v.id);this.solvent();return r;
  }
  @call({}) cancel({id}:{id:string}){this.ownerOnly();this.noDeposit();const r=this.read(id);assert(r && !r.write_reserved && ['approved','claimed'].includes(r.status),'only intent without reserved provider writes cancellable');r.status='cancelled';this.save(r);this.event('cancelled',id);}
  @call({}) claim(v:{id:string;intent_hash:string;source_hash:string;worker_hash:string;worker_key_id:string;profile_hash:string}){
    this.operatorOnly();this.noDeposit();this.live();this.exact(v,['id','intent_hash','source_hash','worker_hash','worker_key_id','profile_hash']);this.pins(v);const r=this.read(v.id);assert(r && r.intent_hash===v.intent_hash,'exact authorized intent required');assert(this.now()<this.seconds(r.expires_at),'intent expired');assert(['approved','claimed','unknown'].includes(r.status),'intent not claimable');if(r.claimed)return {duplicate:true,intent:r};r.claimed=true;r.status='claimed';this.save(r);this.event('claimed',v.id);return {duplicate:false,intent:r};
  }
  @call({}) reserve_request(v:{id:string;intent_hash:string;kind:string;request_id:string;request_hash:string;live:boolean}){
    this.operatorOnly();this.noDeposit();this.live();this.exact(v,['id','intent_hash','kind','request_id','request_hash','live']);this.hash(v.request_hash);assert(typeof v.live==='boolean' && (!v.live || this.live_enabled),'owner live enable required');const r=this.read(v.id);this.active(r);assert(r.intent_hash===v.intent_hash,'intent hash mismatch');assert(STAGES[this.provider].includes(v.kind),'fixed provider request stage required');assert(v.request_id===v.kind,'one deterministic request ID per stage required');
    if(r.requests.includes(v.kind)){assert(r.request_hashes[v.kind]===v.request_hash,'request hash conflict');return {duplicate:true,kind:v.kind,request_hash:v.request_hash,network_authorized:false};}
    assert(r.requests.length<r.max_requests,'intent request cap exceeded');const write=WRITES[this.provider].includes(v.kind);if(write)assert(r.status==='claimed' && r.requests.includes('account'),'first write requires claimed account; unknown cannot write');
    if(v.kind==='account')assert(!r.write_reserved,'account check precedes writes');
    if(v.kind==='upload')assert(r.requests.includes('stage'),'known staged upload required');
    if(this.provider==='tiktok' && v.kind==='stage')assert(r.requests.includes('capabilities'),'creator capabilities required');
    if(this.provider==='instagram' && v.kind==='publish')assert(r.requests.includes('stage') && r.requests.includes('processing'),'processed container required');
    if(this.provider==='pinterest' && v.kind==='publish')assert(r.requests.includes('destination'),'approved board check required');
    if(['processing','upload_status','verify','reconcile'].includes(v.kind))assert(r.write_reserved,'reserved provider write required for status/verification');
    const day=(this.now()/86400n).toString();const count=this.day===day?this.day_requests:0;assert(count<this.daily_limit && this.lifetime_requests<this.lifetime_limit,'irreversible provider request cap exceeded');this.day=day;this.day_requests=count+1;this.lifetime_requests++;r.requests.push(v.request_id);r.request_hashes[v.request_id]=v.request_hash;if(write)r.write_reserved=true;this.save(r);this.event('request_reserved',v.id);return {duplicate:false,kind:v.kind,request_hash:v.request_hash,network_authorized:true};
  }
  @call({}) record_receipt(v:{id:string;intent_hash:string;receipt:Receipt}){
    this.operatorOnly();this.noDeposit();this.exact(v,['id','intent_hash','receipt']);const r=this.read(v.id);assert(r && r.claimed && r.intent_hash===v.intent_hash,'exact claimed intent required');const p=v.receipt;
    this.exact(p,['status','provider_post_id','provider_stage_id','publication_state','account_hash','destination_hash','content_hash','media_hash','receipt_hash','reason']);assert(['confirmed','failed','unknown'].includes(p.status),'typed receipt status required');
    for(const key of ['account_hash','destination_hash','content_hash','media_hash','receipt_hash'])this.hash(p[key]);for(const key of ['account_hash','destination_hash','content_hash','media_hash'])assert(p[key]===r[key],'original account/destination/content/media mismatch');
    assert(/^[a-z_]{1,64}$/.test(p.reason),'typed reason required');assert(['public','private','unlisted','provider_complete','unknown','not_published'].includes(p.publication_state),'typed publication state required');
    for(const key of ['provider_post_id','provider_stage_id'])assert(typeof p[key]==='string' && /^[A-Za-z0-9_.~-]{0,160}$/.test(p[key]),'bounded opaque provider ID required');
    if(r.receipt && JSON.stringify(r.receipt)===JSON.stringify(p))return {duplicate:true,status:r.status};assert(!['confirmed','failed','cancelled'].includes(r.status),'terminal receipt immutable');
    if(r.status==='unknown')assert(p.status==='confirmed' && r.requests.includes('reconcile'),'unknown cannot retry writes or be declared failed');
    if(p.status==='unknown')assert(r.write_reserved,'unknown requires a reserved provider write');
    if(p.status==='confirmed'){
      assert(r.write_reserved && (r.requests.includes('verify') || r.requests.includes('reconcile')) && p.reason==='provider_publication_verified','known provider publication verification required');
      assert(p.provider_post_id.length>0 || (this.provider==='tiktok' && p.provider_stage_id.length>0),'known exact post or TikTok publish ID required');
      assert(p.publication_state!=='unknown' && p.publication_state!=='not_published','publication status required');
    }
    r.receipt=p;r.status=p.status;this.save(r);this.event('operator_'+p.status,v.id);return {duplicate:false,status:r.status};
  }
}
