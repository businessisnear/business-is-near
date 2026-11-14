// Fake strings, contexts and DOM only; no browser/storage/RPC/wallet/model IO.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {pendingOriginalMetadata,readPendingOriginalMetadata,renderPendingOriginalMetadata,PENDING_METADATA_MAX_BYTES} from '../src/business-pending-metadata.js';
const context=Object.freeze({network:'testnet',company:'company.testnet',appContract:null,account:'owner.testnet'});
const record=()=>({version:1,network:'testnet',contract:'company.testnet',account:'owner.testnet',request_id:'a'.repeat(32),fingerprint:'b'.repeat(64),tx_hash:null,intent:{method:'company_submit_operation',deposit:'0',gas:'150000000000000',args:{id:'PRIVATE_TASK',sealed:'PRIVATE_CIPHERTEXT',key:'PRIVATE_KEY',capability:'PRIVATE_CAPABILITY'}}});
const view=(r=record(),c=context)=>pendingOriginalMetadata(JSON.stringify(r),c);
const joined=v=>JSON.stringify(v);
function documentFixture(){
 const tags=[];let listeners=0,htmlAssignments=0;
 class Element{
  constructor(tag,document){this.tagName=tag;this.ownerDocument=document;this.children=[];this.hidden=false;this.className='';this.text='';}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
  set innerHTML(_){htmlAssignments++;throw Error('HTML is forbidden');}
  set outerHTML(_){throw Error('HTML is forbidden');}
  addEventListener(){listeners++;throw Error('No event/control ports');}
  querySelector(tag){for(const child of this.children){if(typeof child==='string')continue;if(child.tagName===tag)return child;const nested=child.querySelector(tag);if(nested)return nested;}return null;}
  setAttribute(name){assert.ok(!/^on/i.test(name));}
  replaceChildren(...children){this.children=[...children];this.text='';}
  append(...children){this.children.push(...children);}
 }
 const document={createTextNode(text){return String(text);},createElement(tag){assert.ok(!['script','iframe','button','a','input','form','textarea'].includes(tag));tags.push(tag);return new Element(tag,document);}};
 return {mount:new Element('section',document),tags,stats:()=>({listeners,htmlAssignments})};
}
test('strict public metadata projection retains UNKNOWN and omits all private fields',()=>{
 const r=record();r.args={plaintext:'PRIVATE_TOP_ARGS'};r.ciphertext='PRIVATE_TOP_CIPHER';r.signing_wire='PRIVATE_WIRE';r.recovery={private_jwk:'PRIVATE_RECOVERY'};
 const before=JSON.stringify(r),v=view(r);assert.equal(v.status,'UNKNOWN');assert.equal(v.reason,'display_only');assert.equal(v.visible,true);assert.equal(JSON.stringify(r),before);assert.equal(v.rows.length,8);
 for(const secret of ['PRIVATE_TASK','PRIVATE_CIPHERTEXT','PRIVATE_KEY','PRIVATE_CAPABILITY','PRIVATE_TOP_ARGS','PRIVATE_TOP_CIPHER','PRIVATE_WIRE','PRIVATE_RECOVERY'])assert.ok(!joined(v).includes(secret));
 assert.ok(v.rows.some(x=>x.label.includes('UNVERIFIED; not recomputed; not a transaction hash')));assert.match(v.hashNotice,/missing hash does not prove/i);
});
test('recorded hash is labelled candidate, never FINAL proof or a reset classification',()=>{
 const r=record();r.tx_hash='1'.repeat(44);const v=view(r);assert.equal(v.status,'UNKNOWN');assert.match(v.hashNotice,/candidate only/);assert.ok(v.rows.some(x=>x.value===r.tx_hash));assert.ok(!Object.hasOwn(v,'canRetry')&&!Object.hasOwn(v,'unsigned')&&!Object.hasOwn(v,'canClear'));
});
test('missing optional fields are omitted, not invented or treated as unsigned',()=>{
 const r=record();delete r.request_id;delete r.fingerprint;delete r.tx_hash;r.intent={};const v=view(r);assert.equal(v.status,'UNKNOWN');assert.equal(v.rows.length,3);assert.match(v.hashNotice,/does not prove/);
});
test('absent local snapshot is hidden without resolved or unsigned authority',()=>{
 const v=pendingOriginalMetadata(null,context);assert.equal(v.visible,false);assert.equal(v.status,'UNKNOWN');assert.match(v.hashNotice,/not an unsigned or completed classification/);
});
test('malformed JSON/root/version/intent returns only constant UNKNOWN and no raw data',()=>{
 for(const raw of ['', '{"PRIVATE_SECRET":', '[]','null','"PRIVATE_SECRET"',JSON.stringify({...record(),version:2}),JSON.stringify({...record(),intent:null})]){const v=pendingOriginalMetadata(raw,context);assert.equal(v.status,'UNKNOWN');assert.equal(v.rows.length,0);assert.ok(!joined(v).includes('PRIVATE_SECRET'));}
});
test('oversize in character or UTF8 bytes stays unknown without parsing/echo',()=>{
 for(const raw of ['X'.repeat(PENDING_METADATA_MAX_BYTES+1),'é'.repeat(PENDING_METADATA_MAX_BYTES/2+1)]){const v=pendingOriginalMetadata(raw,context);assert.equal(v.reason,'oversize');assert.equal(v.rows.length,0);assert.equal(v.status,'UNKNOWN');}
});
test('read failure is UNKNOWN, reads once and never reports the error/ciphertext',()=>{
 let reads=0;const error=Error('PRIVATE_CIPHER_OR_PATH');const v=readPendingOriginalMetadata({context,read:()=>{reads++;throw error;}});assert.equal(reads,1);assert.equal(v.reason,'unreadable');assert.equal(v.status,'UNKNOWN');assert.ok(!joined(v).includes(error.message));
});
test('foreign network/receiver/connected account redacts every metadata row',()=>{
 for(const change of [{network:'sandbox'},{contract:'other.testnet'},{account:'other.testnet'}]){const v=view({...record(),...change});assert.equal(v.reason,'identity_mismatch');assert.equal(v.rows.length,0);assert.equal(v.status,'UNKNOWN');}
});
test('unavailable or malformed context never renders saved identity',()=>{
 for(const c of [null,{}, {...context,network:'mainnet'},{...context,company:'<img>'},{...context,account:17}]){const v=view(record(),c);assert.equal(v.status,'UNKNOWN');assert.equal(v.rows.length,0);}
});
test('disconnected account and existing app receiver remain explicitly unverified metadata only',()=>{
 const c={...context,account:null,appContract:'app.testnet'},r={...record(),contract:'app.testnet'};const v=view(r,c);assert.equal(v.status,'UNKNOWN');assert.equal(v.reason,'display_only');assert.match(v.connectionNote,/No connected-wallet identity match/);
});
test('malformed known metadata cannot inject HTML or leak a corrupted value',()=>{
 for(const change of [{account:'<img src=x onerror=alert(1)>'},{request_id:'<script>SECRET</script>'},{fingerprint:'SECRET'},{tx_hash:'javascript:SECRET'},{intent:{method:'<img SECRET>',deposit:'0',gas:'1'}},{intent:{method:'company_submit_operation',deposit:'NaN',gas:'1'}}]){const v=view({...record(),...change});assert.equal(v.status,'UNKNOWN');assert.equal(v.rows.length,0);assert.ok(!joined(v).includes('SECRET'));}
});
test('u128 boundaries are exact strings; no number coercion/overflow formatting',()=>{
 const r=record();r.intent.deposit=(2n**128n-1n).toString();assert.equal(view(r).reason,'display_only');for(const amount of [(2n**128n).toString(),'01','-1','1e3',1]){r.intent.deposit=amount;assert.equal(view(r).rows.length,0);}
});
test('unknown extra labels and prototype-shaped JSON are ignored without pollution',()=>{
 const r=record();r.rows=[{label:'PRIVATE',value:'PRIVATE_ROWS'}];r.intent.description='PRIVATE_DESCRIPTION';const raw=JSON.stringify(r).replace('"version":1','"__proto__":{"polluted":true},"version":1');const v=pendingOriginalMetadata(raw,context);assert.equal(v.reason,'display_only');assert.ok(!joined(v).includes('PRIVATE_ROWS')&&!joined(v).includes('PRIVATE_DESCRIPTION'));assert.equal({}.polluted,undefined);
});
test('projection and render never call storage writes/network/wallet or register event controls',()=>{
 let reads=0,writes=0,effects=0;const fakeStorage={getItem(){reads++;return JSON.stringify(record());},setItem(){writes++;throw Error('no');},removeItem(){writes++;throw Error('no');},clear(){writes++;throw Error('no');}};
 const saved=new Map();for(const key of ['fetch','localStorage','sessionStorage','indexedDB','navigator']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,get(){effects++;throw Error('No ambient browser/network/storage capability permitted');}});}
 try{const v=readPendingOriginalMetadata({context,read:()=>fakeStorage.getItem('fixed-key')}),d=documentFixture();renderPendingOriginalMetadata(d.mount,v);assert.equal(reads,1);assert.equal(writes,0);assert.equal(effects,0);assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});assert.match(d.mount.textContent,/Outcome UNKNOWN/);assert.match(d.mount.textContent,/cannot clear, retry or change/);assert.match(d.mount.textContent,/needs no wallet approval/);}finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}

});
test('forged render views cannot smuggle raw arguments or metadata into the panel',()=>{
 const d=documentFixture();renderPendingOriginalMetadata(d.mount,{visible:true,rows:[{label:'x',value:'PRIVATE_ARGS'}],title:'<script>PRIVATE</script>'});assert.ok(!d.mount.textContent.includes('PRIVATE'));assert.match(d.mount.textContent,/UNKNOWN/);assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
test('null hash, forged unsigned/final flags never change UNKNOWN outcome',()=>{
 for(const flags of [{unsigned:true},{status:'final',checked:{status:'final'}},{cancelled:true},{review_reset_allowed:true}])assert.equal(view({...record(),...flags}).status,'UNKNOWN');
});
test('rendering creates text nodes only and no action form/link/button',()=>{
 const d=documentFixture();renderPendingOriginalMetadata(d.mount,view());assert.equal(d.mount.hidden,false);assert.ok(d.tags.includes('details'));assert.ok(!d.tags.some(t=>['button','form','a','input','iframe','script'].includes(t)));assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
test('current sparse UI integration only wires a scoped getItem read, never new control/write ports',async()=>{
 const text=await readFile(new URL('../src/business-ui.js',import.meta.url),'utf8');const a=text.indexOf('function renderSavedActionMetadata(){'),b=text.indexOf('\nfunction notice(',a);const helper=text.slice(a,b);assert.ok(a>=0&&b>a);assert.match(helper,/localStorage\.getItem\(key\)/);for(const forbidden of ['setItem','removeItem','clearPending','savePending','inspectWalletCandidate','signAndSend','fetch(','window.prompt','selector.wallet'])assert.ok(!helper.includes(forbidden),forbidden);
});

test('visible to hidden clears all prior metadata rows rather than retaining stale values',()=>{
 const d=documentFixture(),r=record();r.tx_hash='2'.repeat(44);renderPendingOriginalMetadata(d.mount,view(r));assert.ok(d.mount.textContent.includes(r.tx_hash));renderPendingOriginalMetadata(d.mount,pendingOriginalMetadata(null,context));assert.equal(d.mount.hidden,true);assert.equal(d.mount.textContent,'');assert.equal(d.mount.children.length,0);assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
test('hidden to visible renders only the fresh safe snapshot and explicit fingerprint warning',()=>{
 const d=documentFixture();renderPendingOriginalMetadata(d.mount,pendingOriginalMetadata(null,context));assert.equal(d.mount.hidden,true);const r=record();r.request_id='c'.repeat(32);renderPendingOriginalMetadata(d.mount,view(r));assert.equal(d.mount.hidden,false);assert.ok(d.mount.textContent.includes(r.request_id));assert.match(d.mount.textContent,/UNVERIFIED; not recomputed; not a transaction hash/);assert.match(d.mount.textContent,/Outcome UNKNOWN/);assert.ok(!d.mount.textContent.includes('PRIVATE_'));assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
test('a failed read after a visible snapshot clears stale rows and keeps a generic UNKNOWN note',()=>{
 const d=documentFixture(),r=record();r.tx_hash='2'.repeat(44);renderPendingOriginalMetadata(d.mount,view(r));const failed=readPendingOriginalMetadata({context,read:()=>{throw Error('PRIVATE_ERROR_CAP_KEY_ARGS');}});renderPendingOriginalMetadata(d.mount,failed);assert.equal(d.mount.hidden,false);assert.match(d.mount.textContent,/UNKNOWN/);assert.ok(!d.mount.textContent.includes(r.tx_hash));assert.ok(!d.mount.textContent.includes('PRIVATE_ERROR'));assert.ok(!d.mount.children.some(x=>x.tagName==='details'));assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
async function exactUIHook({mount,read,render=renderPendingOriginalMetadata}){
 const text=await readFile(new URL('../src/business-ui.js',import.meta.url),'utf8'),a=text.indexOf('function renderSavedActionMetadata(){'),b=text.indexOf('\nfunction notice(',a);assert.ok(a>=0&&b>a);const exact=text.slice(a,b);const state={company:{contract:context.company},app:null,account:context.account,rehearsal:null};const sandbox={$:selector=>{assert.equal(selector,'#pending-original-metadata');return mount;},state,pendingKey:()=> 'synthetic-fixed-key',localStorage:{getItem:key=>{assert.equal(key,'synthetic-fixed-key');return read();}},readPendingOriginalMetadata,renderPendingOriginalMetadata:render,document:mount.ownerDocument};return vm.compileFunction(exact+';return renderSavedActionMetadata;',Object.keys(sandbox))(...Object.values(sandbox));
}
test('exact integration render-error fallback removes stale rows and never echoes error data',async()=>{
 const d=documentFixture();d.mount.textContent='OLD_PUBLIC_METADATA';let reads=0;const hook=await exactUIHook({mount:d.mount,read:()=>{reads++;return JSON.stringify(record());},render:()=>{throw Error('PRIVATE_ARGUMENTS_CIPHER_KEY_CAP');}});hook();assert.equal(reads,1);assert.equal(d.mount.hidden,false);assert.equal(d.mount.textContent,'Outcome UNKNOWN. Saved metadata could not be displayed. Keep the original saved request.');assert.ok(!d.mount.textContent.includes('PRIVATE_')&&!d.mount.textContent.includes('OLD_PUBLIC'));assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
test('exact integration read failure stays redacted UNKNOWN and creates no action control',async()=>{
 const d=documentFixture();let reads=0;const hook=await exactUIHook({mount:d.mount,read:()=>{reads++;throw Error('PRIVATE_ARGS_CIPHERTEXT');}});hook();assert.equal(reads,1);assert.equal(d.mount.hidden,false);assert.match(d.mount.textContent,/UNKNOWN/);assert.ok(!d.mount.textContent.includes('PRIVATE_'));assert.ok(!d.tags.some(x=>['button','form','a','input'].includes(x)));assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});

test('native open disclosure stays open across ordinary metadata rerender while rows refresh',()=>{
 const d=documentFixture(),r=record();renderPendingOriginalMetadata(d.mount,view(r));const original=d.mount.querySelector('details');assert.equal(original.open,false);original.open=true;r.intent.gas='140000000000000';renderPendingOriginalMetadata(d.mount,view(r));const updated=d.mount.querySelector('details');assert.notEqual(updated,original);assert.equal(updated.open,true);assert.ok(d.mount.textContent.includes('140000000000000'));assert.ok(!d.mount.textContent.includes('150000000000000'));assert.match(d.mount.textContent,/UNKNOWN/);assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
test('closed disclosure stays closed; hidden/error state clears the prior display-only open state',()=>{
 const d=documentFixture();renderPendingOriginalMetadata(d.mount,view());let details=d.mount.querySelector('details');details.open=true;renderPendingOriginalMetadata(d.mount,view());details=d.mount.querySelector('details');assert.equal(details.open,true);details.open=false;renderPendingOriginalMetadata(d.mount,view());assert.equal(d.mount.querySelector('details').open,false);d.mount.querySelector('details').open=true;renderPendingOriginalMetadata(d.mount,pendingOriginalMetadata(null,context));assert.equal(d.mount.querySelector('details'),null);renderPendingOriginalMetadata(d.mount,view());assert.equal(d.mount.querySelector('details').open,false);d.mount.querySelector('details').open=true;renderPendingOriginalMetadata(d.mount,pendingOriginalMetadata('{',context));assert.equal(d.mount.querySelector('details'),null);renderPendingOriginalMetadata(d.mount,view());assert.equal(d.mount.querySelector('details').open,false);assert.deepEqual(d.stats(),{listeners:0,htmlAssignments:0});
});
