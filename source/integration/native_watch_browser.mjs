// Explicit local fixture: REAL shipped HTTP authentication, handlers and UI;
// test-only Node-held owner signs the same NEP413 messages/one publication.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer as viteServer} from '../web-chain/node_modules/vite/dist/node/index.js';
import {chromium} from '../web-chain/node_modules/playwright/index.mjs';
import {serializeNep413} from '../web-chain/node_modules/@near-wallet-selector/core/index.js';
import {canonical} from '../scripts/company-exit.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
// Raw company:task:<id> has no embedded id. Preserve its exact bytes and add
// the separately bound storage key only to the existing result view shape.
export function taskForBusinessRecovery(proof){
 assert.equal(proof?.format,'native-editorial-record-proof-v1');assert.equal(proof.kind,'task');assert.match(proof.id,/^[A-Za-z0-9_-]{1,64}$/);assert.ok(proof.record&&typeof proof.record==='object'&&!Array.isArray(proof.record));assert.equal(Object.hasOwn(proof.record,'id'),false,'Raw task cannot override its separately bound key');
 const raw=Buffer.from(proof.raw_base64,'base64');assert.equal(raw.toString('base64'),proof.raw_base64);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),proof.raw_sha256);assert.equal(canonical(JSON.parse(raw.toString())),canonical(proof.record));
 return {...structuredClone(proof.record),id:proof.id};
}
async function port(){const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const n=socket.address().port;await new Promise(r=>socket.close(r));return n;}
export async function startNativeWatchBrowser({temp,configuration,company_id,company_code_hash,owner_id,ownerKey,python,onPublish,videoOutput}){
 const privatePort=await port(),uiPort=await port(),origin='http://127.0.0.1:'+uiPort,token=crypto.randomBytes(32).toString('base64url'),configFile=path.join(temp,'private-server.json'),privateRoot=path.join(temp,'private-api');let service,web,browser,context,recordedPage,videoMetadata=null,ready=false;const calls={sign_message:0,publication_wallet:0,external_requests:0};
 await fs.writeFile(configFile,JSON.stringify({schema:1,origin,port:privatePort,data_dir:privateRoot,authority:{...configuration,companies:{[company_id]:company_code_hash},sandbox:true}}),{mode:0o600,flag:'wx'});
 async function close(){
  let failure=null;
  try{if(context){const own=context;context=null;const video=recordedPage?.video();await own.close();if(video){const destination=path.join(videoOutput,'owner-native-watch.webm');await video.saveAs(destination);await fs.chmod(destination,0o600);const bytes=await fs.readFile(destination);assert.ok(bytes.length>1000,'Actual UI video must contain frames');videoMetadata={file:'owner-native-watch.webm',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,width:1280,height:720,format:'webm',actual_browser_recording:true,context_closed_before_save:true};await video.delete();}}}catch(e){failure=e;}
  try{if(browser){await browser.close();browser=null;}}catch(e){failure??=e;}
  try{if(web){await web.close();web=null;}}catch(e){failure??=e;}
  if(service){const own=service;service=null;if(own.exitCode===null){own.kill('SIGTERM');await new Promise(r=>own.once('exit',r));}}
  if(failure)throw failure;return videoMetadata;
 }

 try{
  service=spawn(python,['-B','-m','executor.private_workspace_server','--config',configFile],{cwd:ROOT,env:{PATH:process.env.PATH,LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});let errors='';service.stderr.on('data',x=>{errors+=x;if(errors.length>16384)service.kill('SIGTERM');});
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Owner host readiness timed out')),15000);service.stdout.on('data',b=>{output+=b;if(output.includes('\n')){try{assert.equal(JSON.parse(output.trim()).ready,true);clearTimeout(timer);ready=true;resolve();}catch(e){reject(e);}}});service.once('exit',()=>{if(!ready){clearTimeout(timer);reject(Error('Owner host exited before readiness'));}});});
  const middleware={name:'native-watch-explicit-seeded-owner-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(!req.url?.startsWith('/__native_watch_fixture/'))return next();const route=req.url.slice('/__native_watch_fixture/'.length);res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   try{
    if(route==='config'&&req.method==='GET'){res.end(JSON.stringify({fixture:true,network:'sandbox',model_calls:0,provider_requests:0,owner_id,company_id,token}));return;}
    assert.equal(req.method,'POST');assert.equal(req.headers.origin,origin);assert.equal(req.headers['x-native-watch-fixture'],token);let text='';for await(const part of req){text+=part;assert.ok(text.length<=131072);}const value=JSON.parse(text);
    if(route==='sign-message'){assert.ok(value.recipient===origin||value.recipient==='proofwork-native-source-watch-v1:'+company_id);assert.ok(typeof value.message==='string'&&value.message.length<2048);assert.equal(value.nonce.length,32);if(value.callbackUrl!==undefined)assert.equal(value.callbackUrl,origin+'/wallet-auth-callback.html');const bytes=serializeNep413({message:value.message,nonce:Buffer.from(value.nonce),recipient:value.recipient,...(value.callbackUrl?{callbackUrl:value.callbackUrl}:{})}),signed={accountId:owner_id,publicKey:ownerKey.getPublicKey().toString(),signature:Buffer.from(ownerKey.sign(crypto.createHash('sha256').update(bytes).digest()).signature).toString('base64')};calls.sign_message++;if(value.state)signed.state=value.state;res.end(JSON.stringify(signed));return;}
    if(route==='send'){assert.equal(calls.publication_wallet,0,'One browser publication dispatch only');calls.publication_wallet++;await onPublish(value.transaction);throw Error('Synthetic acknowledgement lost AFTER actual one-shot publication broadcast');}
    throw Error('Unknown fixture action');
   }catch(error){await fs.writeFile(path.join(temp,'fixture-wallet-last-result.json'),JSON.stringify({route,error_kind:error.name,message:String(error.message).slice(0,500)}),{mode:0o600});res.statusCode=409;res.end(JSON.stringify({error:'Original seeded wallet result unresolved; never retry'}));}
  });}};
  web=await viteServer({root:path.join(ROOT,'web-chain'),configFile:path.join(ROOT,'web-chain/vite.config.js'),plugins:[middleware],server:{host:'127.0.0.1',port:uiPort,strictPort:true,hmr:false,watch:null,proxy:{'/__private':{target:'http://127.0.0.1:'+privatePort,changeOrigin:true}}},logLevel:'error'});await web.listen();
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const recordDirectory=path.join(temp,'browser-recording');await fs.mkdir(recordDirectory,{mode:0o700});assert.ok(path.isAbsolute(videoOutput),'Private absolute video output required');context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:recordDirectory,size:{width:1280,height:720}},serviceWorkers:'block',acceptDownloads:false});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){calls.external_requests++;return route.abort();}return route.continue();});const page=await context.newPage();recordedPage=page;const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message.slice(0,200)));await page.goto(origin+'/native-watch.html?rehearsal=1',{waitUntil:'networkidle'});await page.locator('#watch-fixture-boundary').waitFor();
  async function api(action,payload={},expected=200,options={}){return page.evaluate(async({action,payload,expected,options,company_id})=>{const csrf=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('proofwork_owner_csrf='))?.split('=')[1],r=await fetch('/__private/native-watch/'+action,{method:'POST',credentials:options.noCookies?'omit':'same-origin',headers:{'Content-Type':'application/json',...(!options.noCSRF&&csrf?{'X-Proof-CSRF':csrf}:{})},body:JSON.stringify({company_id,...payload})});if(r.status!==expected)throw Error('Actual private '+action+' status '+r.status+' expected '+expected);return r.json();},{action,payload,expected,options,company_id});}
  return {page,api,calls,pageErrors,browserVersion:browser.version(),origin,privateRoot,async authenticate(){await api('status',{watch_id:'competitor_watch'},403,{noCookies:true});await page.locator('#watch-auth').click();await page.waitForFunction(()=>document.querySelector('#watch-auth-status').textContent.startsWith('Authenticated '));await api('status',{watch_id:'competitor_watch'},403,{noCSRF:true});},async screenshot(destination){await page.screenshot({path:destination,fullPage:true});},close};
 }catch(e){await close();throw e;}
}
