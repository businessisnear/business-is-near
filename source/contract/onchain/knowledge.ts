import { NearBindgen, near, call, view, initialize, assert, validateAccountId, encode } from 'near-sdk-js';

// Public, owner-selected notes only. This registry never reads company storage,
// performs work, trains a model, transfers funds, or deletes published plaintext.
type Consent = {account_id:string; publication_enabled:boolean; adoption_enabled:boolean; publication_count:number; adoption_count:number};
type PublicationInput = {publisher_id:string; playbook_id:string; version:number; title:string; content:string; source_uri:string; provenance:string; license:string; content_sha256:string; publication_sha256:string};
type Publication = PublicationInput & {published_at:string; revoked:boolean};
type Reference = {publisher_id:string; playbook_id:string; version:number; publication_sha256:string};
type Adoption = Reference & {consumer_id:string; adoption_id:string; content_sha256:string; adopted_at:string};
const PROFILE_BYTES=4096n, PUBLICATION_BYTES=16384n, ADOPTION_BYTES=4096n, CUSHION_BYTES=65536n;
const ACK='PUBLIC_NONSECRET_PERMANENT';
const PROFILE_LIMIT=64, PUBLICATION_LIMIT=256, ADOPTION_LIMIT=256, PER_ACCOUNT_LIMIT=32;
const HASH=/^[0-9a-f]{64}$/;
const digest=(value:string):string=>Array.from(near.sha256(encode(value))).map(x=>x.toString(16).padStart(2,'0')).join('');

@NearBindgen({requireInit:true})
class SharedKnowledge {
  account_ids:string[]=[];
  publication_keys:string[]=[];
  adoption_keys:string[]=[];
  storage_collected='0';
  sequence=0;

  private account(value:string) {assert(typeof value==='string' && value.length>=2 && value.length<=64 && validateAccountId(value),'valid account required');}
  private owns(value:string) {this.account(value);assert(near.predecessorAccountId()===value,'account namespace owner only');}
  private id(value:string) {assert(typeof value==='string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value) && !['__proto__','prototype','constructor'].includes(value),'invalid public ID');}
  private version(value:number) {assert(Number.isSafeInteger(value) && value>=1 && value<=32,'version must be an integer from 1 to 32');}
  private hash(value:string) {assert(typeof value==='string' && HASH.test(value),'lowercase SHA-256 required');}
  private text(value:string,max:number) {assert(typeof value==='string' && value.trim().length>0 && encode(value).length<=max,'invalid bounded public text');for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);assert((c>=32 && c!==127)||c===10||c===9,'public text contains control characters');assert(!(c>=0xd800 && c<=0xdbff)||(i+1<value.length && value.charCodeAt(i+1)>=0xdc00 && value.charCodeAt(i+1)<=0xdfff),'invalid Unicode');if(c>=0xd800 && c<=0xdbff)i++;else assert(!(c>=0xdc00 && c<=0xdfff),'invalid Unicode');}}
  private profileKey(account_id:string):string {return 'knowledge:consent:'+account_id;}
  private publicationKey(ref:{publisher_id:string;playbook_id:string;version:number}):string {this.account(ref.publisher_id);this.id(ref.playbook_id);this.version(ref.version);return 'knowledge:publication:'+ref.publisher_id+':'+ref.playbook_id+':'+ref.version;}
  private adoptionKey(consumer_id:string,adoption_id:string):string {this.account(consumer_id);this.id(adoption_id);return 'knowledge:adoption:'+consumer_id+':'+adoption_id;}
  private readProfile(account_id:string):Consent|null {this.account(account_id);const raw=near.storageRead(this.profileKey(account_id));return raw===null?null:JSON.parse(raw);}
  private saveProfile(value:Consent) {near.storageWrite(this.profileKey(value.account_id),JSON.stringify(value));}
  private readPublication(ref:{publisher_id:string;playbook_id:string;version:number}):Publication|null {const raw=near.storageRead(this.publicationKey(ref));return raw===null?null:JSON.parse(raw);}
  private readAdoption(consumer_id:string,adoption_id:string):Adoption|null {const raw=near.storageRead(this.adoptionKey(consumer_id,adoption_id));return raw===null?null:JSON.parse(raw);}
  private now():string {return near.blockTimestamp().toString();}
  private pagination(from_index:number,limit:number) {assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');}
  private quote(bytes:bigint) {return {storage_reservation_bytes:bytes.toString(),storage_byte_cost:near.storageByteCost().toString(),storage_contribution:(bytes*near.storageByteCost()).toString(),nonrefundable:true,withdrawable:false,gas_included:false};}
  private acceptStorage(bytes:bigint,approved_storage:string) {const quote=this.quote(bytes);assert(approved_storage===quote.storage_contribution,'storage quote changed');assert(near.attachedDeposit()===BigInt(quote.storage_contribution),'exact quoted storage deposit required');this.storage_collected=(BigInt(this.storage_collected)+near.attachedDeposit()).toString();}
  private checkpoint(bytes:bigint,before:bigint) {assert(near.storageUsage()-before<=bytes,'bounded storage reservation exceeded');this.solvent();}
  private solvent() {assert(near.accountBalance()>=(near.storageUsage()+CUSHION_BYTES)*near.storageByteCost(),'insufficient deployment storage/gas backing');}
  private event(event:string,account_id:string,id:string) {assert(this.sequence<Number.MAX_SAFE_INTEGER,'sequence exhausted');this.sequence++;near.log(JSON.stringify({standard:'proofwork_public_knowledge',version:'1.0.0',event,data:{account_id,id,sequence:this.sequence}}));}
  private validatePublication(value:PublicationInput) {
    this.publicationKey(value);this.text(value.title,128);this.text(value.content,4096);this.text(value.source_uri,256);this.text(value.provenance,512);
    assert(['CC0-1.0','CC-BY-4.0'].includes(value.license),'supported public license required');this.hash(value.content_sha256);this.hash(value.publication_sha256);
    assert(digest(value.content)===value.content_sha256,'content hash conflict');
    const canonical=JSON.stringify(['near-public-playbook-v1',value.publisher_id,value.playbook_id,value.version,value.title,value.content,value.source_uri,value.provenance,value.license,value.content_sha256]);
    assert(digest(canonical)===value.publication_sha256,'publication hash conflict');
  }
  private eligible(consumer_id:string,ref:Reference) {
    this.account(consumer_id);this.hash(ref.publication_sha256);const publication=this.readPublication(ref),consumer=this.readProfile(consumer_id),publisher=this.readProfile(ref.publisher_id);
    const reason=!consumer?.adoption_enabled?'consumer_not_opted_in':!publication?'unknown_version':publication.publication_sha256!==ref.publication_sha256?'hash_conflict':publication.revoked?'revoked':!publisher?.publication_enabled?'publisher_not_opted_in':'eligible';
    return {eligible:reason==='eligible',reason,publication};
  }

  @initialize({}) init() {this.solvent();}

  @view({}) consent({account_id}:{account_id:string}) {return this.readProfile(account_id)||{account_id,publication_enabled:false,adoption_enabled:false,publication_count:0,adoption_count:0};}
  @view({}) consent_quote({account_id}:{account_id:string}) {this.account(account_id);const exists=this.readProfile(account_id)!==null;return {account_id,exists,capacity_available:exists||this.account_ids.length<PROFILE_LIMIT,...this.quote(exists?0n:PROFILE_BYTES)};}
  @call({payableFunction:true}) set_consent({account_id,publication_enabled,adoption_enabled,acknowledgement,approved_storage}:{account_id:string;publication_enabled:boolean;adoption_enabled:boolean;acknowledgement:string;approved_storage:string}) {
    this.owns(account_id);assert(typeof publication_enabled==='boolean' && typeof adoption_enabled==='boolean','explicit boolean consent required');
    assert(acknowledgement===ACK,'permanent public nonsecret acknowledgement required');
    let value=this.readProfile(account_id);const bytes=value?0n:PROFILE_BYTES,before=near.storageUsage();
    if(!value){assert(this.account_ids.length<PROFILE_LIMIT,'account capacity exhausted');value={account_id,publication_enabled:false,adoption_enabled:false,publication_count:0,adoption_count:0};this.account_ids.push(account_id);}
    this.acceptStorage(bytes,approved_storage);value.publication_enabled=publication_enabled;value.adoption_enabled=adoption_enabled;this.saveProfile(value);this.event('consent_set',account_id,'');this.checkpoint(bytes+64n,before);return value;
  }

  @view({}) publication_quote(value:PublicationInput) {this.validatePublication(value);const publisher=this.readProfile(value.publisher_id);return {publisher_id:value.publisher_id,playbook_id:value.playbook_id,version:value.version,publication_sha256:value.publication_sha256,content_sha256:value.content_sha256,publication_enabled:publisher?.publication_enabled===true,version_available:this.readPublication(value)===null,capacity_available:this.publication_keys.length<PUBLICATION_LIMIT && (publisher?.publication_count||0)<PER_ACCOUNT_LIMIT,...this.quote(PUBLICATION_BYTES)};}
  @call({payableFunction:true}) publish({publication,public_nonsecret,rights_to_publish,permanent_public_ack,approved_storage}:{publication:PublicationInput;public_nonsecret:boolean;rights_to_publish:boolean;permanent_public_ack:boolean;approved_storage:string}) {
    assert(publication && typeof publication==='object','publication required');this.owns(publication.publisher_id);this.validatePublication(publication);
    assert(public_nonsecret===true && rights_to_publish===true && permanent_public_ack===true,'explicit owner approval of public nonsecret publication required');
    const publisher=this.readProfile(publication.publisher_id);assert(publisher?.publication_enabled,'publisher has not opted in');
    const prior=this.readPublication(publication);if(prior){assert(prior.publication_sha256===publication.publication_sha256,'version hash conflict');assert(false,'version already published; inspect before retrying');}
    assert(this.publication_keys.length<PUBLICATION_LIMIT && publisher.publication_count<PER_ACCOUNT_LIMIT,'publication capacity exhausted');
    const before=near.storageUsage();this.acceptStorage(PUBLICATION_BYTES,approved_storage);
    // Copy only the declared public schema. Extra JSON fields never enter storage.
    const record:Publication={publisher_id:publication.publisher_id,playbook_id:publication.playbook_id,version:publication.version,title:publication.title,content:publication.content,source_uri:publication.source_uri,provenance:publication.provenance,license:publication.license,content_sha256:publication.content_sha256,publication_sha256:publication.publication_sha256,published_at:this.now(),revoked:false};
    const key=this.publicationKey(record);near.storageWrite(key,JSON.stringify(record));this.publication_keys.push(key);publisher.publication_count++;this.saveProfile(publisher);this.event('public_version_published',record.publisher_id,record.playbook_id);this.checkpoint(PUBLICATION_BYTES,before);return record;
  }
  // Archival view. Historical plaintext is public even when no longer eligible.
  @view({}) publication(ref:{publisher_id:string;playbook_id:string;version:number}) {return this.readPublication(ref);}
  @view({}) publications({publisher_id,from_index=0,limit=10}:{publisher_id:string;from_index?:number;limit?:number}) {this.account(publisher_id);this.pagination(from_index,limit);const prefix='knowledge:publication:'+publisher_id+':',keys=this.publication_keys.filter(key=>key.startsWith(prefix)),selected=keys.slice(from_index,from_index+limit);return {items:selected.map(key=>JSON.parse(near.storageRead(key))),next_index:from_index+selected.length<keys.length?from_index+selected.length:null,archival_public_records:true};}
  @call({}) revoke_publication({publisher_id,playbook_id,version,publication_sha256}:Reference) {this.owns(publisher_id);this.hash(publication_sha256);const record=this.readPublication({publisher_id,playbook_id,version});assert(record && record.publication_sha256===publication_sha256,'exact published version/hash required');if(record.revoked)return {duplicate:true,revoked:true,plaintext_erased:false};record.revoked=true;near.storageWrite(this.publicationKey(record),JSON.stringify(record));this.event('version_revoked',publisher_id,playbook_id);this.solvent();return {duplicate:false,revoked:true,plaintext_erased:false};}
  @view({}) eligible_publication({consumer_id,...ref}:{consumer_id:string}&Reference) {const status=this.eligible(consumer_id,ref);return {eligible:status.eligible,reason:status.reason,publication:status.eligible?status.publication:null,observed_at:this.now()};}
  @view({}) adoption_quote({consumer_id,adoption_id,...ref}:{consumer_id:string;adoption_id:string}&Reference) {this.adoptionKey(consumer_id,adoption_id);const status=this.eligible(consumer_id,ref),consumer=this.readProfile(consumer_id);return {consumer_id,adoption_id,...ref,eligible:status.eligible,reason:status.reason,id_available:this.readAdoption(consumer_id,adoption_id)===null,capacity_available:this.adoption_keys.length<ADOPTION_LIMIT && (consumer?.adoption_count||0)<PER_ACCOUNT_LIMIT,...this.quote(ADOPTION_BYTES)};}
  @call({payableFunction:true}) adopt({consumer_id,adoption_id,publisher_id,playbook_id,version,publication_sha256,owner_approved,approved_storage}:{consumer_id:string;adoption_id:string;owner_approved:boolean;approved_storage:string}&Reference) {
    this.owns(consumer_id);this.adoptionKey(consumer_id,adoption_id);assert(owner_approved===true,'explicit consumer owner approval required');const ref={publisher_id,playbook_id,version,publication_sha256},status=this.eligible(consumer_id,ref);assert(status.eligible,'publication ineligible: '+status.reason);
    const prior=this.readAdoption(consumer_id,adoption_id);if(prior){assert(prior.publisher_id===publisher_id && prior.playbook_id===playbook_id && prior.version===version && prior.publication_sha256===publication_sha256,'adoption ID hash conflict');assert(false,'adoption already recorded; inspect before retrying');}
    const consumer=this.readProfile(consumer_id);assert(this.adoption_keys.length<ADOPTION_LIMIT && consumer.adoption_count<PER_ACCOUNT_LIMIT,'adoption capacity exhausted');
    const before=near.storageUsage();this.acceptStorage(ADOPTION_BYTES,approved_storage);const record:Adoption={consumer_id,adoption_id,...ref,content_sha256:status.publication.content_sha256,adopted_at:this.now()},key=this.adoptionKey(consumer_id,adoption_id);near.storageWrite(key,JSON.stringify(record));this.adoption_keys.push(key);consumer.adoption_count++;this.saveProfile(consumer);this.event('reference_adopted',consumer_id,adoption_id);this.checkpoint(ADOPTION_BYTES,before);return this.adoption({consumer_id,adoption_id});
  }
  @view({}) adoption({consumer_id,adoption_id}:{consumer_id:string;adoption_id:string}) {const record=this.readAdoption(consumer_id,adoption_id);if(!record)return null;const status=this.eligible(consumer_id,record);return {...record,currently_eligible:status.eligible,eligibility_reason:status.reason,operation_completed:false,payment_authority:false,tool_authority:false};}
  @view({}) operation_reference({consumer_id,adoption_id}:{consumer_id:string;adoption_id:string}) {const record=this.readAdoption(consumer_id,adoption_id);assert(record,'unknown adoption');const status=this.eligible(consumer_id,record);assert(status.eligible,'adoption currently ineligible: '+status.reason);return {profile:'near-public-playbook-reference-v1',registry_id:near.currentAccountId(),...record,untrusted_public_data:true,requires_separate_operation_approval:true,operation_completed:false,payment_authority:false,tool_authority:false};}
  @view({}) state() {return {profile:'near-public-playbook-registry-v1',registry_id:near.currentAccountId(),account_count:this.account_ids.length,account_limit:PROFILE_LIMIT,publication_count:this.publication_keys.length,publication_limit:PUBLICATION_LIMIT,adoption_count:this.adoption_keys.length,adoption_limit:ADOPTION_LIMIT,per_account_publication_limit:PER_ACCOUNT_LIMIT,per_account_adoption_limit:PER_ACCOUNT_LIMIT,storage_collected:this.storage_collected,storage_contributions_refundable:false,storage_contributions_withdrawable:false,storage_usage_bytes:near.storageUsage().toString(),storage_byte_cost:near.storageByteCost().toString(),backing_cushion_bytes:CUSHION_BYTES.toString(),sequence:this.sequence,default_publication_enabled:false,default_adoption_enabled:false,private_company_reads:false,model_training:false,payment_authority:false,tool_authority:false,operation_completion:false,revocation_erases_plaintext:false};}
}
