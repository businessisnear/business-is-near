// Real WebCrypto, ephemeral identities in RAM only; no files/keys/model/network.
import test,{before} from 'node:test';import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {PROFILE,RECIPIENT_PROFILE,IDENTITY_PROFILE,PLAINTEXT_PROFILE,LIMITS,validateBody,recipientPolicyHash,prepareDelivery,verifyDelivery,openDelivery} from './delivery-envelope.mjs';
import {encrypt,newRecordKey,sealKey,digest,publicKeyId} from '../../../web-chain/src/crypto.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const encoder=new TextEncoder(),size=x=>encoder.encode(x).length,copy=x=>JSON.parse(JSON.stringify(x)),account=c=>c.repeat(64),ownerAccount=account('a'),workerAccount=account('b'),providerAccount=account('c');
const CONTEXT_FIELDS=['profile','chain_id','genesis_hash','registry_id','registry_code_hash','mandate_id','policy_sha256','company_id','goal_id','step_id','cycle','job_id','provider','owner','worker','assignment_sha256','scope_sha256','criteria_sha256','recipient_policy_sha256','owner_key_id','owner_key_version','worker_key_id','worker_key_version','content_sha256'];
let owner,worker,attacker,policy,base,record;const body='Fixture only: clarify the newsletter audience and shorten the introductory copy. No real human work or verified business facts are asserted.';
const to64=b=>Buffer.from(b).toString('base64');
async function identity(account_id,version='1',bits=4096){
 const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:bits,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const encoded=to64(new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey))),pem='-----BEGIN PUBLIC KEY-----\n'+encoded.match(/.{1,64}/g).join('\n')+'\n-----END PUBLIC KEY-----\n';
 return {profile:IDENTITY_PROFILE,account_id,key_id:await publicKeyId(pem),key_version:version,public_key_pem:pem,private_jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};
}
const publicOnly=i=>({account_id:i.account_id,key_id:i.key_id,key_version:i.key_version,public_key_pem:i.public_key_pem});
async function rehash(r){const sealed=role=>{const k=r.sealed_keys[role];return [role,k.account_id,k.key_id,k.key_version,k.sealed_record_key];};r.envelope_sha256=await digest(JSON.stringify([PROFILE,CONTEXT_FIELDS.map(k=>r.context[k]),r.encrypted_body_sha256,r.encrypted_body,sealed('owner'),sealed('worker')]));return r;}
async function forgePlaintext(r,plaintext){const key=newRecordKey(),encrypted=await encrypt(JSON.stringify(plaintext),key),result=copy(r);result.encrypted_body=encrypted.envelope;result.encrypted_body_sha256=encrypted.hash;for(const role of ['owner','worker'])result.sealed_keys[role].sealed_record_key=await sealKey(key,policy[role].public_key_pem,policy[role].key_id);return rehash(result);}
const open=(r,identityValue=owner,recipient='owner',expectedContext=r.context,recipientPolicy=policy)=>openDelivery(r,{identity:identityValue,recipient,expectedContext,recipientPolicy});
before(async()=>{
 [owner,worker,attacker]=await Promise.all([identity(ownerAccount),identity(workerAccount),identity(account('d'))]);
 policy={profile:RECIPIENT_PROFILE,owner:publicOnly(owner),worker:publicOnly(worker)};
 base={profile:PROFILE,chain_id:'explicit-synthetic-local-envelope-fixture',genesis_hash:'1'.repeat(43),registry_id:'registry.fixture.test.near',registry_code_hash:'2'.repeat(43),mandate_id:'3'.repeat(64),policy_sha256:'4'.repeat(64),company_id:'company.fixture.test.near',goal_id:'harbor',step_id:'proofread',cycle:0,job_id:'proofread_0',provider:providerAccount,owner:ownerAccount,worker:workerAccount,assignment_sha256:'9'.repeat(64),scope_sha256:'5'.repeat(64),criteria_sha256:'6'.repeat(64),recipient_policy_sha256:await recipientPolicyHash(policy),owner_key_id:owner.key_id,owner_key_version:owner.key_version,worker_key_id:worker.key_id,worker_key_version:worker.key_version};
 record=await prepareDelivery({context:base,recipientPolicy:policy,body});
});

test('real RSA4096 owner and worker independently open the same AES delivery without public key material leakage',async()=>{
 const [a,b]=await Promise.all([open(record),open(record,worker,'worker')]);assert.equal(a.body,body);assert.equal(b.body,body);assert.equal(a.recipient_account_id,ownerAccount);assert.equal(b.recipient_account_id,workerAccount);assert.equal(a.provider_content_is_untrusted,true);assert.equal(a.quality_verified,false);assert.equal(a.delivery_accepted,false);assert.equal(a.payment_authorized,false);
 assert.equal(record.context.content_sha256,await digest(body));assert.notEqual(record.sealed_keys.owner.sealed_record_key,record.sealed_keys.worker.sealed_record_key);
 const publicJson=JSON.stringify(record);assert.equal(publicJson.includes('"record_key"'),false);assert.equal(publicJson.includes('"private_jwk"'),false);assert.equal(publicJson.includes('"d":'),false);assert.equal(publicJson.includes(body),false);assert.ok(size(record.encrypted_body)<=LIMITS.encrypted_record);assert.ok(size(publicJson)<=LIMITS.public_record);
});
test('original policy fingerprint, version, account, RSA size and exact recipient descriptors are mandatory',async()=>{
 for(const mutate of [p=>p.owner.account_id=providerAccount,p=>p.worker.key_version='2',p=>p.owner.key_id='0'.repeat(64),p=>p.owner.public_key_pem=attacker.public_key_pem,p=>p.owner.unapproved_extra=true]){const p=copy(policy);mutate(p);await assert.rejects(()=>prepareDelivery({context:base,recipientPolicy:p,body}));}
 const small=await identity(ownerAccount,'1',2048),badPolicy={...policy,owner:publicOnly(small)};await assert.rejects(()=>recipientPolicyHash(badPolicy),/RSA4096/);
 const equalRoles={...policy,worker:publicOnly(owner)};await assert.rejects(()=>recipientPolicyHash(equalRoles),/Distinct owner and worker/);
});
test('attacker private keys, wrong account, wrong version and swapped recipient identities cannot open',async()=>{
 await assert.rejects(()=>open(record,{...owner,private_jwk:attacker.private_jwk}),/Private identity does not match/);
 await assert.rejects(()=>open(record,attacker),/Original addressed private identity/);
 await assert.rejects(()=>open(record,{...owner,key_version:'2'}),/Original addressed private identity/);
 await assert.rejects(()=>open(record,worker,'owner'),/Original addressed private identity/);
 await assert.rejects(()=>open(record,owner,'provider'),/original addressed owner or worker/);
});
test('wrong network/genesis/registry/code/policy/job/provider/scope/criteria/key expectations reject',async()=>{
 for(const [field,value] of [['chain_id','other-network'],['genesis_hash','7'.repeat(43)],['registry_id','other.fixture.test.near'],['registry_code_hash','7'.repeat(43)],['mandate_id','7'.repeat(64)],['policy_sha256','7'.repeat(64)],['company_id','other-company.fixture.test.near'],['goal_id','other'],['provider',account('e')],['scope_sha256','7'.repeat(64)],['criteria_sha256','7'.repeat(64)],['owner_key_version','2'],['worker_key_version','2']]){const expected={...record.context,[field]:value};await assert.rejects(()=>open(record,owner,'owner',expected));}
 await assert.rejects(()=>open(record,owner,'owner',{...record.context,cycle:1,job_id:'proofread_1'}),/trusted original delivery context/);
});
test('ciphertext, sealed keys, envelope hashes and extra fields cannot change under the original commitment',async()=>{
 for(const mutate of [r=>r.context.criteria_sha256='7'.repeat(64),r=>r.encrypted_body_sha256='0'.repeat(64),r=>r.envelope_sha256='0'.repeat(64),r=>r.sealed_keys.owner.key_version='2',r=>r.sealed_keys.worker.extra='unapproved',r=>r.extra='unapproved']){const r=copy(record);mutate(r);await assert.rejects(()=>open(r,owner,'owner',record.context));}
 const cipher=copy(record),c=JSON.parse(cipher.encrypted_body);c.ciphertext=(c.ciphertext[0]==='A'?'B':'A')+c.ciphertext.slice(1);cipher.encrypted_body=JSON.stringify(c);await assert.rejects(()=>open(cipher,owner,'owner',record.context),/Encrypted record commitment changed/);
});
test('rehashed outer network/registry/job metadata cannot replay an original inner plaintext into another context',async()=>{
 for(const patch of [{chain_id:'another-network'},{genesis_hash:'8'.repeat(43)},{registry_id:'other.fixture.test.near'},{cycle:1,job_id:'proofread_1'},{mandate_id:'8'.repeat(64)},{policy_sha256:'8'.repeat(64)},{assignment_sha256:'8'.repeat(64)}]){
  const r=copy(record);Object.assign(r.context,patch);await rehash(r);
  // Public hashes are not authentication; authenticated plaintext must still bind.
  await verifyDelivery(r,{expectedContext:r.context,recipientPolicy:policy});await assert.rejects(()=>open(r,owner,'owner',r.context),/Inside delivery context differs/);
 }
});
test('fresh valid encryption and rehashed outside metadata still reject a different inside context',async()=>{
 const inner={...record.context,scope_sha256:'8'.repeat(64)},r=await forgePlaintext(record,{profile:PLAINTEXT_PROFILE,context:inner,body});await verifyDelivery(r,{expectedContext:record.context,recipientPolicy:policy});await assert.rejects(()=>open(r,owner,'owner',record.context),/Inside delivery context differs/);
});
test('a changed body under an unchanged inside content commitment is rejected after successful encryption',async()=>{
 const r=await forgePlaintext(record,{profile:PLAINTEXT_PROFILE,context:record.context,body:'Different synthetic provider text.'});await assert.rejects(()=>open(r,owner,'owner',record.context),/Plaintext content commitment changed/);
});
test('recomputed hashes cannot hide AES ciphertext tamper or a changed addressed RSA sealed key',async()=>{
 const r=copy(record),cipher=JSON.parse(r.encrypted_body);cipher.ciphertext=(cipher.ciphertext[0]==='A'?'B':'A')+cipher.ciphertext.slice(1);r.encrypted_body=JSON.stringify(cipher);r.encrypted_body_sha256=await digest(r.encrypted_body);await rehash(r);await assert.rejects(()=>open(r,owner,'owner',record.context),/Unable to decrypt/);
 const s=copy(record),sealed=s.sealed_keys.owner.sealed_record_key;s.sealed_keys.owner.sealed_record_key=(sealed[0]==='A'?'B':'A')+sealed.slice(1);await rehash(s);await assert.rejects(()=>open(s,owner,'owner',record.context),/cannot open the original addressed delivery key/);
});
test('body byte bounds are UTF-8 exact and maximum legal account/key/context dimensions fit both recipient roundtrips',async()=>{
 assert.equal(validateBody('💡'.repeat(750)).length,1500);assert.throws(()=>validateBody('💡'.repeat(751)),/3000 UTF-8/);assert.equal(validateBody('x'.repeat(3000)).length,3000);assert.throws(()=>validateBody('x'.repeat(3001)),/3000 UTF-8/);
 const step='proofread'+'x'.repeat(15),bigPolicy=copy(policy);bigPolicy.owner.key_version='4294967295';bigPolicy.worker.key_version='4294967295';const large={...base,chain_id:'x'.repeat(80),registry_id:'r'.repeat(64),company_id:'q'.repeat(64),goal_id:'g'.repeat(24),step_id:step,cycle:7,job_id:step+'_7',owner_key_version:'4294967295',worker_key_version:'4294967295',recipient_policy_sha256:await recipientPolicyHash(bigPolicy)};const r=await prepareDelivery({context:large,recipientPolicy:bigPolicy,body:'💡'.repeat(750)});const [a,b]=await Promise.all([open(r,{...owner,key_version:'4294967295'},'owner',r.context,bigPolicy),open(r,{...worker,key_version:'4294967295'},'worker',r.context,bigPolicy)]);assert.equal(size(a.body),3000);assert.equal(b.body,a.body);assert.ok(size(r.encrypted_body)<=8192);assert.ok(size(JSON.stringify(r))<=16384);
 const invalid=copy(record);invalid.encrypted_body='x'.repeat(8193);await assert.rejects(()=>verifyDelivery(invalid,{expectedContext:record.context,recipientPolicy:policy}),/Bound encrypted record/);
 const tooLarge=copy(record);tooLarge.sealed_keys.owner.sealed_record_key='A'.repeat(17000);await assert.rejects(()=>verifyDelivery(tooLarge,{expectedContext:record.context,recipientPolicy:policy}),/Bound V4 public delivery record/);
});
test('decrypted oversized or obvious-secret plaintext is refused even with valid matching public hashes',async()=>{
 for(const value of ['z'.repeat(3001),'private_key=synthetic_test_marker_not_a_real_key']){
  const c={...record.context,content_sha256:await digest(value)},r=copy(record);r.context=c;const forged=await forgePlaintext(r,{profile:PLAINTEXT_PROFILE,context:c,body:value});await assert.rejects(()=>open(forged,owner,'owner',c));
 }
});
test('bounded obvious-secret patterns and malformed text are refused without a universal detector claim',()=>{
 for(const value of ['', '  ','\ud800','hello\0world','-----BEGIN PRIVATE KEY----- synthetic fixture','ed25519:'+'A'.repeat(70),'sk_'+'Q'.repeat(30),'xi-'+'Q'.repeat(30),'api_key=synthetic_example','seed phrase: synthetic example'])assert.throws(()=>validateBody(value));
 assert.equal(validateBody('Public NEAR account '+ownerAccount).includes(ownerAccount),true);
});
test('versions and exact immutable field schemas cannot be silently promoted or extended',async()=>{
 for(const patch of [{profile:'near-encrypted-procurement-delivery-v3'},{owner_key_version:'01'},{worker_key_version:'0'},{worker_key_version:'4294967296'},{provider:ownerAccount},{job_id:'other_0'},{cycle:8},{unknown_context:true}])await assert.rejects(()=>prepareDelivery({context:{...base,...patch},recipientPolicy:policy,body}));
});
test('async policy or envelope mutation cannot switch recipient keys or authenticated records during crypto work',async()=>{
 const changingPolicy=copy(policy),pending=prepareDelivery({context:base,recipientPolicy:changingPolicy,body});changingPolicy.worker=publicOnly(attacker);const r=await pending;assert.equal(r.sealed_keys.worker.key_id,worker.key_id);assert.equal((await open(r,worker,'worker',r.context)).body,body);
 const mutable=copy(record),opening=open(mutable,owner,'owner',record.context);mutable.context.chain_id='changed-during-crypto';mutable.encrypted_body='changed';mutable.sealed_keys.owner.sealed_record_key='changed';assert.equal((await opening).body,body);
});
