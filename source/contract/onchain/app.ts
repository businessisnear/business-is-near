import {NearBindgen, near, call, view, initialize, assert, validateAccountId, encode} from 'near-sdk-js';

// Fixed public-raw-record template. Optional client ciphertext adds no methods/authority.
type Scalar = string|number|boolean;
type Field = {name:string; type:string; default:Scalar};
type Schema = {version:number; fields:Field[]};
type Row = {account_id:string; record_id:string; schema_version:number; schema_hash:string; revision:number; data:Record<string,Scalar>};
type Journal = {migration_id:string; from_hash:string; to_hash:string; from_version:number; target:Schema; cursor:number; total:number; completed:boolean};
const ROW_BYTES=8192n, ACCOUNT_BYTES=2048n, MIGRATION_BYTES=8192n, CUSHION_BYTES=65536n;
const ACCOUNT_LIMIT=16, ROW_LIMIT=64, PER_ACCOUNT_LIMIT=8, FIELD_LIMIT=8;
const ACK='PUBLIC_NONSECRET_PERMANENT';
const RESERVED=['owner','admin','role','auth','account','account_id','record_id','schema','schema_hash','schema_version','revision','payer','payee','amount','price','balance','money','payment','deposit','storage','storage_collected','cash','escrow','revenue','operator','supplier','method','contract_id','public_key','private_key','secret_key','constructor','prototype','__proto__'];
const digest=(value:string):string=>Array.from(near.sha256(encode(value))).map(x=>x.toString(16).padStart(2,'0')).join('');

@NearBindgen({requireInit:true})
class NativePublicApp {
  owner_id='';
  schema:Schema={version:1,fields:[]};
  schema_hash='';
  accounts:string[]=[];
  account_counts:number[]=[];
  row_keys:string[]=[];
  storage_collected='0';
  migration_storage_collected='0';
  // SDK 2.0 reconstructs own field constructors; false is a safe empty sentinel.
  journal:Journal|false=false;

  private keys(value:any,names:string[]) {assert(value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===names.slice().sort().join(','),'exact typed object fields required');}
  private account(value:string) {assert(typeof value==='string' && value.length>=2 && value.length<=64 && validateAccountId(value),'valid account required');}
  private owns(account_id:string) {this.account(account_id);assert(near.predecessorAccountId()===account_id,'record namespace principal only');}
  private owner() {assert(near.predecessorAccountId()===this.owner_id,'immutable app owner only');}
  private id(value:string) {assert(typeof value==='string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value) && !RESERVED.includes(value),'invalid record ID');}
  private hash(value:string) {assert(typeof value==='string' && /^[0-9a-f]{64}$/.test(value),'lowercase SHA-256 required');}
  private scalar(type:string,value:Scalar) {
    if(type==='shortstring') {
      assert(typeof value==='string' && encode(value).length<=128,'shortstring must fit 128 UTF-8 bytes');
      for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);assert(c>=32 && c!==127,'shortstring control character');if(c>=0xd800 && c<=0xdbff){assert(i+1<value.length && value.charCodeAt(i+1)>=0xdc00 && value.charCodeAt(i+1)<=0xdfff,'invalid Unicode');i++;}else assert(!(c>=0xdc00 && c<=0xdfff),'invalid Unicode');}
    }else if(type==='sealedtext') {
      assert(typeof value==='string' && encode(value).length<=2048,'sealedtext must fit 2048 UTF-8 bytes');if(value==='')return;
      const e=JSON.parse(value);this.keys(e,['v','alg','kdf','iterations','salt','iv','ciphertext']);
      assert(e.v===1 && e.alg==='AES-256-GCM' && e.kdf==='PBKDF2-SHA256' && e.iterations===600000 && Object.keys(e).join(',')==='v,alg,kdf,iterations,salt,iv,ciphertext' && JSON.stringify(e)===value,'canonical supported sealedtext envelope required');
      const bytes=(s:any):number=>{assert(typeof s==='string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),'canonical sealedtext base64 required');const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';if(s.endsWith('=='))assert((alphabet.indexOf(s[s.length-3])&15)===0,'base64 padding bits');else if(s.endsWith('='))assert((alphabet.indexOf(s[s.length-2])&3)===0,'base64 padding bits');return s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0);};
      assert(bytes(e.salt)===16 && bytes(e.iv)===12 && bytes(e.ciphertext)>=16,'invalid sealedtext dimensions');
    }else if(type==='int')assert(typeof value==='number' && Number.isSafeInteger(value) && value>=-1000000000 && value<=1000000000,'int must be within +/-1000000000');
    else if(type==='bool')assert(typeof value==='boolean','bool must be boolean');
    else assert(false,'unsupported field type');
  }
  private validateSchema(schema:Schema):string {
    this.keys(schema,['version','fields']);assert(Number.isSafeInteger(schema.version) && schema.version>=1 && schema.version<=32,'schema version must be 1..32');
    assert(Array.isArray(schema.fields) && schema.fields.length>=1 && schema.fields.length<=FIELD_LIMIT,'schema must have 1..8 fields');
    let prior='',sealed=0;for(const field of schema.fields){this.keys(field,['name','type','default']);assert(typeof field.name==='string' && /^[a-z][a-z0-9_]{0,23}$/.test(field.name) && !RESERVED.includes(field.name) && !field.name.split('_').some(token=>RESERVED.includes(token)),'protected or invalid schema field');assert(field.name>prior,'schema fields must be sorted and unique');prior=field.name;this.scalar(field.type,field.default);if(field.type==='sealedtext'){sealed++;assert(field.default==='' && sealed<=1,'one sealedtext field with empty default required');}}
    return digest(JSON.stringify(['near-native-public-app-schema-v1',schema.version,schema.fields.map(field=>[field.name,field.type,field.default])]));
  }
  private validateData(data:Record<string,Scalar>,schema:Schema) {this.keys(data,schema.fields.map(field=>field.name));for(const field of schema.fields)this.scalar(field.type,data[field.name]);}
  private rowKey(account_id:string,record_id:string):string {this.account(account_id);this.id(record_id);return 'app:row:'+account_id+':'+record_id;}
  private read(account_id:string,record_id:string):Row|null {const raw=near.storageRead(this.rowKey(account_id,record_id));return raw===null?null:JSON.parse(raw);}
  private unlocked() {assert(!this.journal || this.journal.completed,'schema migration write lock');}
  private paused() {return near.storageRead('app:lifecycle:paused')==='true';}
  private writesLive() {assert(!this.paused(),'app retired/paused: reads, export and owner migration remain available');}
  @view({}) lifecycle_state() {return {profile:'near-native-public-app-lifecycle-v1',contract_id:near.currentAccountId(),owner_id:this.owner_id,schema_hash:this.schema_hash,paused:this.paused(),read_export_available:true,owner_migration_available:true,history_public:true,erasure:false};}
  @call({}) set_paused({paused,expected_schema_hash}:{paused:boolean;expected_schema_hash:string}) {this.owner();assert(near.attachedDeposit()===0n && typeof paused==='boolean','explicit zero-deposit app pause required');this.current(expected_schema_hash);near.storageWrite('app:lifecycle:paused',paused?'true':'false');this.solvent();return this.lifecycle_state();}
  private current(hash:string) {this.hash(hash);assert(hash===this.schema_hash,'current schema hash required');}
  private quote(bytes:bigint) {return {storage_reservation_bytes:bytes.toString(),storage_byte_cost:near.storageByteCost().toString(),storage_contribution:(bytes*near.storageByteCost()).toString(),retained:true,refundable:false,withdrawable:false,gas_included:false};}
  private accept(bytes:bigint,approved_storage:string,migration=false) {const quoted=this.quote(bytes);assert(approved_storage===quoted.storage_contribution,'exact storage quote approval required');assert(near.attachedDeposit()===BigInt(quoted.storage_contribution),'exact quoted storage deposit required');if(migration)this.migration_storage_collected=(BigInt(this.migration_storage_collected)+near.attachedDeposit()).toString();else this.storage_collected=(BigInt(this.storage_collected)+near.attachedDeposit()).toString();}
  private solvent() {assert(near.accountBalance()>=(near.storageUsage()+CUSHION_BYTES)*near.storageByteCost(),'insufficient deployment backing');}
  private bounded(before:bigint,reserved:bigint) {assert(near.storageUsage()-before<=reserved,'storage reservation exceeded');this.solvent();}
  private status() {return this.journal?{migration_id:this.journal.migration_id,from_hash:this.journal.from_hash,to_hash:this.journal.to_hash,from_version:this.journal.from_version,to_version:this.journal.target.version,cursor:this.journal.cursor,total:this.journal.total,completed:this.journal.completed,writes_locked:!this.journal.completed}:null;}
  private migration(schema:Schema) {
    const to_hash=this.validateSchema(schema);assert(schema.version===this.schema.version+1,'migration version must increment exactly one');
    assert(schema.fields.length>this.schema.fields.length,'migration must only add fields');
    for(const old of this.schema.fields){const replacement=schema.fields.find(field=>field.name===old.name);assert(replacement && JSON.stringify([replacement.name,replacement.type,replacement.default])===JSON.stringify([old.name,old.type,old.default]),'destructive migration denied: old fields/defaults must be unchanged');}
    const migration_id=digest(JSON.stringify(['near-native-public-app-migration-v1',this.schema_hash,to_hash,this.row_keys.length]));
    return {migration_id,from_hash:this.schema_hash,to_hash,from_version:this.schema.version,to_version:schema.version,row_count:this.row_keys.length,...this.quote(MIGRATION_BYTES)};
  }

  @initialize({}) init({owner_id,schema,approved_schema_hash,public_nonsecret_ack}:{owner_id:string;schema:Schema;approved_schema_hash:string;public_nonsecret_ack:string}) {
    assert(near.predecessorAccountId()===near.currentAccountId(),'contract-account initialization only');this.account(owner_id);assert(schema.version===1,'initial schema version must be one');const hash=this.validateSchema(schema);assert(hash===approved_schema_hash,'approved schema hash conflict');assert(public_nonsecret_ack===ACK,'permanent public nonsecret acknowledgement required');this.owner_id=owner_id;this.schema=schema;this.schema_hash=hash;this.solvent();
  }
  @view({}) schema_info() {return {profile:'near-native-public-app-v1',owner_id:this.owner_id,schema:this.schema,schema_hash:this.schema_hash,migration:this.status(),public_plaintext:true,erasure:false,encryption:false,payment_authority:false};}
  @view({}) record_quote({account_id,record_id,data,schema_hash}:{account_id:string;record_id:string;data:Record<string,Scalar>;schema_hash:string}) {
    this.current(schema_hash);this.validateData(data,this.schema);const exists=this.read(account_id,record_id)!==null,index=this.accounts.indexOf(account_id),newAccount=index<0,bytes=exists?0n:ROW_BYTES+(newAccount?ACCOUNT_BYTES:0n);
    return {account_id,record_id,schema_hash,exists,new_account:newAccount,writes_locked:this.paused() || !!this.journal && !this.journal.completed,capacity_available:exists||(this.row_keys.length<ROW_LIMIT && (!newAccount || this.accounts.length<ACCOUNT_LIMIT) && (newAccount || this.account_counts[index]<PER_ACCOUNT_LIMIT)),...this.quote(bytes)};
  }
  @call({payableFunction:true}) create_record({account_id,record_id,data,schema_hash,approved_storage,public_nonsecret_ack}:{account_id:string;record_id:string;data:Record<string,Scalar>;schema_hash:string;approved_storage:string;public_nonsecret_ack:string}) {
    this.owns(account_id);this.writesLive();this.unlocked();this.current(schema_hash);this.validateData(data,this.schema);const key=this.rowKey(account_id,record_id);assert(near.storageRead(key)===null,'record ID already exists');assert(public_nonsecret_ack===ACK,'permanent public nonsecret acknowledgement required');
    const before=near.storageUsage();let index=this.accounts.indexOf(account_id);const bytes=ROW_BYTES+(index<0?ACCOUNT_BYTES:0n);assert(this.row_keys.length<ROW_LIMIT && (index>=0 || this.accounts.length<ACCOUNT_LIMIT) && (index<0 || this.account_counts[index]<PER_ACCOUNT_LIMIT),'record/account capacity exhausted');this.accept(bytes,approved_storage);
    if(index<0){this.accounts.push(account_id);this.account_counts.push(0);index=this.accounts.length-1;}this.account_counts[index]++;const row:Row={account_id,record_id,schema_version:this.schema.version,schema_hash:this.schema_hash,revision:1,data};near.storageWrite(key,JSON.stringify(row));this.row_keys.push(key);this.bounded(before,bytes);return row;
  }
  @call({payableFunction:true}) update_record({account_id,record_id,data,schema_hash,expected_revision,approved_storage,public_nonsecret_ack}:{account_id:string;record_id:string;data:Record<string,Scalar>;schema_hash:string;expected_revision:number;approved_storage:string;public_nonsecret_ack:string}) {
    this.owns(account_id);this.writesLive();this.unlocked();this.current(schema_hash);this.validateData(data,this.schema);assert(public_nonsecret_ack===ACK,'permanent public nonsecret acknowledgement required');const row=this.read(account_id,record_id);assert(row,'unknown record');assert(Number.isSafeInteger(expected_revision) && expected_revision===row.revision,'record revision conflict');assert(row.revision<1000000000,'revision exhausted');this.accept(0n,approved_storage);row.data=data;row.revision++;near.storageWrite(this.rowKey(account_id,record_id),JSON.stringify(row));this.solvent();return row;
  }
  @view({}) get_record({account_id,record_id}:{account_id:string;record_id:string}) {return this.read(account_id,record_id);}
  @view({}) list_records({account_id,from_index=0,limit=8}:{account_id:string;from_index?:number;limit?:number}) {this.account(account_id);assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=8,'invalid pagination');const keys=this.row_keys.filter(key=>key.startsWith('app:row:'+account_id+':')),selected=keys.slice(from_index,from_index+limit);return {items:selected.map(key=>JSON.parse(near.storageRead(key))),next_index:from_index+selected.length<keys.length?from_index+selected.length:null,public_plaintext:true,migration:this.status()};}
  @view({}) migration_quote({schema}:{schema:Schema}) {this.unlocked();return this.migration(schema);}
  @call({payableFunction:true}) begin_migration({schema,expected_schema_hash,approved_schema_hash,migration_id,owner_approved,approved_storage,public_nonsecret_ack}:{schema:Schema;expected_schema_hash:string;approved_schema_hash:string;migration_id:string;owner_approved:boolean;approved_storage:string;public_nonsecret_ack:string}) {
    this.owner();this.unlocked();this.current(expected_schema_hash);assert(owner_approved===true,'explicit owner migration approval required');assert(public_nonsecret_ack===ACK,'permanent public nonsecret acknowledgement required');const quote=this.migration(schema);assert(quote.to_hash===approved_schema_hash && quote.migration_id===migration_id,'exact migration/schema approval required');const before=near.storageUsage();this.accept(MIGRATION_BYTES,approved_storage,true);this.journal={migration_id,from_hash:this.schema_hash,to_hash:quote.to_hash,from_version:this.schema.version,target:schema,cursor:0,total:this.row_keys.length,completed:false};this.bounded(before,MIGRATION_BYTES);return this.status();
  }
  @call({}) migrate_batch({migration_id,expected_cursor,limit}:{migration_id:string;expected_cursor:number;limit:number}) {
    this.owner();this.hash(migration_id);const journal=this.journal;assert(journal && journal.migration_id===migration_id,'exact known migration required');assert(Number.isSafeInteger(expected_cursor) && expected_cursor>=0 && expected_cursor<=journal.cursor,'migration cursor conflict');assert(Number.isSafeInteger(limit) && limit>=1 && limit<=4,'migration batch limit must be 1..4');if(expected_cursor<journal.cursor || journal.completed)return {...this.status(),duplicate:true};
    const end=Math.min(journal.cursor+limit,journal.total);for(let index=journal.cursor;index<end;index++){const key=this.row_keys[index],row:Row=JSON.parse(near.storageRead(key));assert(row.schema_hash===journal.from_hash && row.schema_version===journal.from_version,'row migration invariant violated');const data:Record<string,Scalar>={};for(const field of journal.target.fields)data[field.name]=Object.prototype.hasOwnProperty.call(row.data,field.name)?row.data[field.name]:field.default;this.validateData(data,journal.target);row.data=data;row.schema_hash=journal.to_hash;row.schema_version=journal.target.version;near.storageWrite(key,JSON.stringify(row));}
    journal.cursor=end;if(end===journal.total){this.schema=journal.target;this.schema_hash=journal.to_hash;journal.completed=true;}this.journal=journal;this.solvent();return {...this.status(),duplicate:false};
  }
  @view({}) migration_status() {return this.status();}
  @view({}) state() {return {profile:'near-native-public-app-v1',owner_id:this.owner_id,schema_hash:this.schema_hash,schema_version:this.schema.version,account_count:this.accounts.length,account_limit:ACCOUNT_LIMIT,row_count:this.row_keys.length,row_limit:ROW_LIMIT,per_account_limit:PER_ACCOUNT_LIMIT,field_limit:FIELD_LIMIT,storage_collected:this.storage_collected,migration_storage_collected:this.migration_storage_collected,storage_usage_bytes:near.storageUsage().toString(),storage_byte_cost:near.storageByteCost().toString(),backing_cushion_bytes:CUSHION_BYTES.toString(),business_revenue:'0',storage_refundable:false,storage_withdrawable:false,payment_authority:false,encryption:false,public_plaintext:true,erasure:false,migration:this.status()};}
}
