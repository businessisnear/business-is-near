// Generate the browser's pure container parser from the exact on-chain source.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),req=createRequire(path.join(root,'contract/package.json')),ts=req('typescript'),source=fs.readFileSync(path.join(root,'contract/onchain/native_feed_media.ts'),'utf8'),hash=crypto.createHash('sha256').update(source).digest('hex');
const body=source.replace("import {assert,encode} from 'near-sdk-js';","const assert=(ok:boolean,message:string)=>{if(!ok)throw Error(message);};const encode=(text:string)=>new TextEncoder().encode(text);");
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const footer=`
const keys=['asset_sha256','mime_type','bytes','body_base64','width','height','duration_ms'];
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function actualDecode(raw,mime,info){
 const url=URL.createObjectURL(new Blob([raw],{type:mime}));let element,timer;
 try{await Promise.race([new Promise((resolve,reject)=>{if(mime==='image/png'){element=new Image();element.onload=()=>{try{assert(element.naturalWidth===info.width&&element.naturalHeight===info.height,'Decoded PNG dimensions changed');resolve();}catch(e){reject(e);}};element.onerror=()=>reject(Error('PNG decode failed'));element.src=url;}else{element=document.createElement('video');element.preload='metadata';element.onloadedmetadata=()=>{try{assert(element.videoWidth===info.width&&element.videoHeight===info.height&&Number.isFinite(element.duration)&&Math.abs(element.duration*1000-info.duration_ms)<=100,'Decoded MP4 metadata changed');resolve();}catch(e){reject(e);}};element.onerror=()=>reject(Error('MP4 decode failed'));element.src=url;}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Bounded media decode timeout')),5000);})]);}finally{clearTimeout(timer);if(element){element.onload=null;element.onerror=null;element.onloadedmetadata=null;element.removeAttribute('src');if(mime==='video/mp4')element.load();}URL.revokeObjectURL(url);}
}
export async function prepareFeedAsset(bytes,mime_type){
 assert(bytes instanceof Uint8Array||bytes instanceof ArrayBuffer,'Exact file bytes required');const raw=new Uint8Array(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));assert(raw.length>=1&&raw.length<=16384,'Asset must fit16KiB');assert(['image/png','video/mp4'].includes(mime_type),'PNG or silent AVC MP4 only');const info=mime_type==='image/png'?pngInfo(raw):mp4Info(raw);await actualDecode(raw,mime_type,info);const asset_sha256=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))),body_base64=btoa(Array.from(raw,x=>String.fromCharCode(x)).join(''));return {asset_sha256,mime_type,bytes:raw.length,body_base64,...info};
}
export async function validateFeedAsset(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(','),'Exact asset fields required');const captured=structuredClone(value),raw=decode64(captured.body_base64),actual=await prepareFeedAsset(raw,captured.mime_type);for(const key of keys)assert(actual[key]===captured[key],'Exact asset commitment changed');return actual;
}
`;
fs.writeFileSync(path.join(root,'web-chain/src/native-feed-media.js'),'// Generated from native_feed_media.ts SHA256 '+hash+'; see scripts/build_native_feed_media.mjs.\n'+js+footer);
