// Offline consistency of an adopted public source. Live consent/code/finality
// are checked by the pinned worker reader; this module grants no authority.
import {digest} from './crypto.js';
import {validateKnowledgeReference} from './knowledge-actions.js';

const OPERATIONS=new Set(['research_summary','website_build','content_draft','support_draft','outreach_draft','social_draft','ads_draft','analytics_report']);
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Plain public knowledge data required.');const fields=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!fields[key].enumerable||!Object.hasOwn(fields[key],'value'))||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw Error('Unexpected public knowledge fields.');return value;}
function text(value,max,bytes=false){if(typeof value!=='string'||!value.trim()||(bytes?new TextEncoder().encode(value).length:[...value].length)>max||/[\x00-\x08\x0b-\x1f\x7f]/.test(value))throw Error('Invalid bounded public knowledge text.');for(const point of value){const n=point.codePointAt(0);if(n>=0xd800&&n<=0xdfff)throw Error('Invalid public knowledge Unicode.');}}
function sha(value){if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))throw Error('Exact public knowledge SHA-256 required.');}
function chainHash(value){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';if(typeof value!=='string'||value.length<32||value.length>44)throw Error('Exact chain hash required.');let n=0n;for(const character of value){const digit=alphabet.indexOf(character);if(digit<0)throw Error('Exact chain hash required.');n=n*58n+BigInt(digit);}const bytes=n===0n?0:Math.ceil(n.toString(2).length/8),leading=value.length-value.replace(/^1+/,'').length;if(bytes+leading!==32)throw Error('Exact 32-byte chain hash required.');}
function canonical(value){if(typeof value==='string')return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>canonical(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}

export function validateKnowledgeScope(scope){
 exact(scope,['profile','operation','brief','context','sources','use_ai','knowledge',...(Object.hasOwn(scope,'locale')?['locale']:[])]);
 if(scope.profile!=='business-operations-v1'||!OPERATIONS.has(scope.operation)||typeof scope.use_ai!=='boolean'||Object.hasOwn(scope,'locale')&&!['en','es'].includes(scope.locale))throw Error('Public knowledge requires one ordinary approved operation.');
 const extension=exact(scope.knowledge,['reference']),ref=extension.reference;validateKnowledgeReference(ref,ref?.registry_id,ref?.consumer_id);
 if(!Array.isArray(scope.sources)||scope.sources.length!==1)throw Error('Use the sole exact adopted_note source.');const source=exact(scope.sources[0],['id','text']);if(source.id!=='adopted_note')throw Error('Use the exact adopted_note source ID.');text(source.text,600);return scope;
}

export async function validateKnowledgeSource(scope){validateKnowledgeScope(scope);if(await digest(scope.sources[0].text)!==scope.knowledge.reference.content_sha256)throw Error('The whole public note differs from its approved content hash.');return scope;}

export async function validateKnowledgeEvidence(payload,scope,scopeHash){
 await validateKnowledgeSource(scope);sha(scopeHash);const ref=scope.knowledge.reference;
 if(payload.profile!==scope.profile||payload.operation!==scope.operation||payload.delivery!=='private_artifact_only')throw Error('Public knowledge remains an ordinary private artifact.');
 const r=exact(payload.knowledge_receipt,['profile','scope_sha256','reference_sha256','sources_sha256','publication_sha256','registry_id','code_hash','final','license','attribution','source_uri','untrusted_public_data','authority','training','private_reads']);
 const expected={profile:'near-public-playbook-receipt-v1',scope_sha256:scopeHash,reference_sha256:await digest(canonical(ref)),sources_sha256:await digest(canonical(scope.sources)),publication_sha256:ref.publication_sha256,registry_id:ref.registry_id,attribution:ref.publisher_id,untrusted_public_data:true,authority:false,training:false,private_reads:false};
 for(const [key,value] of Object.entries(expected))if(r[key]!==value)throw Error('Public knowledge receipt differs from its exact source, scope or authority.');
 chainHash(r.code_hash);const final=exact(r.final,['chain_id','block_hash','block_height']);if(typeof final.chain_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(final.chain_id)||!Number.isSafeInteger(final.block_height)||final.block_height<0)throw Error('Invalid public knowledge FINAL boundary.');chainHash(final.block_hash);
 if(!['CC0-1.0','CC-BY-4.0'].includes(r.license))throw Error('Unsupported public note license.');text(r.source_uri,256,true);
 if(canonical(r).length>1200)throw Error('Public knowledge receipt exceeds its encrypted budget.');
 const expectedSources=[{id:'adopted_note',sha256:await digest(scope.sources[0].text)}];if(canonical(payload.sources)!==canonical(expectedSources))throw Error('Public knowledge result source commitment changed.');return r;
}
