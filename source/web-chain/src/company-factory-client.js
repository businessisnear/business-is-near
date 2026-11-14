import {validateFinalOutcome} from '../../executor/outcome.mjs';
import {originalSignerPublicKey} from './company-factory-actions.js';

const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function canonicalFactory(value){if(Array.isArray(value))return '['+value.map(canonicalFactory).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalFactory(value[key])).join(',')+'}';return JSON.stringify(value);}
export async function factoryFingerprint(value){const {tx_hash,fingerprint,...immutable}=value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalFactory(immutable))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function factoryNearInput(value){if(typeof value!=='string'||value.length>65||!/^(0|[1-9]\d*)(?:\.\d{1,24})?$/.test(value))throw Error('Use an exact NEAR amount with at most 24 decimal places.');const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*10n**24n+BigInt(fraction.padEnd(24,'0'));if(amount>=2n**128n)throw Error('Amount exceeds the supported integer bound.');return String(amount);}
export function factoryNear(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,38})$/.test(value))throw Error('Invalid yoctoNEAR amount.');const amount=BigInt(value),fraction=String(amount%10n**24n).padStart(24,'0').replace(/0+$/,'');return String(amount/10n**24n)+(fraction?'.'+fraction:'')+' NEAR';}

export function factoryPublicKeyHex(value){
 if(typeof value!=='string'||!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))throw Error('Choose an Ed25519 public key. Never enter a private key.');
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',encoded=value.slice(8);let n=0n,zeros=0;while(encoded[zeros]==='1')zeros++;for(const c of encoded)n=n*58n+BigInt(alphabet.indexOf(c));let hex=n? n.toString(16):'';if(hex.length%2)hex='0'+hex;hex='00'.repeat(zeros)+hex;if(hex.length!==64)throw Error('An Ed25519 public key must contain exactly 32 bytes.');const result='00'+hex;if(originalSignerPublicKey(result)!==value)throw Error('Use the canonical Ed25519 public key.');return result;
}

export function factoryWalletTransaction(action,creator){return {signerId:creator,receiverId:action.receiverId,actions:[{type:'FunctionCall',params:{methodName:action.method,args:structuredClone(action.args),gas:action.gas,deposit:action.deposit}}]};}

export async function validateFactoryPending(value,{network,chainId,factory,creator}){
 const fields=['version','request_id','network','chain_id','factory','creator','factory_code_hash','template_sha256','action','started_height','started_block','tx_hash','fingerprint'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==fields.sort().join(',')||value.version!==1||! /^[0-9a-f]{32}$/.test(value.request_id)||value.network!==network||value.chain_id!==chainId||value.factory!==factory||value.creator!==creator||!HASH.test(value.factory_code_hash)||! /^[0-9a-f]{64}$/.test(value.template_sha256)||!Number.isSafeInteger(value.started_height)||value.started_height<0||!HASH.test(value.started_block)||value.tx_hash!==null&&!HASH.test(value.tx_hash)||value.fingerprint!==await factoryFingerprint(value))throw Error('Saved factory action is malformed or belongs to another workspace.');
 if(!value.action||value.action.network!==network||value.action.receiverId!==factory||value.action.ownerOnly!==true||!['create','retry_create','claim_refund','retry_refund'].includes(value.action.method)||typeof value.action.args?.id!=='string')throw Error('Saved factory action changed its authority.');
 return value;
}

export function validateFactoryWalletOutcome(out,pending,header){
 const action=pending.action,tx=out?.transaction,call=tx?.actions?.length===1?tx.actions[0].FunctionCall:null;
 if(!call||Object.keys(tx.actions[0]).join(',')!=='FunctionCall'||Object.keys(call).sort().join(',')!=='args,deposit,gas,method_name'||call.method_name!==action.method||String(call.gas)!==action.gas||call.deposit!==action.deposit||typeof call.args!=='string'||call.args.length>32000)throw Error('Factory wallet outcome differs from the reviewed action.');
 let args;try{args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(call.args),c=>c.charCodeAt(0))));}catch{throw Error('Factory wallet arguments are incomplete.');}
 if(canonicalFactory(args)!==canonicalFactory(action.args))throw Error('Factory wallet arguments differ from the reviewed request.');
 if(!header||header.hash!==out.transaction_outcome?.block_hash||!Number.isSafeInteger(header.height)||header.height<=pending.started_height)throw Error('Factory transaction does not follow its reviewed FINAL block.');
 return validateFinalOutcome(out,{hash:pending.tx_hash,method:action.method,id:action.args.id},pending.creator,pending.factory);
}

// The UI supplies its captured review/epoch guard. Comparing the account name
// alone cannot detect an owner -> other account -> owner change during await.
export async function sendFactoryWallet(getState,transaction,assertCurrent,serializeAction=value=>value){
 if(typeof getState!=='function'||typeof assertCurrent!=='function'||typeof serializeAction!=='function')throw Error('Captured factory wallet review required.');
 const {selector,account}=getState(),approved=structuredClone(transaction);
 if(!selector||typeof selector.wallet!=='function'||approved.signerId!==account||!Array.isArray(approved.actions)||approved.actions.length!==1)throw Error('Connect the exact originating owner wallet.');
 const unchanged=()=>{assertCurrent();const state=getState();if(state.selector!==selector||state.account!==account)throw Error('Wallet changed during factory review.');};
 unchanged();const wallet=await selector.wallet();unchanged();
 if(!wallet||typeof wallet.getAccounts!=='function'||typeof wallet.signAndSendTransaction!=='function')throw Error('Original owner wallet account inspection required.');
 const accounts=await wallet.getAccounts();unchanged();
 if(!Array.isArray(accounts)||!accounts.some(value=>value.accountId===account))throw Error('Selected wallet no longer owns the originating account.');
 const actions=approved.actions.map(serializeAction);unchanged();
 return wallet.signAndSendTransaction({...approved,actions});
}
