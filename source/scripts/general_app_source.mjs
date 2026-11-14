// Pure bounded source export. Neither model text nor a request selects a path.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {prepareNativeSchema,accountId,codePin} from '../web-chain/src/native-app-actions.js';
export const GENERAL_APP_SOURCE_FILES=Object.freeze([
 'executor/outcome.mjs','scripts/general_app_source.mjs','scripts/build_native_app.mjs','scripts/setup_near_sdk_arm.py',
 'contract/onchain/app.ts','contract/package.json','contract/package-lock.json',
 'web-chain/general-app.html','web-chain/vite.general.config.js','web-chain/package.json','web-chain/package-lock.json',
 'web-chain/src/app-generation-actions.js','web-chain/src/audio-results.js','web-chain/src/browser-buffer.js',
 'web-chain/src/business-actions.js','web-chain/src/claim-review.js','web-chain/src/cloud-media-results.js','web-chain/src/conversation-actions.js',
 'web-chain/src/crypto.js','web-chain/src/document-input.js','web-chain/src/document-messages.js',
 'web-chain/src/general-app-console.js','web-chain/src/goal-plan-actions.js','web-chain/src/goal-plan-messages.js',
 'web-chain/src/image-results.js','web-chain/src/knowledge-actions.js','web-chain/src/knowledge-input.js',
 'web-chain/src/leads-actions.js','web-chain/src/leads-messages.js','web-chain/src/localization.js','web-chain/src/workspace-messages.js',
 'web-chain/src/native-app-actions.js','web-chain/src/native-app-sealed.js','web-chain/src/native-app.css','web-chain/src/workspace-theme.css',
 'web-chain/src/static-web-repair-results.js','web-chain/src/wallet-sdk.js',
]);
const ROOT=fileURLToPath(new URL('../',import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const builtName=n=>n==='web-chain/dist/general-app.html'||/^web-chain\/dist\/assets\/[A-Za-z0-9_-]+\.(?:js|css|woff2?|svg|png)$/.test(n);
async function regular(root,name){const file=path.join(root,name);assert.equal(await fs.realpath(file),file,'Source path must be real');const s=await fs.lstat(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size<=2*1024*1024,'Bounded regular source file required');return fs.readFile(file);}
export async function buildGeneralAppSource({schema,appId,appCodeHash,root=ROOT,bundleDir=path.join(root,'web-chain/dist')}){
 accountId(appId);codePin(appCodeHash,appCodeHash);const prepared=await prepareNativeSchema(schema);
 const files=[];let total=0;const add=(name,data)=>{total+=data.length;assert.ok(total<=12*1024*1024,'Source archive exceeds 12 MiB');files.push({path:name,size:data.length,sha256:sha(data),encoding:'base64',content:data.toString('base64')});};
 for(const name of GENERAL_APP_SOURCE_FILES)add(name,await regular(root,name));
 add('web-chain/dist/general-app.html',await regular(bundleDir,'general-app.html'));
 for(const name of (await fs.readdir(path.join(bundleDir,'assets'))).sort()){const target='web-chain/dist/assets/'+name;assert.ok(builtName(target),'Unexpected compiled asset');add(target,await regular(bundleDir,'assets/'+name));}
 return {profile:'native-record-app-editable-source-v1',manifest:{app_id:appId,app_code_hash:appCodeHash,schema:prepared.schema,schema_hash:prepared.schema_hash,source_only:true,private_data_included:false,operator_configuration_included:false,dependencies_included:false,rebuild:{frontend:['npm','--prefix','web-chain','run','build','--','--config','vite.general.config.js'],contract:['node','scripts/build_native_app.mjs']},runtime:'Serve the rebuilt frontend through an explicitly configured reviewed record_collection local service. Restoring source grants no signer, model, RPC, deployment or account authority.'},files};
}
export async function restoreGeneralAppSource(bundle,destination){
 assert.deepEqual(Object.keys(bundle).sort(),['files','manifest','profile']);assert.equal(bundle.profile,'native-record-app-editable-source-v1');assert.ok(Array.isArray(bundle.files)&&bundle.files.length<=256);
 const prepared=await prepareNativeSchema(bundle.manifest.schema);assert.equal(prepared.schema_hash,bundle.manifest.schema_hash);accountId(bundle.manifest.app_id);codePin(bundle.manifest.app_code_hash,bundle.manifest.app_code_hash);
 const names=new Set();let total=0;const checked=bundle.files.map(f=>{assert.deepEqual(Object.keys(f).sort(),['content','encoding','path','sha256','size']);assert.ok(GENERAL_APP_SOURCE_FILES.includes(f.path)||builtName(f.path),'Closed restore path');assert.ok(!names.has(f.path),'Duplicate source path');names.add(f.path);assert.equal(f.encoding,'base64');assert.ok(typeof f.content==='string'&&f.content.length<=3*1024*1024);const data=Buffer.from(f.content,'base64');assert.equal(data.toString('base64'),f.content);assert.equal(data.length,f.size);assert.equal(sha(data),f.sha256);total+=data.length;assert.ok(total<=12*1024*1024);return [f.path,data];});
 for(const name of GENERAL_APP_SOURCE_FILES)assert.ok(names.has(name),'Missing editable source');assert.ok(names.has('web-chain/dist/general-app.html'));
 const absolute=path.resolve(destination);await fs.mkdir(absolute,{mode:0o700});assert.equal(await fs.realpath(absolute),absolute);assert.deepEqual(await fs.readdir(absolute),[],'Restore only into a new empty directory');
 for(const [name,data]of checked){const file=path.join(absolute,name);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,data,{flag:'wx',mode:0o600});}
 await fs.writeFile(path.join(absolute,'native-record-app-manifest.json'),JSON.stringify(bundle.manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return {profile:bundle.profile,files:checked.length,schema_hash:prepared.schema_hash,executed_commands:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 assert.equal(process.argv[2],'restore');assert.equal(process.argv.length,5);const s=await fs.lstat(process.argv[3]);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size<=20*1024*1024);const bundle=JSON.parse(await fs.readFile(process.argv[3],'utf8'));console.log(JSON.stringify(await restoreGeneralAppSource(bundle,process.argv[4])));
}
