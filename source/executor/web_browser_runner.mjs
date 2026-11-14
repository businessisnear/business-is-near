// Trusted acceptance controller. Candidate HTML/CSS/JS is served as data and
// executes only in Chrome, never imported/evaluated by this Node process.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {chromium}=await import(pathToFileURL(config.playwright_module).href);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const denied=error=>['EPERM','EACCES'].includes(error?.code);
function deniedFileRead(file){try{fs.readFileSync(file);return false;}catch(error){return denied(error);}}
function deniedWrite(file){try{fs.writeFileSync(file,'tampered');return false;}catch(error){return denied(error);}}
function deniedSocket(host,port){return new Promise(resolve=>{const socket=net.createConnection({host,port});socket.once('error',error=>resolve(denied(error)));socket.once('connect',()=>{socket.destroy();resolve(false);});socket.setTimeout(2000,()=>{socket.destroy();resolve(false);});});}
const probes={private_temp_file_read_denied:deniedFileRead(config.canary),source_write_denied:deniedWrite(path.join(config.source,config.entrypoint)),trusted_harness_write_denied:deniedWrite(process.argv[2]),other_loopback_socket_denied:await deniedSocket('127.0.0.1',config.forbidden_port),external_socket_denied:await deniedSocket('1.1.1.1',443)};
if(!Object.values(probes).every(value=>value===true))throw Error('Required OS boundary probe failed');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
const origin='http://127.0.0.1:'+config.port;
const referenceFiles=new Set(config.reference_files??[]);
// Decode reference/screenshot bytes in a separate blank trusted browser world.
// Candidate scripts cannot replace these canvas APIs or the measured bytes.
async function pixelDifference(browser,actual,reference,tolerance){
 const trusted=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
 try{const page=await trusted.newPage();return await page.evaluate(async({a,b,t})=>{
  async function pixels(text){const raw=Uint8Array.from(atob(text),c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([raw],{type:'image/png'}));
   if(bitmap.width<1||bitmap.height<1||bitmap.width>512||bitmap.height>512)throw Error('Pixel bounds');
   const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const p=ctx.getImageData(0,0,bitmap.width,bitmap.height);bitmap.close();return p;}
  const actual=await pixels(a),expected=await pixels(b);if(actual.width!==expected.width||actual.height!==expected.height)throw Error('Reference dimensions changed');
  let changed_pixels=0,max_channel_delta=0,total=0;for(let i=0;i<actual.data.length;i+=4){let changed=false;for(let j=0;j<4;j++){const d=Math.abs(actual.data[i+j]-expected.data[i+j]);max_channel_delta=Math.max(max_channel_delta,d);total+=d;if(d>t)changed=true;}if(changed)changed_pixels++;}
  return {changed_pixels,max_channel_delta,total_channel_delta:total,width:actual.width,height:actual.height};
 },{a:actual.toString('base64'),b:reference.toString('base64'),t:tolerance});}finally{await trusted.close();}
}
const publicFiles=new Set(config.public_files);
const csp="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const server=http.createServer((request,response)=>{
 response.setHeader('Content-Security-Policy',csp);response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-DNS-Prefetch-Control','off');response.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
 if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}
 let url;try{url=new URL(request.url,origin);}catch{response.writeHead(400);response.end();return;}
 const name=url.pathname==='/'?config.entrypoint:url.pathname.slice(1);
 if(url.origin!==origin||url.search||request.url.includes('%')||!publicFiles.has(name)){response.writeHead(404);response.end();return;}
 try{const bytes=fs.readFileSync(path.join(config.source,name));response.writeHead(200,{'Content-Type':MIME[path.extname(name)]});response.end(request.method==='HEAD'?undefined:bytes);}catch{response.writeHead(404);response.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve);});
if((await fetch(origin+'/'+config.entrypoint)).status!==200)throw Error('Approved local preview failed');

let browser;
try{
 // Chromium's nested seatbelt sandbox crashes under this inherited profile.
 // The verified outer sandbox-exec regular-file/network/write policy remains
 // mandatory for the controller and all browser descendants. No fallback runs
 // outside it; this is not a claim of Chromium inner-sandbox/VM/TEE isolation.
 browser=await chromium.launch({headless:true,chromiumSandbox:false,executablePath:config.chrome,args:['--disable-breakpad','--disable-crash-reporter','--dns-prefetch-disable']});
 const bindingContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});const bindingPage=await bindingContext.newPage();
 probes.browser_has_no_node_bindings=await bindingPage.evaluate(()=>typeof process==='undefined'&&typeof require==='undefined'&&typeof Buffer==='undefined');await bindingContext.close();
 for(const [name,target] of [['browser_private_temp_file_denied',pathToFileURL(config.canary).href],['browser_other_loopback_denied','http://127.0.0.1:'+config.forbidden_port+'/'],['browser_external_network_denied','https://1.1.1.1/']]){
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false}),page=await context.newPage();let blocked=false;
  try{await page.goto(target,{timeout:4000});}catch(error){blocked=/ACCESS_DENIED/.test(error.message);}
  await context.close();probes[name]=blocked;
 }
 if(!Object.values(probes).every(value=>value===true))throw Error('Required actual browser boundary probe failed');
 const tests=[],screenshots=[];
 for(const viewport of config.acceptance.viewports){
  const context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});const violations=[];let pageErrors=0,dialogs=0,downloads=0;
  await context.route('**/*',async route=>{const request=route.request();let url;try{url=new URL(request.url());}catch{violations.push(sha(request.url()));await route.abort();return;}const file=url.pathname==='/'?config.entrypoint:url.pathname.slice(1);if(url.origin!==origin||url.search||url.hash||!['GET','HEAD'].includes(request.method())||!publicFiles.has(file)&&url.pathname!=='/favicon.ico'){violations.push(sha(request.url()));await route.abort();return;}await route.continue();});
  const page=await context.newPage();page.on('pageerror',()=>pageErrors++);page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});page.on('download',async download=>{downloads++;await download.cancel();});
  await page.goto(origin+'/'+config.entrypoint,{waitUntil:'load',timeout:10000});
  for(const [index,check] of config.acceptance.checks.entries()){
   let passed=false,observed={};
   try{
    if(check.kind==='no_horizontal_overflow'){observed=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));passed=observed.document<=observed.viewport;}
    else if(check.kind==='visible'){passed=await page.locator(check.selector).isVisible();}
    else if(check.kind==='text'){const text=await page.locator(check.selector).innerText({timeout:2000});observed={text_sha256:sha(text)};passed=text.includes(check.contains);}
    else if(check.kind==='fill'){await page.locator(check.selector).fill(check.value,{timeout:2000});passed=true;}
    else if(check.kind==='click'){await page.locator(check.selector).click({timeout:2000});passed=true;}
    else if(check.kind==='box'){const box=await page.locator(check.selector).boundingBox({timeout:2000});observed=box?Object.fromEntries(Object.entries(box).map(([key,value])=>[key,Math.round(value*100)/100])):{};passed=!!box&&box.width>=check.min_width&&box.height>=check.min_height;}
    else if(check.kind==='count'){const count=await page.locator(check.selector).count();observed={count};passed=count===check.equals;}
    else if(check.kind==='brand_style'){
     const cdp=await context.newCDPSession(page);try{await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument'),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:check.selector});
      if(!nodeId)throw Error('Missing brand element');const {computedStyle}=await cdp.send('CSS.getComputedStyleForNode',{nodeId}),actual=computedStyle.find(v=>v.name===check.property)?.value;
      observed={actual_style_sha256:sha(actual??''),expected_style_sha256:sha(check.equals)};passed=actual===check.equals;
     }finally{await cdp.detach();}
    }
    else if(check.kind==='reference_png'){
     if(!referenceFiles.has(check.reference))throw Error('Unapproved reference');const expected=fs.readFileSync(path.join(config.source,check.reference));if(sha(expected)!==check.reference_sha256)throw Error('Reference bytes changed');
     const actual=await page.screenshot({clip:check.clip,animations:'disabled',timeout:10000});observed=await pixelDifference(browser,actual,expected,check.channel_tolerance);
     observed.reference_sha256=sha(expected);observed.actual_region_sha256=sha(actual);passed=observed.changed_pixels<=check.max_changed_pixels;
    }
   }catch{passed=false;observed={error:'acceptance_action_failed'};}
   tests.push({viewport,index,kind:check.kind,passed,observed});
  }
  tests.push({viewport,kind:'no_unapproved_requests',passed:violations.length===0,observed:{blocked_request_count:violations.length,blocked_request_hashes:violations}});
  tests.push({viewport,kind:'no_unhandled_page_errors_or_dialogs',passed:pageErrors===0&&dialogs===0&&downloads===0,observed:{page_errors:pageErrors,dialogs,downloads}});
  const name='viewport-'+viewport.width+'x'+viewport.height+'.png',file=path.join(config.output,name);await page.screenshot({path:file,fullPage:true,timeout:10000});const bytes=fs.readFileSync(file);screenshots.push({file:name,sha256:sha(bytes),bytes:bytes.length,viewport});await context.close();
 }
 const result={schema:1,passed:tests.every(check=>check.passed),tests:tests.length,checks:tests,screenshots,browser_version:browser.version(),isolation:{backend:'macos_sandbox_exec',regular_file_allowlist:true,network:'one_loopback_tcp_port_and_scratch_unix_sockets',chromium_inner_sandbox:false,boundary_probes:probes,limits:'Directory/device metadata and system services are not a VM or TEE boundary.'}};
 await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));
 fs.writeFileSync(path.join(config.output,'result.json'),JSON.stringify(result));console.log(JSON.stringify({completed:true,result_sha256:sha(JSON.stringify(result))}));
}finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
