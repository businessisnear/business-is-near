import {canonicalFactory} from './company-factory-client.js';
import {validateFounderConfig,founderAccount} from './founder-journey-core.js';
import {digest} from './crypto.js';
import {checkFounderNetwork,founderQuery,founderView,createFounderRPC} from './founder-rpc.js';
import {validateFinalOutcome} from '../../executor/outcome.mjs';

const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,SHA=/^[a-f0-9]{64}$/;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/.test(v)&&!/(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|javascript:|data:|file:|-----BEGIN [^-]*PRIVATE KEY-----|(?:secret[_ ]?key|private[_ ]?key|record[_ ]?key|seed phrase|mnemonic)[\"']?\s*[:=]|ed25519:)/i.test(v);
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))throw Error('Unexpected public website data.');return v;}
function publicText(value,max,label,field){if(text(value,max))return;const error=Error(label+': use 1–'+max.toLocaleString('en-US')+' plain-text characters without markup, links or credential markers.'+(typeof value==='string'&&/(?:data:|file:)/i.test(value)?' The deployed factory also rejects “data:” and “file:” inside words such as “metadata:” and “profile:”. Rephrase that label without its colon.':''));error.publicField=field;throw error;}
export function validatePublicSiteContent(value){
  exact(value,['title','summary','items']);publicText(value.title,200,'Public website title','title');publicText(value.summary,1500,'Public introduction','summary');if(!Array.isArray(value.items)||value.items.length<1||value.items.length>8)throw Error('Use one to eight plain-text public sections.');
  for(const [i,item]of value.items.entries()){exact(item,['text']);publicText(item.text,2000,'Public section '+(i+1),'items.'+i);}
  const content={title:value.title,summary:value.summary,items:value.items.map(item=>({text:item.text}))};
  if(new TextEncoder().encode(JSON.stringify(content)).length>12288)throw Error('Shorten the public website to fit its 12 KiB content limit.');return content;
}
export async function validatePublicSite(value,{id,companyId,owner}){
  if(value===null)return null;
  exact(value,['schema','id','company_id','owner_id','revision','status','content','content_sha256','created_at','updated_at','storage_deposit']);
  if(value.schema!=='near-founder-site-v1'||value.id!==id||value.company_id!==companyId||value.owner_id!==owner||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>1000000||!['published','unpublished'].includes(value.status)||!SHA.test(value.content_sha256)||['created_at','updated_at','storage_deposit'].some(k=>typeof value[k]!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(value[k])))throw Error('Public website identity or revision differs from its company.');
  if(value.status==='unpublished'){if(value.content!==null)throw Error('An unpublished website must hide its current content.');}
  else{const content=validatePublicSiteContent(value.content);if(await digest(JSON.stringify(content))!==value.content_sha256)throw Error('Public website content does not match its on-chain commitment.');}
  return value;
}
export function publicationIntent({config,recordId,companyId,owner,site,storageByteCost,content,unpublish=false}){
  founderAccount(companyId);founderAccount(owner);if(!/^[A-Za-z0-9_-]{1,48}$/.test(recordId))throw Error('A verified company request is required.');
  if(typeof storageByteCost!=='string'||!/^[1-9][0-9]{0,38}$/.test(storageByteCost))throw Error('Read the actual protocol storage price.');
  if(unpublish&&site?.status!=='published')throw Error('Read the currently published website first.');
  if(site&&(site.id!==recordId||site.company_id!==companyId||site.owner_id!==owner||!Number.isSafeInteger(site.revision)||site.revision<1))throw Error('The public website belongs to another company or owner.');
  const args={id:recordId,expected_version:site?.revision||0,...(unpublish?{}:{content:validatePublicSiteContent(content)})};
  return {network:'testnet',owner,company_id:companyId,receiver_id:config.factory_id,code_hash:config.factory_code_hash,method:unpublish?'unpublish_site':'publish_site',args,
    deposit:!unpublish&&!site?String(16384n*BigInt(storageByteCost)):'0',gas:'100000000000000'};
}
export function validatePublicationOutcome(out,pending,block){
  const expected=pending.intent,actions=out?.transaction?.actions;
  if(!block||block.hash!==out?.transaction_outcome?.block_hash||!Number.isSafeInteger(block.height)||block.height<=pending.started_height||!Array.isArray(actions)||actions.length!==1)throw Error('Publication receipt is incomplete or older than its approval.');
  const call=actions[0]?.FunctionCall;if(!call||Object.keys(actions[0]).join(',')!=='FunctionCall'||Object.keys(call).sort().join(',')!=='args,deposit,gas,method_name'||call.method_name!==expected.method||String(call.gas)!==expected.gas||call.deposit!==expected.deposit||typeof call.args!=='string'||call.args.length>24000)throw Error('Publication receipt differs from the exact reviewed action.');
  let args;try{args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(call.args),c=>c.charCodeAt(0))));}catch{throw Error('Publication receipt arguments are invalid.');}
  if(canonicalFactory(args)!==canonicalFactory(expected.args))throw Error('Publication content or revision changed in the wallet receipt.');
  return validateFinalOutcome(out,{hash:pending.tx_hash,method:expected.method,id:expected.args.id},expected.owner,expected.receiver_id);
}
export async function readPublicSite({config,recordId,rpc=createFounderRPC()}){
  await validateFounderConfig(config);if(typeof recordId!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(recordId))throw Error('Open a valid public website link.');
  await checkFounderNetwork(rpc);const block=await rpc.finalBlock();
  const [factory,record,site,protocol]=await Promise.all([
    founderQuery(rpc,{request_type:'view_account',account_id:config.factory_id},block),
    founderView(rpc,config.factory_id,'record',{id:recordId},block),founderView(rpc,config.factory_id,'site',{id:recordId},block),rpc.request('EXPERIMENTAL_protocol_config',{block_id:block.hash})]);
  if(factory.code_hash!==config.factory_code_hash||record?.id!==recordId||record.phase!=='active'||record.template_sha256!==config.company_template_sha256||!record.child?.endsWith('.'+config.factory_id))throw Error('This website does not belong to a verified company from the reviewed factory.');
  founderAccount(record.child);founderAccount(record.creator);
  return {site:await validatePublicSite(site,{id:recordId,companyId:record.child,owner:record.creator}),record,block,storageByteCost:protocol?.runtime_config?.storage_amount_per_byte};
}

