// Copyright (c) 2026 Business is NEAR. All rights reserved.
// PRIVATE, OFFLINE CANDIDATE. This is service-custodied encryption, not a
// Nightly storage API and not end-to-end encryption against the service.
// authorize and durableStore are trusted host ports, never caller/model ports.
import {configuration as validateConfiguration,text as scalarText,binding as validateBinding} from './vault-context.mjs';
const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const HEX=/^[a-f0-9]{64}$/;
const KINDS=new Set(['mission','task','mandate','inbox']);
function exact(x,names){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!==[...names].sort().join(','))throw Error('Invalid vault request.');}
function bytes(s,max){return scalarText(s,max);}
const canon=x=>JSON.stringify(x);
const same=(a,b)=>canon(a)===canon(b);
const b64=bytes=>Buffer.from(bytes).toString('base64');
function un64(value,size){if(typeof value!=='string'||value.length>24000)throw Error('Invalid encrypted vault record.');const out=Buffer.from(value,'base64');if(out.toString('base64')!==value||size!==undefined&&out.length!==size)throw Error('Invalid encrypted vault record.');return out;}
export function createRecoveryVault({crypto,wrappingKey,keyId,authorize,durableStore,configuration}){
 if(!crypto?.subtle||typeof authorize!=='function'||!durableStore||typeof durableStore.get!=='function'||typeof durableStore.createOnly!=='function')throw Error('Trusted vault ports required.');
 if(wrappingKey?.type!=='secret'||wrappingKey.algorithm?.name!=='AES-GCM'||wrappingKey.algorithm?.length!==256||wrappingKey.extractable!==false||!wrappingKey.usages.includes('encrypt')||!wrappingKey.usages.includes('decrypt'))throw Error('Nonextractable service AES-256 key required.');
 bytes(keyId,64);if(!/^[A-Za-z0-9_.-]{1,64}$/.test(keyId))throw Error('Invalid wrapping key version.');
 const config=validateConfiguration(configuration);
 async function sha(s){return Buffer.from(await crypto.subtle.digest('SHA-256',enc.encode(s))).toString('hex');}
 function request(input,save){exact(input,save?['session','csrf','company_id','record_id','commitment','kind','recovery']:['session','csrf','company_id','record_id','commitment','kind']);bytes(input.session,256);bytes(input.csrf,256);if(typeof input.company_id!=='string'||!ACCOUNT.test(input.company_id)||typeof input.record_id!=='string'||!HEX.test(input.record_id)||typeof input.commitment!=='string'||!HEX.test(input.commitment)||!KINDS.has(input.kind))throw Error('Invalid vault scope.');if(save)bytes(input.recovery,16384);return Object.freeze({...input});}
 async function boundary(input){
  // MUST validate an existing session+CSRF and fetch current SAME-FINAL owner,
  // FullAccess key membership, company code, chain and genesis on EVERY call.
  const auth=await authorize({session:input.session,csrf:input.csrf,company_id:input.company_id});
  if(!auth||typeof auth.account_id!=='string'||!ACCOUNT.test(auth.account_id)||auth.company_id!==input.company_id||auth.owner!==auth.account_id||auth.permission!=='FullAccess'||auth.network!==config.network||auth.chain_id!==config.chain_id||auth.genesis_hash!==config.genesis_hash||auth.code_hash!==config.companies[input.company_id])throw Error('Current reviewed owner authority required.');
  return validateBinding({schema:1,network:auth.network,chain_id:auth.chain_id,genesis_hash:auth.genesis_hash,company_id:input.company_id,owner:auth.account_id,code_hash:auth.code_hash,record_id:input.record_id,commitment:input.commitment,kind:input.kind});
 }
 async function ensureCurrent(input,captured){if(!same(await boundary(input),captured))throw Error('Vault owner or scope changed.');}
 async function open(row,binding){
  exact(row,['schema','key_id','binding','iv','ciphertext']);if(row.schema!==1||row.key_id!==keyId||!same(row.binding,binding))throw Error('Encrypted vault binding changed.');
  const iv=un64(row.iv,12),data=un64(row.ciphertext);if(data.length<16||data.length>16400)throw Error('Encrypted vault size changed.');
  return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(canon(binding)),tagLength:128},wrappingKey,data));
 }
 async function receipt(row,binding){return Object.freeze({schema:1,saved:true,binding:Object.freeze({...binding}),kind:binding.kind,record_id:binding.record_id,commitment:binding.commitment,vault_record:await sha(canon(row)),custody:'service-wrapped',wallet_native_storage:false});}
 return Object.freeze({
  async save(input){
   input=request(input,true);const binding=await boundary(input),id=await sha(canon(binding));
   let row=await durableStore.get(id);
   if(row&&await open(row,binding)!==input.recovery)throw Error('Existing recovery differs; never overwrite.');
   let proposed=row;
   if(!proposed){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(canon(binding)),tagLength:128},wrappingKey,enc.encode(input.recovery));proposed={schema:1,key_id:keyId,binding,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};}
   await ensureCurrent(input,binding);
   // createOnly MUST atomically create-or-return the ORIGINAL, fsync file AND
   // directory (or commit a durable DB transaction), with no overwrite option.
   // Existing rows ALSO require a fresh confirmed commit: visible JSON after a
   // previous fsync failure is never durability proof. The port returns the
   // original's digest only AFTER durable confirmation, including on retries.
   const committed=await durableStore.createOnly(id,structuredClone(proposed));
   row=await durableStore.get(id);if(!row||await open(row,binding)!==input.recovery)throw Error('Durable vault acknowledgement unavailable.');
   if(committed?.committed!==true||committed.digest!==await sha(canon(row)))throw Error('Durable vault commit unconfirmed.');
   await ensureCurrent(input,binding);return receipt(row,binding);
  },
  async recover(input){input=request(input,false);const binding=await boundary(input),id=await sha(canon(binding)),row=await durableStore.get(id);if(!row)throw Error('Recovery unavailable.');const recovery=await open(row,binding);await ensureCurrent(input,binding);return Object.freeze({recovery,binding});}
 });
}
