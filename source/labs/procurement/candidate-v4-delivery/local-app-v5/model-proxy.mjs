// Optional standalone reproduction helper. Starts no model and reads no key.
// The caller supplies an already running loopback Ollama with the pinned cache.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {MODEL,companyInput,plannerRequest,PLANNER_RESPONSE_SCHEMA,validatePlannerCompletion} from './company-loop.mjs';
export const MODEL_DIGEST='b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2';
export const DEFAULT_INPUT=Object.freeze({name:'Harbor Studio',goal:'Prepare a factual offer for owner review',facts:'One-hour photography session with five edited images.',budget:'400000000000000000000000'});
const check=(v,m)=>{if(!v)throw Error(m);};
export const decodeProxyJSON=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const canonical=v=>JSON.stringify(v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):v);
function origin(value){const u=new URL(value);check(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&Number(u.port)>=1024&&Number(u.port)<=65535&&u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash,'Literal loopback Ollama origin required');return u.origin;}
async function localTransport(url,{method,body,limit,timeout}){
 const r=await fetch(url,{method,redirect:'error',credentials:'omit',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});check(r.ok&&r.body,'Local Ollama response unavailable');const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;check(size<=limit,'Local Ollama response too large');chunks.push(chunk);}return decodeProxyJSON(Buffer.concat(chunks));
}
export function createAdvisorySession({ollamaOrigin,input=DEFAULT_INPUT,transport=localTransport}){
 const base=origin(ollamaOrigin),expected={...plannerRequest(companyInput(input)),max_tokens:512,stream:false};
 let accepted=false,modelAttempted=false,resultReceived=false,completed=false;
 return{
  expectedRequest:()=>structuredClone(expected),
  status:()=>({accepted,model_attempted:modelAttempted,result_received:resultReceived,completed,original_model_call_unknown:modelAttempted&&!resultReceived,max_model_attempts:1}),
  async complete(incoming){
   check(canonical(incoming)===canonical(expected),'Exact approved reproduction input and completion contract required');check(!accepted,'Original advisory request is never replayed');accepted=true;
   const tags=await transport(base+'/api/tags',{method:'GET',limit:1048576,timeout:5000});const matches=tags?.models?.filter(m=>m.name===MODEL);check(Array.isArray(matches)&&matches.length===1&&matches[0].digest===MODEL_DIGEST,'Pinned cached local model digest required');
   modelAttempted=true;
   const result=await transport(base+'/api/chat',{method:'POST',limit:16000,timeout:40000,body:{model:MODEL,messages:expected.messages,stream:false,think:false,format:PLANNER_RESPONSE_SCHEMA,keep_alive:'2m',options:{temperature:0,num_ctx:4096,num_predict:512}}});resultReceived=true;
   check(result?.model===MODEL&&result.done===true&&result.done_reason==='stop'&&result.message?.role==='assistant'&&typeof result.message.content==='string'&&(!result.message.tool_calls||Array.isArray(result.message.tool_calls)&&result.message.tool_calls.length===0),'Complete pinned tool-less model result required');
   check(Number.isSafeInteger(result.prompt_eval_count)&&result.prompt_eval_count>=0&&Number.isSafeInteger(result.eval_count)&&result.eval_count>=0&&result.eval_count<=512,'Bounded actual token counts required');
   const completion={choices:[{message:{role:'assistant',content:result.message.content}}]};validatePlannerCompletion(completion);completed=true;
   return{model:MODEL,choices:[{message:completion.choices[0].message,finish_reason:'stop'}],usage:{prompt_tokens:result.prompt_eval_count,completion_tokens:result.eval_count,total_tokens:result.prompt_eval_count+result.eval_count}};
  }
 };
}
export async function serveAdvisoryProxy({ollamaOrigin,input=DEFAULT_INPUT}){
 const session=createAdvisorySession({ollamaOrigin,input});let server,url,stopped=false;
 const stop=async()=>{if(stopped)return;stopped=true;server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({proxy_stopped:true,...session.status(),model_service_owned_by_user:true}));};
 server=http.createServer(async(req,res)=>{
  try{
   check(req.method==='POST'&&req.url==='/v1/chat/completions'&&req.headers.host===new URL(url).host&&!req.headers.origin&&!req.headers.authorization&&req.headers['content-type']==='application/json','Exact local server completion route required');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;check(size<=12000,'Bounded completion request required');chunks.push(chunk);}
   const value=await session.complete(decodeProxyJSON(Buffer.concat(chunks)));res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));
  }catch(error){res.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:error.message,no_retry:true}));}
  finally{if(session.status().accepted){const timer=setTimeout(()=>void stop(),2000);timer.unref();}}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/v1/chat/completions';const timer=setTimeout(()=>void stop(),600000);timer.unref();process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
 console.log(JSON.stringify({url,model:MODEL,model_digest:MODEL_DIGEST,max_model_attempts:1,max_tokens:512,finite_idle_seconds:600,starts_or_stops_model:false}));return{url,stop};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){check(process.argv.length===3||process.argv.length===4,'Usage: node model-proxy.mjs http://127.0.0.1:OLLAMA_PORT [private-input.json]');const input=process.argv[3]?JSON.parse(await fs.readFile(process.argv[3],'utf8')):DEFAULT_INPUT;await serveAdvisoryProxy({ollamaOrigin:process.argv[2],input});}
